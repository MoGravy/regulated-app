-- Regulated education: private courses and account-bound progress.
-- Additive only. Do not run against production until fake-account RLS checks pass.
-- Service role imports course content and grants access after verified payment
-- or practitioner approval. Browser clients cannot write courses or grants.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position integer not null check (position > 0),
  section text not null default '',
  title text not null,
  body_text text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  -- Deferred so an import can reorder lessons inside one transaction.
  unique (course_id, position) deferrable initially deferred
);

create table if not exists public.course_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  source text not null check (source in ('program', 'purchase', 'manual')),
  source_ref text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, course_id)
);

create table if not exists public.course_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists course_lessons_course_idx
  on public.course_lessons (course_id, position);
create index if not exists course_grants_course_user_idx
  on public.course_grants (course_id, user_id)
  where revoked_at is null;

alter table public.courses enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_grants enable row level security;
alter table public.course_progress enable row level security;

-- A grant alone does not expose an unpublished course.
drop policy if exists "granted published courses" on public.courses;
create policy "granted published courses" on public.courses
  for select to authenticated
  using (
    published and exists (
      select 1 from public.course_grants g
      where g.course_id = id
        and g.user_id = (select auth.uid())
        and g.revoked_at is null
    )
  );

-- A lesson also needs its own published flag and an active grant.
drop policy if exists "granted published lessons" on public.course_lessons;
create policy "granted published lessons" on public.course_lessons
  for select to authenticated
  using (
    published and exists (
      select 1 from public.courses c
      join public.course_grants g on g.course_id = c.id
      where c.id = public.course_lessons.course_id
        and c.published
        and g.user_id = (select auth.uid())
        and g.revoked_at is null
    )
  );

-- The client can read its grant but cannot award or revive one.
drop policy if exists "own course grants" on public.course_grants;
create policy "own course grants" on public.course_grants
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Completion follows the account across devices. Inserting progress requires
-- a lesson that the same signed-in user can currently read.
drop policy if exists "own course progress" on public.course_progress;
create policy "own course progress" on public.course_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "complete granted lesson" on public.course_progress;
create policy "complete granted lesson" on public.course_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.course_lessons l
      where l.id = lesson_id
    )
  );

drop policy if exists "remove own course progress" on public.course_progress;
create policy "remove own course progress" on public.course_progress
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.courses, public.course_lessons, public.course_grants,
  public.course_progress from anon;
revoke insert, update, delete on public.courses, public.course_lessons,
  public.course_grants from authenticated;
grant select on public.courses, public.course_lessons,
  public.course_grants to authenticated;
grant select, insert, delete on public.course_progress to authenticated;
