-- Private media is visible only with a published lesson and an active course grant.
-- Uploads and metadata writes use the service role. The bucket has no client policies.
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
