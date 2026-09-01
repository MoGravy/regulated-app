-- ============================================================================
-- Regulated — additive migration for Auth (phase 3) and Program mode (phase 4)
--
-- ADDITIVE ONLY. This script creates new tables and policies. It does not drop,
-- rename, retype or edit anything that already exists, and it deliberately does
-- NOT enable RLS on sessions, custom_orders or subscriptions — the live
-- frontend reads those with the anon key and enabling RLS would break it.
--
-- Safe to run more than once: every statement is guarded.
--
-- HOW TO RUN: paste into the Supabase SQL editor for the production project and
-- execute. There is no supabase CLI, psql or service-role credential on the
-- machine this was written on, so it could not be applied from here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are insertable by their owner" on public.profiles;
create policy "profiles are insertable by their owner"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles are updatable by their owner" on public.profiles;
create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create the profile row automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- programs / program_days — content, readable by everyone, writable by nobody
-- through the anon or authenticated role. Seeded by scripts/seed-program.mjs
-- with the service role key.
-- ---------------------------------------------------------------------------
create table if not exists public.programs (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  title      text not null,
  subtitle   text,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.program_days (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week       int  not null check (week between 1 and 52),
  day        int  not null check (day between 1 and 7),
  session_id uuid references public.sessions(id),
  reading    text,
  created_at timestamptz not null default now(),
  unique (program_id, week, day)
);

alter table public.programs     enable row level security;
alter table public.program_days enable row level security;

-- Program content is not user data: readable by anyone, including signed out,
-- so the Program tab renders before login. No insert/update/delete policy is
-- defined, so neither anon nor authenticated can write.
drop policy if exists "programs are readable by anyone" on public.programs;
create policy "programs are readable by anyone"
  on public.programs for select using (true);

drop policy if exists "program days are readable by anyone" on public.program_days;
create policy "program days are readable by anyone"
  on public.program_days for select using (true);

-- ---------------------------------------------------------------------------
-- user_progress — per user, owner only
-- ---------------------------------------------------------------------------
create table if not exists public.user_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  completed_at   timestamptz not null default now(),
  unique (user_id, program_day_id)
);

alter table public.user_progress enable row level security;

drop policy if exists "progress is readable by its owner" on public.user_progress;
create policy "progress is readable by its owner"
  on public.user_progress for select
  using (auth.uid() = user_id);

drop policy if exists "progress is insertable by its owner" on public.user_progress;
create policy "progress is insertable by its owner"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "progress is deletable by its owner" on public.user_progress;
create policy "progress is deletable by its owner"
  on public.user_progress for delete
  using (auth.uid() = user_id);

create index if not exists user_progress_user_idx on public.user_progress(user_id);
create index if not exists program_days_program_idx on public.program_days(program_id, week, day);
