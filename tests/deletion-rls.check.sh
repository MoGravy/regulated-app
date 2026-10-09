#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test_container="regulated-deletion-check-$$"
docker run --rm -d --network none --name "$test_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
trap 'docker stop "$test_container" >/dev/null' EXIT
attempt=0
until docker exec "$test_container" pg_isready -U postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 1
done

docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('00000000-0000-4000-8000-000000000001');
SQL

docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < migrations/008_account_deletion_requests.sql >/dev/null
docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < migrations/008_account_deletion_requests.sql >/dev/null

docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
set role service_role;
insert into account_deletion_requests (account_id, requested_at)
values ('00000000-0000-4000-8000-000000000001', '2026-09-26T00:00:00Z');
insert into account_deletion_requests (account_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (account_id) do nothing;
select id, requested_at from account_deletion_requests;
reset role;

do $$
declare client_role text;
begin
  if (select count(*) from account_deletion_requests) <> 1
     or (select requested_at from account_deletion_requests) <> '2026-09-26T00:00:00Z' then
    raise exception 'Retry changed the original request';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'account_deletion_requests'::regclass) then
    raise exception 'RLS is disabled';
  end if;
  foreach client_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(client_role, 'account_deletion_requests', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Client role has direct table access';
    end if;
  end loop;
  begin
    delete from auth.users;
    raise exception 'Auth deletion bypassed pending request reconciliation';
  exception when foreign_key_violation then null;
  end;
end $$;
SQL
printf '%s\n' 'Deletion request privacy, retry and Auth dependency checks passed.'
