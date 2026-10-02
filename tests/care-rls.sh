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
create role service_role nologin;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated;
grant execute on function auth.uid() to authenticated;
SQL

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 \
  < "$repo_dir/migrations/009_care.sql"
docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 \
  < "$repo_dir/migrations/016_care_reactions.sql"

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

docker exec -i "$check_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
update public.care_links set active = true;
select set_config('test.message_a', id::text, false) from public.care_messages where body = 'Fake message A';
select set_config('test.message_b', id::text, false) from public.care_messages where body = 'Fake message B';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$
declare blocked boolean;
begin
  insert into public.care_message_reactions values (current_setting('test.message_a')::uuid, auth.uid(), '👍');
  insert into public.care_message_reactions values (current_setting('test.message_a')::uuid, auth.uid(), '❤️')
    on conflict(message_id,user_id) do update set emoji=excluded.emoji;
  if (select count(*) from public.care_message_reactions) <> 1
    or (select emoji from public.care_message_reactions) <> '❤️'
  then raise exception 'reaction replacement failed'; end if;
  blocked := false;
  begin
    insert into public.care_message_reactions values (current_setting('test.message_b')::uuid, auth.uid(), '👍');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'cross-client reaction allowed'; end if;
  blocked := false;
  begin
    insert into public.care_message_reactions values (current_setting('test.message_a')::uuid, '20000000-0000-4000-8000-000000000001', '👍');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'forged reaction author allowed'; end if;
  blocked := false;
  begin
    update public.care_message_reactions set user_id='20000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'reaction author changed'; end if;
  blocked := false;
  begin
    update public.care_message_reactions set message_id=current_setting('test.message_b')::uuid;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'reaction moved to other client'; end if;
  blocked := false;
  begin
    update public.care_message_reactions set emoji='unsupported';
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'unsupported emoji allowed'; end if;
end $$;
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.care_message_reactions) <> 1 then raise exception 'practitioner cannot see reaction'; end if;
  update public.care_message_reactions set emoji='😢';
  if (select emoji from public.care_message_reactions) <> '❤️' then raise exception 'another author reaction changed'; end if;
  delete from public.care_message_reactions;
  if (select count(*) from public.care_message_reactions) <> 1 then raise exception 'another author reaction removed'; end if;
  insert into public.care_message_reactions values (current_setting('test.message_a')::uuid, auth.uid(), '😂');
end $$;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.care_message_reactions) then raise exception 'other client read reaction'; end if;
end $$;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
delete from public.care_message_reactions where user_id=auth.uid();
do $$ begin
  if (select count(*) from public.care_message_reactions) <> 1 then raise exception 'own removal failed'; end if;
end $$;
reset role;
update public.care_links set active=false where client_id='10000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
do $$
declare blocked boolean;
begin
  if exists(select 1 from public.care_message_reactions) then raise exception 'revoked reaction read'; end if;
  blocked := false;
  begin
    insert into public.care_message_reactions values (current_setting('test.message_a')::uuid, auth.uid(), '😢')
      on conflict(message_id,user_id) do update set emoji=excluded.emoji;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'revoked reaction write'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.care_message_reactions','select') then raise exception 'anonymous reaction read'; end if;
end $$;
SQL

echo "care and reaction RLS checks passed"
