#!/usr/bin/env bash
# Imports a fake course twice, reorders it, and checks rows stay hidden until published.
set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
check_container="regulated-course-import-$$"
cleanup() { docker rm -f "$check_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
psql_run() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$check_container" psql -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

docker run --rm -d --name "$check_container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$check_container" pg_isready -U postgres >/dev/null; then break; fi
  sleep 1
done

psql_run <<'SQL'
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
psql_run < "$repo_dir/migrations/007_courses.sql"
psql_run < "$repo_dir/migrations/008_course_media.sql"

fixture="$repo_dir/tests/fixtures/course-import.json"
node "$repo_dir/scripts/import-course.mjs" "$fixture" | psql_run
node "$repo_dir/scripts/import-course.mjs" "$fixture" | psql_run

expect() { [ "$2" = "$3" ] || { echo "FAIL $1: expected [$3] got [$2]"; exit 1; }; }
expect "row counts after two imports" "$(psql_run -c "select (select count(*) from courses)||'/'||(select count(*) from course_lessons)||'/'||(select count(*) from course_media)")" "1/3/1"
expect "everything hidden" "$(psql_run -c "select (select count(*) from courses where published) + (select count(*) from course_lessons where published) + (select count(*) from course_media where published)")" "0"
expect "sections and order" "$(psql_run -c "select string_agg(section||':'||title, '|' order by position) from course_lessons")" "Chapter one:Welcome|Chapter one:Practice|Chapter two:Review"
expect "quotes survive" "$(psql_run -c "select body_text like '%It''s the client''s%' from course_lessons where title = 'Welcome'")" "t"

user=30000000-0000-4000-8000-000000000001
reader() { psql_run -c "set role authenticated; set request.jwt.claim.sub = '$user'; $1"; }
psql_run -c "insert into auth.users(id) values ('$user'); insert into course_grants(user_id, course_id, source) select '$user', id, 'program' from courses"
expect "granted client sees no hidden lessons" "$(reader "select count(*) from course_lessons")" "0"

psql_run -c "update courses set published = true; update course_lessons set published = true; update course_media set published = true"
expect "granted client sees published lessons" "$(reader "select string_agg(title, '|' order by position) from course_lessons")" "Welcome|Practice|Review"

ids_before=$(psql_run -c "select string_agg(id::text || title, ',' order by title) from course_lessons")
node -e 'const m=require(process.argv[1]); m.lessons.reverse(); m.lessons[0].title="Review again"; console.log(JSON.stringify(m))' "$fixture" > "/tmp/course-import-$$.json"
node "$repo_dir/scripts/import-course.mjs" "/tmp/course-import-$$.json" | psql_run
rm -f "/tmp/course-import-$$.json"
expect "reorder and edit keep ids" "$(psql_run -c "select string_agg(id::text || replace(title, ' again', ''), ',' order by replace(title, ' again', '')) from course_lessons")" "$ids_before"
expect "reorder applied" "$(psql_run -c "select string_agg(title, '|' order by position) from course_lessons")" "Review again|Practice|Welcome"
expect "re-import keeps published state" "$(psql_run -c "select bool_and(published) from course_lessons")" "t"

psql_run -c "update courses set slug = 'taken' where slug = 'fake-course'; insert into courses(slug, title) values ('fake-course', 'Other')"
if node "$repo_dir/scripts/import-course.mjs" "$fixture" | psql_run 2>/dev/null; then echo "FAIL slug clash was imported"; exit 1; fi

echo "course import ok"
