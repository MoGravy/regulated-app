#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
container="regulated-deletion-dispatch-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..10}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null; then break; fi
  sleep 1
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table auth.users(id uuid primary key);
SQL
for file in 008_account_deletion_requests.sql 011_account_deletion_workflow.sql 017_deletion_dispatch.sql; do
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/migrations/$file"
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into public.account_deletion_requests(account_id,requested_at)
  select gen_random_uuid(),now()-interval '40 days' from generate_series(1,11);
create table public.test_claims(worker text,request_id uuid);
SQL
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL' &
begin;
insert into public.test_claims select 'first',request_id from public.claim_deletion_requests(10);
select pg_sleep(3);
commit;
SQL
first_pid=$!
# The second real database session must skip the first worker's uncommitted row locks.
for attempt in {1..30}; do
  locked=$(docker exec "$container" psql -U postgres -Atc "select count(*) from pg_stat_activity where query='select pg_sleep(3);' and state='active'")
  if [[ "$locked" == 1 ]]; then break; fi
  sleep 0.1
done
[[ "$locked" == 1 ]]
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
set statement_timeout='1s';
insert into public.test_claims select 'second',request_id from public.claim_deletion_requests(10);
SQL
wait "$first_pid"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if (select count(*) from public.test_claims where worker='first')<>10
    or (select count(*) from public.test_claims where worker='second')<>1
    or (select count(distinct request_id) from public.test_claims)<>11
  then raise exception 'Workers lost or duplicated a request'; end if;
  if exists(select 1 from public.claim_deletion_requests(10)) then
    raise exception 'Leased requests claimed twice'; end if;
  if has_function_privilege('anon','public.claim_deletion_requests(integer)','execute')
    or has_function_privilege('authenticated','public.settle_deletion_dispatch(uuid,bigint,uuid,boolean)','execute')
  then raise exception 'Browser dispatch access'; end if;
end $$;
SQL
echo 'PASS: independent PostgreSQL sessions skip locked requests without duplication, delay or browser access.'
