begin;

-- One reviewed stage only. Completion here is not whole-account deletion.
create table if not exists public.deletion_progress_plans (
  request_id uuid primary key references public.account_deletion_requests(id),
  account_id uuid not null unique,
  plan_hash text not null check (plan_hash ~ '^[a-f0-9]{64}$'),
  schema_hash text not null check (schema_hash ~ '^[a-f0-9]{64}$'),
  rows_hash text not null check (rows_hash ~ '^[a-f0-9]{64}$'),
  counts jsonb not null,
  approved_at timestamptz,
  approved_by text,
  completed_at timestamptz,
  check ((approved_at is null and approved_by is null) or
    (approved_at is not null and nullif(btrim(approved_by),'') is not null)),
  check (completed_at is null or approved_at is not null)
);

alter table public.deletion_progress_plans enable row level security;
revoke all on public.deletion_progress_plans from public,anon,authenticated,service_role;
grant select,insert,update on public.deletion_progress_plans to service_role;

create or replace function public.guard_progress_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then
    raise exception 'Progress plan must remain';
  end if;
  if old.completed_at is not null and new is distinct from old then
    raise exception 'Completed progress plan cannot change';
  end if;
  if old.approved_at is not null then
    if (new.request_id,new.account_id,new.plan_hash,new.schema_hash,new.rows_hash,new.counts)
      is distinct from
      (old.request_id,old.account_id,old.plan_hash,old.schema_hash,old.rows_hash,old.counts)
      or ((new.approved_at,new.approved_by) is distinct from (old.approved_at,old.approved_by)
        and (new.approved_at is not null or new.approved_by is not null)) then
      raise exception 'Revoke approval before changing progress plan';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_progress_plan on public.deletion_progress_plans;
create trigger guard_progress_plan before update or delete on public.deletion_progress_plans
for each row execute function public.guard_progress_plan();

create or replace function public.freeze_deleted_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare plan record;
begin
  -- Old transaction snapshots cannot safely see a newly completed freeze.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Progress is unavailable';
  end if;
  for plan in select p.completed_at from public.deletion_progress_plans p
    where p.account_id=new.user_id
      or (tg_op='UPDATE' and p.account_id=old.user_id)
    for share
  loop
    if plan.completed_at is not null then
      raise exception 'Progress is unavailable';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists freeze_deleted_progress on public.user_progress;
create trigger freeze_deleted_progress before insert or update on public.user_progress
for each row execute function public.freeze_deleted_progress();
drop trigger if exists freeze_deleted_progress on public.course_progress;
create trigger freeze_deleted_progress before insert or update on public.course_progress
for each row execute function public.freeze_deleted_progress();

revoke all on function public.guard_progress_plan() from public,anon,authenticated;
revoke all on function public.freeze_deleted_progress() from public,anon,authenticated;

commit;
