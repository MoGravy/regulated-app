begin;

-- Match JavaScript trim without rewriting historical addresses.
alter table public.subscriptions add column if not exists user_email_normalized text
  generated always as (lower(btrim(user_email, U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))) stored;
alter table public.custom_orders add column if not exists user_email_normalized text
  generated always as (lower(btrim(user_email, U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))) stored;
create index if not exists subscriptions_normalized_email_idx on public.subscriptions(user_email_normalized);
create index if not exists custom_orders_normalized_email_idx on public.custom_orders(user_email_normalized);

create unique index if not exists custom_orders_stripe_session_id_key on public.custom_orders(stripe_session_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.custom_orders'::regclass
    and conname = 'custom_orders_stripe_session_id_key') then
    alter table public.custom_orders add constraint custom_orders_stripe_session_id_key
      unique using index custom_orders_stripe_session_id_key;
  end if;
end;
$$;

alter table public.custom_orders enable row level security;
drop policy if exists "Client orders remain unpaid" on public.custom_orders;
create policy "Client orders remain unpaid" on public.custom_orders as restrictive
  for insert to anon, authenticated
  with check (status = 'pending_payment' and stripe_session_id is null);

create or replace function public.count_paid_coupon() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.coupon_code_used is null then return new; end if;
  if tg_table_name = 'custom_orders' then
    if new.stripe_session_id is null or new.status is distinct from 'confirmed' then return new; end if;
  else
    if new.stripe_subscription_id is null or new.status is distinct from 'active' then return new; end if;
  end if;
  update public.coupons set used_count = used_count + 1
    where code = new.coupon_code_used and used_count is not null;
  if not found then raise exception 'Coupon count unavailable'; end if;
  return new;
end;
$$;
revoke all on function public.count_paid_coupon() from public, anon, authenticated;
grant execute on function public.count_paid_coupon() to service_role;
grant select(code, used_count), update(used_count) on public.coupons to service_role;

drop trigger if exists count_paid_coupon on public.custom_orders;
create trigger count_paid_coupon after insert on public.custom_orders
  for each row execute function public.count_paid_coupon();
drop trigger if exists count_paid_coupon on public.subscriptions;
create trigger count_paid_coupon after insert on public.subscriptions
  for each row execute function public.count_paid_coupon();

-- Old webhook versions still call this after the trigger has counted the row.
-- Remove after all old deployments stop receiving events. Historical counts
-- are preserved as an unverified baseline, never inferred from old rows.
create or replace function public.increment_coupon_usage(p_code text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  return;
end;
$$;
revoke all on function public.increment_coupon_usage(text) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(text) to service_role;

commit;
