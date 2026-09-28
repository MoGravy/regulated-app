begin;

create table if not exists public.annual_free_reservations (
  account_id uuid primary key,
  user_email text not null,
  reservation_id uuid not null unique,
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

alter table public.annual_free_reservations enable row level security;
revoke all on public.annual_free_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.annual_free_reservations to service_role;

commit;
