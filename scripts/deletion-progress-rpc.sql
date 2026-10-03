begin;

-- Generated from the reviewed worker template, catalog query and fixed controls.
create or replace function public.deletion_progress_snapshot(p_request_id uuid, p_account_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp set row_security = off as $$
declare
  v_schema jsonb;
  v_controls jsonb;
  v_trusted jsonb := $controls$/* TRUSTED_CONTROLS_JSON */$controls$::jsonb;
  v_progress jsonb;
  v_counts jsonb;
  v_schema_hash text;
  v_rows_hash text;
begin
  -- Catalog deparsing uses this fixed path so the existing control pins remain exact.
  select coalesce(jsonb_agg(to_jsonb(s) order by s.object),'[]'::jsonb) into v_schema
  from (
/* SCHEMA_INSPECTION_SQL */
  ) s;
  select coalesce(jsonb_agg(s),'[]'::jsonb) into v_controls
  from jsonb_array_elements(v_schema) s
  where ((s->>'object') like '%public.deletion_progress_plans%'
    or s->>'object' in ('function:public.guard_progress_plan()',
      'function:public.freeze_deleted_progress()',
      'trigger:public.user_progress.freeze_deleted_progress',
      'trigger:public.course_progress.freeze_deleted_progress'))
    and not exists (select 1 from pg_constraint k
      where k.conrelid='public.deletion_progress_plans'::regclass and k.contype='n'
        and s->>'object'='constraint:public.deletion_progress_plans.' || k.conname);
  if jsonb_array_length(v_controls) <> jsonb_array_length(v_trusted) or exists (
    select 1 from jsonb_array_elements(v_controls) s
    where not exists (select 1 from jsonb_array_elements(v_trusted) t
      where s->>'object'=t->>'object' and (s->>'fingerprint'=t->>'fingerprint'
        or coalesce(t->'alternateFingerprints','[]'::jsonb) ? (s->>'fingerprint')))
  ) or exists (select 1 from pg_index where indrelid='public.deletion_progress_plans'::regclass
      and (indexprs is not null or indpred is not null)) then
    raise exception 'Progress cleanup needs review';
  end if;
  v_schema_hash := encode(sha256(convert_to(v_schema::text,'UTF8')),'hex');
  select jsonb_build_object(
    'user_progress', (select jsonb_build_object('count',count(*)::int,'fingerprint',
      encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
        'version',t.xmin::text,'row',encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'))
        order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex'))
      from public.user_progress t where t.user_id=p_account_id),
    'course_progress', (select jsonb_build_object('count',count(*)::int,'fingerprint',
      encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
        'version',t.xmin::text,'row',encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'))
        order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex'))
      from public.course_progress t where t.user_id=p_account_id)) into v_progress;
  v_rows_hash := encode(sha256(convert_to(v_progress::text,'UTF8')),'hex');
  v_counts := jsonb_build_object('user_progress',v_progress->'user_progress'->'count',
    'course_progress',v_progress->'course_progress'->'count');
  return jsonb_build_object('schemaHash',v_schema_hash,'rowsHash',v_rows_hash,'counts',v_counts,
    'planHash',encode(sha256(convert_to(jsonb_build_object('format',2,
      'requestId',p_request_id,'accountId',p_account_id,'schemaHash',v_schema_hash,
      'rowsHash',v_rows_hash,'counts',v_counts)::text,'UTF8')),'hex'));
end;
$$;

create or replace function public.prepare_progress_cleanup(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
set row_security = off set lock_timeout = '5s' set statement_timeout = '30s' as $$
declare
  v_account_id uuid;
  v_existing public.deletion_progress_plans%rowtype;
  v_snapshot jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed'
    or current_setting('session_replication_role') <> 'origin'
    or not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Progress cleanup needs review';
  end if;
  -- ponytail: locks the small progress tables and ledger; use per-account guards if throughput requires it.
  lock table public.user_progress,public.course_progress,public.deletion_progress_plans in share row exclusive mode;
  select r.account_id into v_account_id from public.account_deletion_requests r
    join auth.users u on u.id=r.account_id where r.id=p_request_id for update of r;
  if v_account_id is null then raise exception 'Progress cleanup needs review'; end if;
  select * into v_existing from public.deletion_progress_plans where request_id=p_request_id for update;
  if v_existing.approved_at is not null or v_existing.completed_at is not null then
    raise exception 'Progress cleanup needs review';
  end if;
  v_snapshot := public.deletion_progress_snapshot(p_request_id,v_account_id);
  insert into public.deletion_progress_plans(request_id,account_id,plan_hash,schema_hash,rows_hash,counts)
    values (p_request_id,v_account_id,v_snapshot->>'planHash',v_snapshot->>'schemaHash',
      v_snapshot->>'rowsHash',v_snapshot->'counts')
    on conflict(request_id) do update set account_id=excluded.account_id,plan_hash=excluded.plan_hash,
      schema_hash=excluded.schema_hash,rows_hash=excluded.rows_hash,counts=excluded.counts;
  return jsonb_build_object('counts',v_snapshot->'counts','planHash',v_snapshot->>'planHash','approved',false);
exception when others then
  raise exception 'Progress cleanup needs review' using errcode='P0001';
end;
$$;

create or replace function public.execute_progress_cleanup(
  p_request_id uuid, p_account_id uuid, p_generation bigint, p_lease_token uuid, p_plan_hash text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
set row_security = off set lock_timeout = '5s' set statement_timeout = '30s' as $$
declare
  v_receipt public.account_deletion_requests%rowtype;
  v_plan public.deletion_progress_plans%rowtype;
  v_snapshot jsonb;
  v_changed integer;
  v_completed timestamptz;
begin
  if current_setting('transaction_isolation') <> 'read committed'
    or current_setting('session_replication_role') <> 'origin'
    or not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Progress cleanup needs review';
  end if;
  lock table public.user_progress,public.course_progress,public.deletion_progress_plans in share row exclusive mode;
  select * into v_receipt from public.account_deletion_requests where id=p_request_id for update;
  select * into v_plan from public.deletion_progress_plans where request_id=p_request_id for update;
  if v_receipt.id is null or v_plan.request_id is null
    or (v_receipt.account_id,v_receipt.generation,v_receipt.lease_token)
      is distinct from (p_account_id,p_generation,p_lease_token)
    or v_plan.account_id is distinct from v_receipt.account_id
    or (v_receipt.lease_until>clock_timestamp()) is not true
    or v_receipt.reviewed_at is null or nullif(btrim(v_receipt.reviewed_by),'') is null
    or v_plan.approved_at is null or nullif(btrim(v_plan.approved_by),'') is null
    or v_plan.plan_hash is distinct from p_plan_hash then
    raise exception 'Progress cleanup needs review';
  end if;
  perform u.id from auth.users u where u.id=v_plan.account_id for share;
  if not found then raise exception 'Progress cleanup needs review'; end if;
  v_snapshot := public.deletion_progress_snapshot(p_request_id,v_plan.account_id);
  if v_plan.completed_at is not null then
    if v_snapshot->'counts' is distinct from '{"user_progress":0,"course_progress":0}'::jsonb then
      raise exception 'Progress cleanup needs review';
    end if;
    return jsonb_build_object('progressCleaned',true,'alreadyCleaned',true,'accountDeleted',false);
  end if;
  if v_snapshot->>'planHash' is distinct from p_plan_hash
    or v_snapshot->>'schemaHash' is distinct from v_plan.schema_hash
    or v_snapshot->>'rowsHash' is distinct from v_plan.rows_hash
    or v_snapshot->'counts' is distinct from v_plan.counts then
    raise exception 'Progress cleanup needs review';
  end if;
  if exists (select 1 from pg_trigger where tgrelid in
      ('public.user_progress'::regclass,'public.course_progress'::regclass)
      and not tgisinternal and (tgtype::int & 8)<>0)
    or exists (select 1 from pg_constraint where contype='f' and confrelid in
      ('public.user_progress'::regclass,'public.course_progress'::regclass))
    or exists (select 1 from pg_rewrite where ev_class in ('public.user_progress'::regclass,
      'public.course_progress'::regclass,'public.deletion_progress_plans'::regclass))
    or exists (select 1 from pg_inherits where inhrelid in ('public.user_progress'::regclass,
      'public.course_progress'::regclass,'public.deletion_progress_plans'::regclass)
      or inhparent in ('public.user_progress'::regclass,'public.course_progress'::regclass,
        'public.deletion_progress_plans'::regclass)) then
    raise exception 'Progress cleanup needs review';
  end if;
  delete from public.user_progress where user_id=v_plan.account_id;
  get diagnostics v_changed=row_count;
  if v_changed is distinct from (v_plan.counts->>'user_progress')::integer then
    raise exception 'Progress cleanup needs review';
  end if;
  delete from public.course_progress where user_id=v_plan.account_id;
  get diagnostics v_changed=row_count;
  if v_changed is distinct from (v_plan.counts->>'course_progress')::integer then
    raise exception 'Progress cleanup needs review';
  end if;
  update public.deletion_progress_plans set completed_at=clock_timestamp()
    where request_id=p_request_id and exists (select 1 from public.account_deletion_requests
      where id=p_request_id and lease_until>clock_timestamp()) returning completed_at into v_completed;
  get diagnostics v_changed=row_count;
  if v_changed <> 1 or v_completed is null then raise exception 'Progress cleanup needs review'; end if;
  -- Whole-account states and the original deadlines stay unchanged.
  return jsonb_build_object('progressCleaned',true,'alreadyCleaned',false,'accountDeleted',false);
exception when others then
  raise exception 'Progress cleanup needs review' using errcode='P0001';
end;
$$;

revoke all on function public.deletion_progress_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_progress_cleanup(uuid) from public,anon,authenticated,service_role;
revoke all on function public.execute_progress_cleanup(uuid,uuid,bigint,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_progress_cleanup(uuid) to service_role;
grant execute on function public.execute_progress_cleanup(uuid,uuid,bigint,uuid,text) to service_role;

commit;
