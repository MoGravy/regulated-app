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
revoke execute on function public.increment_coupon_usage(text) from public, anon, authenticated;
grant  execute on function public.increment_coupon_usage(text) to service_role;

-- 2. increment_completed_sessions is a no-op the browser no longer calls.
revoke execute on function public.increment_completed_sessions(text) from public, anon, authenticated;

-- 3. The original schema file created a subscriptions policy with
--    using (true): every row readable with the public key. If production has
--    it, this removes it. If it does not, this does nothing. The service role
--    (webhook, premium checks) bypasses RLS and is unaffected.
drop policy if exists "Anon can read own subscription" on public.subscriptions;
alter table public.subscriptions enable row level security;
