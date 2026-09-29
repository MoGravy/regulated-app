#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
container="regulated-push-check-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..10}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null; then break; fi
  sleep 1
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,service_role;
grant execute on function auth.uid() to authenticated;
SQL
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/009_care.sql"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/013_care_push.sql"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/014_care_connect.sql"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001');
insert into public.care_links(client_id,practitioner_id,client_label,practitioner_label)
 values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fake client','Fake practitioner');
insert into public.care_push_subscriptions(id,user_id,subscription) values
 ('client-device','10000000-0000-4000-8000-000000000001','{}'),
 ('practitioner-device','20000000-0000-4000-8000-000000000001','{}'),
 ('unrelated-device','10000000-0000-4000-8000-000000000002','{}');
set role authenticated;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
insert into public.care_tasks(client_id,practitioner_id,title) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fake task');
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into public.care_messages(client_id,practitioner_id,sender_id,body) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fake message');
reset role;
update auth.users set email='fake-client@example.test',email_confirmed_at=now() where id='10000000-0000-4000-8000-000000000001';
do $$ begin
 if (select count(*) from public.care_push_jobs)<>2 then raise exception 'Wrong queue size'; end if;
 if exists(select 1 from public.care_push_jobs where subscription_id='unrelated-device') then raise exception 'Cross-client alert'; end if;
 if has_table_privilege('authenticated','public.care_push_subscriptions','select')
  or has_table_privilege('anon','public.care_push_jobs','select')
  or has_function_privilege('authenticated','public.claim_care_push(uuid)','execute')
 then raise exception 'Browser can access push routing'; end if;
 if has_function_privilege('authenticated','public.connect_care_account(text,uuid,text)','execute')
 then raise exception 'Browser can create care link'; end if;
 if not public.connect_care_account('fake-client@example.test','20000000-0000-4000-8000-000000000001','Fake client')
 then raise exception 'Confirmed client connection failed'; end if;
 if public.connect_care_account('missing@example.test','20000000-0000-4000-8000-000000000001','Missing')
 then raise exception 'Unknown account connection succeeded'; end if;
 if exists(select 1 from information_schema.columns where table_name='care_push_jobs' and column_name in ('body','title','instructions'))
 then raise exception 'Private content in queue'; end if;
 if (select count(*) from public.claim_care_push('10000000-0000-4000-8000-000000000002'))<>0 then raise exception 'Wrong caller claim'; end if;
 if (select count(*) from public.claim_care_push('10000000-0000-4000-8000-000000000001'))<>2 then raise exception 'Participant cannot claim'; end if;
 if (select count(*) from public.claim_care_push(null))<>0 then raise exception 'Concurrent duplicate claim'; end if;
end $$;
SQL
echo 'care push SQL queue, isolation, private content and lease checks passed'
