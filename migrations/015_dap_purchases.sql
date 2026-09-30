-- Run only after isolated purchase/refund and browser-privilege checks pass.
create table if not exists public.dap_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  checkout_session_id text unique,
  payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending','expired','paid','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (course_id='0a02caf8-5050-571c-9a70-e2bcda2253a3')
);
create unique index if not exists dap_pending_account
  on public.dap_purchases(user_id) where status='pending';
alter table public.dap_purchases enable row level security;
revoke all on public.dap_purchases from public,anon,authenticated;
grant select,insert,update on public.dap_purchases to service_role;

create or replace function public.reserve_dap_checkout(account uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare purchase public.dap_purchases;
begin
  perform pg_advisory_xact_lock(hashtextextended(account::text,0));
  if not exists(select 1 from auth.users where id=account and email_confirmed_at is not null)
    or not exists(select 1 from public.courses where id='0a02caf8-5050-571c-9a70-e2bcda2253a3' and published)
    or exists(select 1 from public.course_grants where user_id=account
      and course_id='0a02caf8-5050-571c-9a70-e2bcda2253a3' and revoked_at is null)
  then return null; end if;
  insert into public.dap_purchases(user_id,course_id)
    values(account,'0a02caf8-5050-571c-9a70-e2bcda2253a3')
    on conflict(user_id) where status='pending' do update set user_id=excluded.user_id
    returning * into purchase;
  return to_jsonb(purchase);
end $$;

create or replace function public.reconcile_dap_purchase(checkout_id text,intent_id text,fully_refunded boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare purchase public.dap_purchases; active_checkout text;
begin
  select * into purchase from public.dap_purchases where checkout_session_id=checkout_id;
  if not found or fully_refunded is null or intent_id is null or intent_id !~ '^pi_[A-Za-z0-9_]+$'
    or (purchase.payment_intent_id is not null and purchase.payment_intent_id<>intent_id)
  then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(purchase.user_id::text,0));
  select * into purchase from public.dap_purchases where id=purchase.id for update;
  if purchase.status='expired' or
    (purchase.payment_intent_id is not null and purchase.payment_intent_id<>intent_id)
  then return false; end if;
  update public.dap_purchases set payment_intent_id=intent_id,
    status=case when fully_refunded or status='refunded' then 'refunded' else 'paid' end,
    updated_at=now() where id=purchase.id;
  select checkout_session_id into active_checkout from public.dap_purchases
    where user_id=purchase.user_id and status='paid' order by created_at desc,id limit 1;
  if active_checkout is not null then
    insert into public.course_grants(user_id,course_id,source,source_ref)
      values(purchase.user_id,purchase.course_id,'purchase',active_checkout)
      on conflict(user_id,course_id) do update set source='purchase',source_ref=active_checkout,
        revoked_at=null,granted_at=now()
      where (public.course_grants.revoked_at is not null or
        (public.course_grants.source='purchase' and public.course_grants.source_ref in
          (select checkout_session_id from public.dap_purchases where user_id=purchase.user_id)))
        and (public.course_grants.revoked_at is not null or public.course_grants.source_ref is distinct from active_checkout);
  else
    -- Revoke only a grant owned by this ledger. Private/manual grants stay intact.
    update public.course_grants set revoked_at=now()
      where user_id=purchase.user_id and course_id=purchase.course_id and source='purchase'
        and source_ref in (select checkout_session_id from public.dap_purchases where user_id=purchase.user_id);
  end if;
  return true;
end $$;
revoke all on function public.reserve_dap_checkout(uuid),
  public.reconcile_dap_purchase(text,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_dap_checkout(uuid),
  public.reconcile_dap_purchase(text,text,boolean) to service_role;
