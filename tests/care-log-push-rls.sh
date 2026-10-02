#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
container="regulated-log-check-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..20}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,service_role;
grant execute on function auth.uid() to authenticated;
SQL
for migration in 009_care 013_care_push 018_care_log_push 018_care_log_push; do
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/$migration.sql"
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users values ('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000001');
insert into care_links(client_id,practitioner_id,client_label,practitioner_label) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fixture client','Fixture practitioner');
insert into care_push_subscriptions(id,user_id,subscription) values
 ('fixture-client','10000000-0000-4000-8000-000000000001','{}'),
 ('fixture-practitioner','20000000-0000-4000-8000-000000000001','{}');
insert into care_tasks(id,client_id,practitioner_id,title) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fixture task');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into care_task_entries(task_id,entry_type,body) values
 ('40000000-0000-4000-8000-000000000001','note','Private first fixture'),
 ('40000000-0000-4000-8000-000000000001','note','Private second fixture'),
 ('40000000-0000-4000-8000-000000000001','complete','');
reset role;
do $$ begin
 if (select count(*) from care_push_jobs where recipient_id='20000000-0000-4000-8000-000000000001')<>3 then
  raise exception 'Repeated notes or completion lost their alert'; end if;
 if (select count(*) from care_push_jobs j join care_task_entries e on e.id=j.event_id
   where j.kind='task' and j.sender_id='10000000-0000-4000-8000-000000000001'
     and j.subscription_id='fixture-practitioner')<>3 then
  raise exception 'Log alert has wrong sender, recipient or event'; end if;
 if (select count(*) from care_push_jobs where subscription_id='fixture-client')<>1 then
  raise exception 'Client received their own log alert'; end if;
 if has_function_privilege('authenticated','public.enqueue_care_log_push()','execute') then
  raise exception 'Client can invoke queue function'; end if;
end $$;
update care_links set active=false;
insert into care_task_entries(task_id,entry_type,body) values
 ('40000000-0000-4000-8000-000000000001','note','Inactive service fixture');
do $$ begin
 if (select count(*) from care_push_jobs)<>4 then raise exception 'Inactive relationship queued an alert'; end if;
end $$;
SQL
echo 'Task log notes, completion, recipient separation, inactive relationship and migration rerun PASS'
