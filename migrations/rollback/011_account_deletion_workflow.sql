begin;

do $$
begin
  if exists (select 1 from public.account_deletion_requests r
    left join auth.users u on u.id = r.account_id where u.id is null)
    or exists (select 1 from public.account_deletion_requests where
      reviewed_at is not null or ordinary_state <> 'pending' or held_state <> 'pending'
      or generation <> 0 or lease_token is not null or failures <> 0 or last_error_code is not null) then
    raise exception 'Deletion workflow contains durable or progressed requests; rollback refused';
  end if;
end;
$$;

drop index if exists public.account_deletion_requests_due_idx;
drop index if exists public.account_deletion_requests_review_due_idx;
drop index if exists public.account_deletion_requests_ordinary_due_idx;
alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_workflow_check;
drop trigger if exists set_deletion_request_deadlines on public.account_deletion_requests;
drop function if exists public.set_deletion_request_deadlines();

alter table public.account_deletion_requests
  drop column if exists review_due_at,
  drop column if exists ordinary_due_at,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists ordinary_state,
  drop column if exists held_state,
  drop column if exists next_run_at,
  drop column if exists generation,
  drop column if exists lease_token,
  drop column if exists lease_until,
  drop column if exists failures,
  drop column if exists last_error_code;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_account_id_fkey
  foreign key (account_id) references auth.users(id);

revoke all on public.account_deletion_requests from public, anon, authenticated, service_role;
grant select, insert on public.account_deletion_requests to service_role;

commit;
