-- RevenueCat snapshots are written only by the authenticated server adapter.
alter table public.store_entitlements
  drop constraint if exists store_entitlements_provider_check;

alter table public.store_entitlements
  add constraint store_entitlements_provider_check
  check (provider in ('apple', 'google', 'revenuecat'));

-- RevenueCat subscription IDs are global ownership keys across environments.
create unique index if not exists store_entitlements_revenuecat_external_id_key
  on public.store_entitlements (external_id)
  where provider = 'revenuecat';

create table if not exists public.revenuecat_sync_state (
  account_id uuid primary key references auth.users(id),
  generation bigint not null default 0 check (generation >= 0),
  lease_token uuid,
  lease_until timestamptz,
  fresh_until timestamptz not null default 'epoch',
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_until is null))
);

alter table public.revenuecat_sync_state enable row level security;
revoke all on public.revenuecat_sync_state from public, anon, authenticated;
grant select, insert, update, delete on public.revenuecat_sync_state to service_role;

create or replace function public.claim_revenuecat_sync(
  p_account_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns table (claimed boolean, fresh boolean, generation bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sync_row public.revenuecat_sync_state%rowtype;
  checked_at timestamptz := clock_timestamp();
begin
  insert into public.revenuecat_sync_state (account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  select * into sync_row
  from public.revenuecat_sync_state
  where account_id = p_account_id
  for update;

  checked_at := clock_timestamp();
  if sync_row.fresh_until > checked_at then
    return query select false, true, sync_row.generation;
    return;
  end if;

  if sync_row.lease_until > checked_at then
    return query select false, false, sync_row.generation;
    return;
  end if;

  update public.revenuecat_sync_state
  set generation = sync_row.generation + 1,
      lease_token = p_lease_token,
      lease_until = checked_at + make_interval(secs => greatest(15, least(90, p_lease_seconds))),
      updated_at = checked_at
  where account_id = p_account_id
  returning * into sync_row;

  return query select true, false, sync_row.generation;
end;
$$;

create or replace function public.commit_revenuecat_snapshot(
  p_account_id uuid,
  p_generation bigint,
  p_lease_token uuid,
  p_rows jsonb,
  p_fresh_seconds integer
)
returns table (committed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sync_row public.revenuecat_sync_state%rowtype;
  snapshot_time timestamptz := clock_timestamp();
  row_data jsonb;
  affected integer;
begin
  select * into sync_row
  from public.revenuecat_sync_state
  where account_id = p_account_id
  for update;

  snapshot_time := clock_timestamp();
  if not found or sync_row.generation is distinct from p_generation
    or sync_row.lease_token is distinct from p_lease_token
    or sync_row.lease_until is null or sync_row.lease_until <= snapshot_time then
    return query select false;
    return;
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    return query select false;
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where coalesce(item->>'external_id', '') = ''
      or coalesce(item->>'product_id', '') = ''
      or coalesce(item->>'status', '') not in ('active', 'grace', 'expired', 'revoked')
      or coalesce(item->>'expires_at', '') = ''
  ) or (select count(*) from jsonb_array_elements(p_rows)) <>
       (select count(distinct item->>'external_id') from jsonb_array_elements(p_rows) item) then
    return query select false;
    return;
  end if;

  -- One RevenueCat subscription ID can never move to a different account or environment.
  if exists (
    select 1
    from public.store_entitlements existing
    join jsonb_array_elements(p_rows) incoming
      on existing.external_id = incoming->>'external_id'
    where existing.provider = 'revenuecat'
      and (existing.account_id <> p_account_id or existing.environment <> 'production')
  ) then
    return query select false;
    return;
  end if;

  update public.store_entitlements
  set status = 'expired', expires_at = snapshot_time, updated_at = snapshot_time
  where account_id = p_account_id and provider = 'revenuecat' and environment = 'production';

  for row_data in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.store_entitlements (
      account_id, provider, environment, external_id, product_id, status, expires_at, updated_at
    ) values (
      p_account_id,
      'revenuecat',
      'production',
      row_data->>'external_id',
      row_data->>'product_id',
      row_data->>'status',
      least((row_data->>'expires_at')::timestamptz, snapshot_time + interval '5 minutes'),
      snapshot_time
    )
    on conflict (provider, environment, external_id) do update
    set product_id = excluded.product_id,
        status = excluded.status,
        expires_at = excluded.expires_at,
        updated_at = snapshot_time
    where public.store_entitlements.account_id = p_account_id;

    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'revenuecat ownership conflict';
    end if;
  end loop;

  update public.revenuecat_sync_state
  set fresh_until = snapshot_time + make_interval(secs => greatest(1, least(300, coalesce(p_fresh_seconds, 1)))),
      lease_token = null,
      lease_until = null,
      updated_at = snapshot_time
  where account_id = p_account_id and generation = p_generation and lease_token = p_lease_token;

  return query select true;
end;
$$;

create or replace function public.release_revenuecat_sync(
  p_account_id uuid,
  p_generation bigint,
  p_lease_token uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.revenuecat_sync_state
  set lease_token = null, lease_until = null, updated_at = clock_timestamp()
  where account_id = p_account_id and generation = p_generation and lease_token = p_lease_token;
$$;

revoke all on function public.claim_revenuecat_sync(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.commit_revenuecat_snapshot(uuid, bigint, uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.release_revenuecat_sync(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_revenuecat_sync(uuid, uuid, integer) to service_role;
grant execute on function public.commit_revenuecat_snapshot(uuid, bigint, uuid, jsonb, integer) to service_role;
grant execute on function public.release_revenuecat_sync(uuid, bigint, uuid) to service_role;
