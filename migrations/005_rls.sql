-- Regulated: row level security on sessions and custom_orders. Additive only.
-- Apply in the Supabase SQL editor. Lifted by Matthew on 2026-09-05 for these
-- two tables only; subscriptions stays as it is.
--
-- Rollback (one line each, run in the SQL editor):
--   alter table public.sessions disable row level security;
--   alter table public.custom_orders disable row level security;
--
-- The api/ routes use the service role, which bypasses RLS, so the webhook,
-- audio delivery, waitlist and coupon gate keep working unchanged.

-- The library is public: signed-out and signed-in readers both see it.
alter table public.sessions enable row level security;
drop policy if exists "sessions are public to read" on public.sessions;
create policy "sessions are public to read"
  on public.sessions for select
  to anon, authenticated
  using (true);

-- An order is visible only to the signed-in account whose email it carries.
-- Emails are matched case-insensitively everywhere else in the app.
alter table public.custom_orders enable row level security;
drop policy if exists "own orders" on public.custom_orders;
create policy "own orders"
  on public.custom_orders for select
  to authenticated
  using (lower(user_email) = lower(auth.jwt() ->> 'email'));
