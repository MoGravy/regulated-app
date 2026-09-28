#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
check_container="regulated-care-rls-$$"
cleanup() { docker rm -f "$check_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$check_container" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$check_container" pg_isready -U postgres >/dev/null; then break; fi
  sleep 1
done

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create role authenticated nologin;
create role anon nologin;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated;
grant execute on function auth.uid() to authenticated;
SQL

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 \
  < "$repo_dir/migrations/009_care.sql"

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
insert into public.care_links(client_id, practitioner_id, client_label, practitioner_label) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Client A', 'Practitioner A'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Client B', 'Practitioner B');
insert into public.care_tasks(id, client_id, practitioner_id, title) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Task A'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Task B');
insert into public.care_task_entries(task_id, entry_type, body) values
  ('30000000-0000-4000-8000-000000000001', 'note', 'Fake note A'),
  ('30000000-0000-4000-8000-000000000002', 'note', 'Fake note B');
insert into public.care_messages(client_id, practitioner_id, sender_id, body) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Fake message A'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Fake message B');

do $$
begin
  if has_table_privilege('anon', 'public.care_links', 'select')
    or has_table_privilege('anon', 'public.care_tasks', 'select')
    or has_table_privilege('anon', 'public.care_task_entries', 'select')
    or has_table_privilege('anon', 'public.care_messages', 'select')
  then raise exception 'anonymous care read is allowed'; end if;
end
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$
declare blocked boolean;
begin
  if (select count(*) from public.care_links) <> 1
    or (select count(*) from public.care_tasks) <> 1
    or (select count(*) from public.care_task_entries) <> 1
    or (select count(*) from public.care_messages) <> 1
  then raise exception 'client A isolation failed'; end if;

  insert into public.care_task_entries(task_id, entry_type, body)
    values ('30000000-0000-4000-8000-000000000001', 'complete', '');
  insert into public.care_messages(client_id, practitioner_id, sender_id, body)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Client A reply');

  blocked := false;
  begin
    insert into public.care_links(client_id, practitioner_id, client_label, practitioner_label)
      values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'A', 'B');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'client created care link'; end if;

  blocked := false;
  begin
    insert into public.care_tasks(client_id, practitioner_id, title)
      values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Self assigned');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'client assigned own task'; end if;

  blocked := false;
  begin
    insert into public.care_task_entries(task_id, entry_type, body)
      values ('30000000-0000-4000-8000-000000000002', 'note', 'wrong client');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'client wrote another task'; end if;

  blocked := false;
  begin
    insert into public.care_messages(client_id, practitioner_id, sender_id, body)
      values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'spoof');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'client spoofed practitioner'; end if;
end
$$;

set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
do $$
declare blocked boolean;
begin
  if (select count(*) from public.care_links) <> 1
    or (select count(*) from public.care_tasks) <> 1
    or (select count(*) from public.care_task_entries) <> 2
    or (select count(*) from public.care_messages) <> 2
  then raise exception 'practitioner A isolation failed'; end if;

  insert into public.care_tasks(client_id, practitioner_id, title)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Second task A');
  insert into public.care_messages(client_id, practitioner_id, sender_id, body)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Practitioner A reply');

  blocked := false;
  begin
    insert into public.care_tasks(client_id, practitioner_id, title)
      values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Wrong task');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'practitioner assigned another client'; end if;

  blocked := false;
  begin
    insert into public.care_task_entries(task_id, entry_type, body)
      values ('30000000-0000-4000-8000-000000000001', 'note', 'staff spoof');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'practitioner wrote client entry'; end if;
end
$$;

reset role;
update public.care_links set active = false
  where client_id = '10000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$
declare blocked boolean;
begin
  if (select count(*) from public.care_links) <> 0
    or (select count(*) from public.care_tasks) <> 0
    or (select count(*) from public.care_task_entries) <> 0
    or (select count(*) from public.care_messages) <> 0
  then raise exception 'revoked care link remains readable'; end if;

  blocked := false;
  begin
    insert into public.care_messages(client_id, practitioner_id, sender_id, body)
      values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'after revoke');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'revoked client sent message'; end if;
end
$$;
SQL

echo "care RLS checks passed"
