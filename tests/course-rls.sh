#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
check_container="regulated-course-rls-$$"
cleanup() {
  docker rm -f "$check_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm -d --name "$check_container" --network none   -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$check_container" pg_isready -U postgres >/dev/null; then break; fi
  sleep 1
done

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create role authenticated nologin;
create role anon nologin;
create table auth.users (id uuid primary key);
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated;
grant execute on function auth.uid() to authenticated;
SQL

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1   < "$repo_dir/migrations/007_courses.sql"
docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1   < "$repo_dir/migrations/008_course_media.sql"

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) values
  ('30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002');
insert into public.courses(id, slug, title, published) values
  ('10000000-0000-4000-8000-000000000001', 'course-a', 'Course A', true),
  ('10000000-0000-4000-8000-000000000002', 'course-b', 'Course B', true);
insert into public.course_lessons(id, course_id, position, title, published) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Lesson A', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 'Lesson B', true);
insert into public.course_media(id, lesson_id, position, kind, title, storage_path, published) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'audio', 'Audio A', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/audio.mp3', true),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 1, 'video', 'Video B', '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002/video.mp4', true);
insert into public.course_grants(user_id, course_id, source) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'program'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'purchase');

do $$
begin
  if has_table_privilege('anon', 'public.courses', 'select')
    or has_table_privilege('anon', 'public.course_lessons', 'select')
    or has_table_privilege('anon', 'public.course_grants', 'select')
    or has_table_privilege('anon', 'public.course_media', 'select')
    or has_column_privilege('authenticated', 'public.course_media', 'storage_path', 'select')
  then raise exception 'anonymous course read is allowed'; end if;
  if (select public from storage.buckets where id = 'course-media')
  then raise exception 'course media bucket is public'; end if;
end
$$;

set role authenticated;
set request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
do $$
declare blocked boolean;
begin
  if (select count(*) from public.courses) <> 1
    or (select count(*) from public.course_lessons) <> 1
    or (select count(*) from public.course_grants) <> 1
    or (select count(*) from public.course_media) <> 1
  then raise exception 'client A course isolation failed'; end if;

  insert into public.course_progress(user_id, lesson_id) values
    ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

  blocked := false;
  begin
    insert into public.course_progress(user_id, lesson_id) values
      ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'client A completed ungranted lesson'; end if;

  blocked := false;
  begin
    insert into public.course_grants(user_id, course_id, source) values
      ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'manual');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'client A granted own access'; end if;
end
$$;

set request.jwt.claim.sub = '30000000-0000-4000-8000-000000000002';
do $$
begin
  if (select count(*) from public.courses) <> 1
    or (select count(*) from public.course_lessons) <> 1
    or (select count(*) from public.course_progress) <> 0
    or (select count(*) from public.course_media) <> 1
  then raise exception 'client B can see client A data'; end if;
end
$$;

reset role;
update public.course_grants set revoked_at = now()
  where user_id = '30000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.courses) <> 0
    or (select count(*) from public.course_lessons) <> 0
    or (select count(*) from public.course_media) <> 0
  then raise exception 'revoked course remains readable'; end if;
end
$$;
SQL

echo "course RLS checks passed"
