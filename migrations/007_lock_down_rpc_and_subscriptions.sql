-- Regulated: close three public-key holes found in the 2026-09-24 review.
-- Apply in the Supabase SQL editor. Safe to run more than once. Nothing the
-- app does uses what this removes, so it can go in before or after the code.
--
-- Rollback (run in the SQL editor):
--   grant execute on function public.increment_coupon_usage(text) to anon, authenticated;
--   grant execute on function public.increment_completed_sessions(text) to anon, authenticated;

-- 1. increment_coupon_usage is security definer, and new functions are
--    executable by everyone by default, so anyone holding the public key could
--    call it over /rpc and run a partner code past its max_uses. Only the
--    webhook calls it, with the service role, which keeps its access.
--    Guarded: on 2026-09-25 Stripe showed seven ANNUALFREE redemptions while
--    coupons.used_count was still 0, so the function may not exist in
--    production at all. A bare revoke would then stop this whole script.
do $$
begin
  if to_regprocedure('public.increment_coupon_usage(text)') is not null then
    revoke execute on function public.increment_coupon_usage(text) from public, anon, authenticated;
    grant  execute on function public.increment_coupon_usage(text) to service_role;
  else
    raise notice 'increment_coupon_usage(text) does not exist: coupon uses are not being counted';
  end if;

  -- 2. increment_completed_sessions is a no-op the browser no longer calls.
  if to_regprocedure('public.increment_completed_sessions(text)') is not null then
    revoke execute on function public.increment_completed_sessions(text) from public, anon, authenticated;
  end if;
end $$;

-- 3. The original schema file created a subscriptions policy with
--    using (true): every row readable with the public key. If production has
--    it, this removes it. If it does not, this does nothing. The service role
--    (webhook, premium checks) bypasses RLS and is unaffected.
drop policy if exists "Anon can read own subscription" on public.subscriptions;
alter table public.subscriptions enable row level security;
