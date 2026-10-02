begin;

create or replace function public.claim_deletion_requests(batch_size integer default 10)
returns table(request_id uuid, account_id uuid, generation bigint, lease_token uuid)
language sql security definer set search_path = '' as $$
  update public.account_deletion_requests r set
    generation=r.generation+1, lease_token=gen_random_uuid(),
    lease_until=now()+interval '5 minutes'
  where r.id in (
    select q.id from public.account_deletion_requests q
    where q.next_run_at <= now()
      and (q.ordinary_state <> 'done' or q.held_state <> 'done')
      and (q.lease_until is null or q.lease_until <= now())
    order by q.next_run_at,q.id for update skip locked
    limit greatest(0,least(coalesce(batch_size,10),10))
  ) returning r.id,r.account_id,r.generation,r.lease_token;
$$;

-- Dispatch cannot approve ownership, extend request deadlines or mark cleanup done.
create or replace function public.settle_deletion_dispatch(
  request_id uuid, claim_generation bigint, claim_token uuid, failed boolean default false
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.account_deletion_requests r set
    ordinary_state=case when r.ordinary_state='done' then 'done' else 'review_required' end,
    held_state=case when r.held_state in ('done','held') then r.held_state else 'review_required' end,
    failures=r.failures+case when failed then 1 else 0 end,
    last_error_code=case when failed then 'dispatch_failed' else 'review_required' end,
    next_run_at=now()+case when failed then interval '1 hour' else interval '1 day' end,
    lease_token=null,lease_until=null
  where r.id=request_id and r.generation=claim_generation and r.lease_token=claim_token
    and r.lease_until>now();
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

revoke all on function public.claim_deletion_requests(integer) from public,anon,authenticated;
revoke all on function public.settle_deletion_dispatch(uuid,bigint,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_deletion_requests(integer) to service_role;
grant execute on function public.settle_deletion_dispatch(uuid,bigint,uuid,boolean) to service_role;

commit;
