create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references auth.users(id),
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select, insert on public.account_deletion_requests to service_role;
