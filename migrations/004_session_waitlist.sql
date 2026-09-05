-- Regulated: waitlist for sessions that have no audio yet. Additive only.
-- Apply in the Supabase SQL editor.

create table if not exists public.session_waitlist (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  email      text not null,
  created_at timestamptz not null default now(),
  unique (session_id, email)
);

-- RLS on with no policies: the browser never touches this table. api/waitlist.js
-- writes it with the service role, and reads it back the same way.
alter table public.session_waitlist enable row level security;
