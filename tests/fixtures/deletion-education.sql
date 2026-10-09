BEGIN;


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

drop policy if exists "own course grants" on public.course_grants;
create policy "own course grants" on public.course_grants
  for select to authenticated
  using (user_id = (select auth.uid()));

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

insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', false)
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'course-media' and public)
  then raise exception 'course-media bucket must be private'; end if;
end
$$;

create table if not exists public.course_media (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  position integer not null check (position > 0),
  kind text not null check (kind in ('audio', 'video', 'file')),
  title text not null,
  storage_path text not null unique,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lesson_id, position) deferrable initially deferred
);

create index if not exists course_media_lesson_idx
  on public.course_media (lesson_id, position);

alter table public.course_media enable row level security;

drop policy if exists "granted published course media" on public.course_media;
create policy "granted published course media" on public.course_media
  for select to authenticated
  using (
    published and exists (
      select 1 from public.course_lessons l
      join public.courses c on c.id = l.course_id
      join public.course_grants g on g.course_id = c.id
      where l.id = public.course_media.lesson_id
        and l.published
        and c.published
        and g.user_id = (select auth.uid())
        and g.revoked_at is null
    )
  );

revoke all on public.course_media from anon;
revoke all on public.course_media from authenticated;
grant select (id, lesson_id, position, kind, title, published, created_at)
  on public.course_media to authenticated;

create table if not exists public.care_links (
  client_id uuid not null references auth.users(id) on delete cascade,
  practitioner_id uuid not null references auth.users(id) on delete cascade,
  client_label text not null check (length(btrim(client_label)) between 1 and 100),
  practitioner_label text not null check (length(btrim(practitioner_label)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (client_id, practitioner_id),
  check (client_id <> practitioner_id)
);

create table if not exists public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  practitioner_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  instructions text not null default '' check (length(instructions) <= 4000),
  created_at timestamptz not null default now(),
  foreign key (client_id, practitioner_id)
    references public.care_links(client_id, practitioner_id)
);

create table if not exists public.care_task_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.care_tasks(id) on delete cascade,
  entry_type text not null check (entry_type in ('note', 'complete')),
  body text not null default '' check (length(body) <= 5000),
  created_at timestamptz not null default now(),
  check (entry_type = 'complete' or length(btrim(body)) > 0)
);

create table if not exists public.care_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  practitioner_id uuid not null,
  sender_id uuid not null references auth.users(id),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (client_id, practitioner_id)
    references public.care_links(client_id, practitioner_id),
  check (sender_id = client_id or sender_id = practitioner_id)
);

create index if not exists care_links_practitioner_idx
  on public.care_links (practitioner_id, client_id) where active;
create index if not exists care_tasks_pair_idx
  on public.care_tasks (client_id, practitioner_id, created_at desc);
create index if not exists care_task_entries_task_idx
  on public.care_task_entries (task_id, created_at);
create unique index if not exists care_task_once_idx
  on public.care_task_entries (task_id) where entry_type = 'complete';
create index if not exists care_messages_pair_idx
  on public.care_messages (client_id, practitioner_id, created_at);

alter table public.care_links enable row level security;
alter table public.care_tasks enable row level security;
alter table public.care_task_entries enable row level security;
alter table public.care_messages enable row level security;

drop policy if exists "active care link participants" on public.care_links;
create policy "active care link participants" on public.care_links
  for select to authenticated
  using (active and ((select auth.uid()) = client_id or (select auth.uid()) = practitioner_id));

drop policy if exists "linked care tasks" on public.care_tasks;
create policy "linked care tasks" on public.care_tasks
  for select to authenticated
  using (exists (
    select 1 from public.care_links l
    where l.client_id = public.care_tasks.client_id
      and l.practitioner_id = public.care_tasks.practitioner_id
      and l.active
      and ((select auth.uid()) = l.client_id or (select auth.uid()) = l.practitioner_id)
  ));

drop policy if exists "practitioner assigns linked task" on public.care_tasks;
create policy "practitioner assigns linked task" on public.care_tasks
  for insert to authenticated
  with check (
    practitioner_id = (select auth.uid())
    and exists (
      select 1 from public.care_links l
      where l.client_id = public.care_tasks.client_id
        and l.practitioner_id = public.care_tasks.practitioner_id
        and l.active
    )
  );

drop policy if exists "linked task entries" on public.care_task_entries;
create policy "linked task entries" on public.care_task_entries
  for select to authenticated
  using (exists (
    select 1 from public.care_tasks t
    join public.care_links l
      on l.client_id = t.client_id and l.practitioner_id = t.practitioner_id
    where t.id = public.care_task_entries.task_id
      and l.active
      and ((select auth.uid()) = l.client_id or (select auth.uid()) = l.practitioner_id)
  ));

drop policy if exists "client writes own task entry" on public.care_task_entries;
create policy "client writes own task entry" on public.care_task_entries
  for insert to authenticated
  with check (exists (
    select 1 from public.care_tasks t
    join public.care_links l
      on l.client_id = t.client_id and l.practitioner_id = t.practitioner_id
    where t.id = public.care_task_entries.task_id
      and l.active
      and t.client_id = (select auth.uid())
  ));

drop policy if exists "linked care messages" on public.care_messages;
create policy "linked care messages" on public.care_messages
  for select to authenticated
  using (exists (
    select 1 from public.care_links l
    where l.client_id = public.care_messages.client_id
      and l.practitioner_id = public.care_messages.practitioner_id
      and l.active
      and ((select auth.uid()) = l.client_id or (select auth.uid()) = l.practitioner_id)
  ));

drop policy if exists "participant sends care message" on public.care_messages;
create policy "participant sends care message" on public.care_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.care_links l
      where l.client_id = public.care_messages.client_id
        and l.practitioner_id = public.care_messages.practitioner_id
        and l.active
    )
  );

revoke all on public.care_links, public.care_tasks,
  public.care_task_entries, public.care_messages from anon, authenticated;
grant select on public.care_links, public.care_tasks,
  public.care_task_entries, public.care_messages to authenticated;
grant insert (client_id, practitioner_id, title, instructions)
  on public.care_tasks to authenticated;
grant insert (task_id, entry_type, body)
  on public.care_task_entries to authenticated;
grant insert (client_id, practitioner_id, sender_id, body)
  on public.care_messages to authenticated;

COMMIT;
