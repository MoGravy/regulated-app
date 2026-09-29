#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
container="regulated-dap-check-$$"
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
create role service_role nologin bypassrls;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,service_role;
grant execute on function auth.uid() to authenticated;
SQL
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/007_courses.sql"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/015_dap_purchases.sql"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users values
 ('30000000-0000-4000-8000-000000000001','buyer@example.test',now()),
 ('30000000-0000-4000-8000-000000000002','other@example.test',now()),
 ('30000000-0000-4000-8000-000000000003','unconfirmed@example.test',null);
insert into public.courses(id,slug,title,published) values
 ('0a02caf8-5050-571c-9a70-e2bcda2253a3','dap','Fake DAP',true),
 ('10000000-0000-4000-8000-000000000002','empowerment','Fake private course',false);
grant select on public.course_grants to service_role;
set role service_role;
do $$
declare first jsonb; repeated jsonb;
begin
 first:=public.reserve_dap_checkout('30000000-0000-4000-8000-000000000001');
 repeated:=public.reserve_dap_checkout('30000000-0000-4000-8000-000000000001');
 if first->>'id' is null or first->>'id'<>repeated->>'id' then raise exception 'Duplicate pending checkout'; end if;
 if public.reserve_dap_checkout('30000000-0000-4000-8000-000000000003') is not null
 then raise exception 'Unconfirmed buyer reservation'; end if;
 if exists(select 1 from public.course_grants) then raise exception 'Reservation granted access'; end if;
end $$;
update public.dap_purchases set checkout_session_id='cs_first' where user_id='30000000-0000-4000-8000-000000000001';
select public.reconcile_dap_purchase('cs_first','pi_first',false);
reset role;
do $$ begin
 if (select count(*) from public.course_grants where revoked_at is null)<>1 then raise exception 'Paid grant missing'; end if;
 if public.reserve_dap_checkout('30000000-0000-4000-8000-000000000001') is not null then raise exception 'Duplicate sale to owner'; end if;
 update public.course_grants set granted_at='2000-01-01' where user_id='30000000-0000-4000-8000-000000000001';
 perform public.reconcile_dap_purchase('cs_first','pi_first',false);
 if (select granted_at from public.course_grants where user_id='30000000-0000-4000-8000-000000000001')<>'2000-01-01' then raise exception 'Duplicate reset grant date'; end if;
 if public.reconcile_dap_purchase('cs_first','pi_wrong',false) then raise exception 'Intent mismatch accepted'; end if;
 perform public.reconcile_dap_purchase('cs_first','pi_first',true);
 if exists(select 1 from public.course_grants where revoked_at is null) then raise exception 'Refund kept purchased access'; end if;
 perform public.reconcile_dap_purchase('cs_first','pi_first',false);
 if exists(select 1 from public.course_grants where revoked_at is null) then raise exception 'Late paid event revived refund'; end if;
end $$;

-- A later purchase can restore access; refunding the old purchase cannot remove it.
select public.reserve_dap_checkout('30000000-0000-4000-8000-000000000001');
update public.dap_purchases set checkout_session_id='cs_second' where status='pending';
select public.reconcile_dap_purchase('cs_second','pi_second',false);
select public.reconcile_dap_purchase('cs_first','pi_first',true);
do $$ begin
 if not exists(select 1 from public.course_grants where source_ref='cs_second' and revoked_at is null)
 then raise exception 'Old refund removed later purchase'; end if;
end $$;

-- A private client grant added while payment was pending survives a refund.
select public.reserve_dap_checkout('30000000-0000-4000-8000-000000000002');
update public.dap_purchases set checkout_session_id='cs_private' where status='pending';
insert into public.course_grants(user_id,course_id,source,source_ref) values
 ('30000000-0000-4000-8000-000000000002','0a02caf8-5050-571c-9a70-e2bcda2253a3','program','private-client');
select public.reconcile_dap_purchase('cs_private','pi_private',false);
select public.reconcile_dap_purchase('cs_private','pi_private',true);
do $$ begin
 if not exists(select 1 from public.course_grants where source='program' and source_ref='private-client' and revoked_at is null)
 then raise exception 'Private grant changed'; end if;
 if exists(select 1 from public.courses where slug='empowerment' and published) then raise exception 'Private course published'; end if;
 if has_table_privilege('authenticated','public.dap_purchases','select')
  or has_table_privilege('authenticated','public.dap_purchases','insert')
  or has_table_privilege('anon','public.dap_purchases','select')
  or has_function_privilege('authenticated','public.reserve_dap_checkout(uuid)','execute')
  or has_function_privilege('authenticated','public.reconcile_dap_purchase(text,text,boolean)','execute')
 then raise exception 'Browser can access purchase writes'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
do $$ begin
 if (select count(*) from public.courses)<>0 then raise exception 'Unrelated buyer can read course'; end if;
end $$;
reset role;
SQL
echo 'PASS: isolated DAP reservations, duplicate/refund ordering, private-grant preservation and browser isolation.'
