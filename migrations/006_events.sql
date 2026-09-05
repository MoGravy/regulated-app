-- Regulated: product analytics, in house. Additive only.
-- Apply in the Supabase SQL editor. Written by api/track.js with the service
-- role; RLS on with no policies, so the browser can neither read nor write it.
-- Rows are anonymous by construction: an event name and a few plain values,
-- no email, no user id.

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_created_idx on public.events (name, created_at);
alter table public.events enable row level security;
