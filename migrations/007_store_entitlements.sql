-- Apply before deploying APIs that read store_entitlements.
-- Only the service role can write verified store results. No client policy.
create table if not exists public.store_entitlements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  provider text not null check (provider in ('apple', 'google')),
  environment text not null check (environment in ('sandbox', 'production')),
  external_id text not null,
  product_id text not null,
  status text not null check (status in ('active', 'grace', 'expired', 'revoked')),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (provider, environment, external_id)
);

create index if not exists store_entitlements_account_idx
  on public.store_entitlements (account_id, status, expires_at);

alter table public.store_entitlements enable row level security;
