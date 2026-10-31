begin;

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_account_id_fkey,
  add column if not exists review_due_at timestamptz,
  add column if not exists ordinary_due_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists ordinary_state text not null default 'pending',
  add column if not exists held_state text not null default 'pending',
  add column if not exists next_run_at timestamptz,
  add column if not exists generation bigint not null default 0,
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists failures integer not null default 0,
  add column if not exists last_error_code text;

update public.account_deletion_requests set
  review_due_at = coalesce(review_due_at, requested_at + interval '7 days'),
  ordinary_due_at = coalesce(ordinary_due_at, requested_at + interval '30 days'),
  next_run_at = case when review_due_at is null and ordinary_due_at is null
    then requested_at else next_run_at end
where review_due_at is null or ordinary_due_at is null;

alter table public.account_deletion_requests
  alter column review_due_at set not null,
  alter column ordinary_due_at set not null;

create or replace function public.set_deletion_request_deadlines()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.review_due_at := new.requested_at + interval '7 days';
    new.ordinary_due_at := new.requested_at + interval '30 days';
    new.next_run_at := new.requested_at;
  elsif new.requested_at is distinct from old.requested_at
     or new.review_due_at is distinct from old.review_due_at
     or new.ordinary_due_at is distinct from old.ordinary_due_at then
    raise exception 'Original deletion request deadlines cannot change';
  end if;
  return new;
end;
$$;

drop trigger if exists set_deletion_request_deadlines on public.account_deletion_requests;
create trigger set_deletion_request_deadlines
before insert or update on public.account_deletion_requests
for each row execute function public.set_deletion_request_deadlines();

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.account_deletion_requests'::regclass
    and conname = 'account_deletion_requests_workflow_check') then
    alter table public.account_deletion_requests add constraint account_deletion_requests_workflow_check check (
      ordinary_state in ('pending', 'review_required', 'done')
      and held_state in ('pending', 'review_required', 'held', 'done')
      and (reviewed_at is null and reviewed_by is null or reviewed_at is not null and nullif(btrim(reviewed_by), '') is not null)
      and (lease_token is null) = (lease_until is null)
      and generation >= 0 and failures >= 0
    );
  end if;
end;
$$;

create index if not exists account_deletion_requests_due_idx
  on public.account_deletion_requests(next_run_at)
  where next_run_at is not null;
create index if not exists account_deletion_requests_review_due_idx
  on public.account_deletion_requests(review_due_at)
  where reviewed_at is null;
create index if not exists account_deletion_requests_ordinary_due_idx
  on public.account_deletion_requests(ordinary_due_at)
  where ordinary_state <> 'done';

revoke all on public.account_deletion_requests from public, anon, authenticated, service_role;
grant select, insert, update on public.account_deletion_requests to service_role;
revoke all on function public.set_deletion_request_deadlines() from public, anon, authenticated;

commit;
