import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { inventoryDeletion } from './deletion-inventory.mjs'

const coverage = JSON.parse(readFileSync(new URL('./deletion-coverage.json', import.meta.url)))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export const schemaInspectionSql = `
with recursive scope(oid) as (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' and c.relkind in ('r','p','v','m','f'))
     or (n.nspname = 'auth' and c.relname = 'users')
  union
  select fk.conrelid from pg_constraint fk join scope s on fk.confrelid = s.oid
  where fk.contype = 'f'
), objects as (
  select 'relation' as kind, n.nspname || '.' || c.relname as name,
    jsonb_build_object('kind', c.relkind, 'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity, 'acl', c.relacl,
      'view', case when c.relkind in ('v','m') then pg_get_viewdef(c.oid) else null end,
      'columns', (select jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
        'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
        'acl', a.attacl, 'default', pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))::text as definition
  from scope s join pg_class c on c.oid=s.oid join pg_namespace n on n.oid=c.relnamespace
  union all
  select 'constraint', n.nspname || '.' || c.relname || '.' || k.conname,
    pg_get_constraintdef(k.oid) || ':' || k.convalidated::text
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
  where k.conrelid in (select oid from scope) or k.confrelid in (select oid from scope)
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname,
    pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text || ':' || pg_get_functiondef(t.tgfoid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and t.tgrelid in (select oid from scope)
  union all
  select 'policy', n.nspname || '.' || c.relname || '.' || p.polname,
    jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select jsonb_agg(coalesce(r.rolname,'public') order by coalesce(r.rolname,'public'))
        from unnest(p.polroles) roleid left join pg_roles r on r.oid=roleid),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))::text
  from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where p.polrelid in (select oid from scope)
  union all
  select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    pg_get_functiondef(p.oid) || ':' || coalesce(p.proacl::text,'')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p')
)
select kind || ':' || name as object, encode(sha256(convert_to(definition,'UTF8')),'hex') as fingerprint
from objects order by kind, name`

const accountTables = {
  profiles: 't.id = u.id', user_progress: 't.user_id = u.id',
  store_entitlements: 't.account_id = u.id', revenuecat_sync_state: 't.account_id = u.id',
  annual_free_reservations: 't.account_id = u.id',
  course_grants: 't.user_id = u.id', course_progress: 't.user_id = u.id',
  care_links: '(t.client_id = u.id or t.practitioner_id = u.id)',
  care_tasks: '(t.client_id = u.id or t.practitioner_id = u.id)',
  care_messages: '(t.client_id = u.id or t.practitioner_id = u.id or t.sender_id = u.id)',
  care_task_entries: `exists (select 1 from public.care_tasks task where task.id=t.task_id
    and (task.client_id=u.id or task.practitioner_id=u.id))`,
}
const legacyTables = {
  users: 'email', session_completions: 'user_email', subscriptions: 'user_email',
  session_waitlist: 'email', custom_orders: 'user_email',
}
const unresolved = [
  'preflight_only_no_executor', 'live_schema_review_required', 'write_freeze_not_implemented',
  'historical_analytics_review', 'provider_dispositions_unreviewed', 'paid_work_review',
  'private_media_ownership', 'retention_decision', 'purchase_ownership_retention',
  'historical_email_mapping_required', 'legacy_ownership_review',
]

async function candidates(tx, table, predicate, requestId) {
  const { rows } = await tx.query(`
    select * from (
      select (select jsonb_object_agg(a.attname, to_jsonb(t)->a.attname)
        from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
        where i.indrelid='public.${table}'::regclass and i.indisprimary) as key,
        t.xmin::text as version, encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') as fingerprint
      from public.${table} t cross join public.account_deletion_requests r
      join auth.users u on u.id=r.account_id
      where r.id=$1::uuid and ${predicate}
    ) evidence order by key::text`, [requestId])
  if (rows.some(row => !row.key)) throw new Error('Missing primary key')
  return rows
}

export async function preflightDeletion(client, database, requestId) {
  try {
    const inventory = await inventoryDeletion(client, requestId)
    return await database.transaction(async tx => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await tx.query('SET LOCAL row_security = off')
      const role = await tx.query('select rolsuper or rolbypassrls as unrestricted from pg_roles where rolname=current_user')
      if (role.rows[0]?.unrestricted !== true) throw new Error('Restricted reader')
      const { rows: schema } = await tx.query(schemaInspectionSql)
      const observed = Object.fromEntries(schema.map(row => [row.object, row.fingerprint]))
      const changed = [...new Set([...Object.keys(coverage.objects), ...Object.keys(observed)])]
        .filter(key => observed[key] !== coverage.objects[key]).sort()
      const blockers = new Set([...unresolved, ...inventory.blockers])
      const manifest = { format: 1, requestId, accountId: inventory.accountId, schema, inventory, rows: {} }
      if (changed.length) blockers.add('schema_coverage_mismatch')
      else {
        const receipt = await tx.query(`select r.account_id, u.xmin::text as version from public.account_deletion_requests r
          join auth.users u on u.id=r.account_id where r.id=$1::uuid`, [requestId])
        if (receipt.rows.length !== 1 || receipt.rows[0].account_id !== inventory.accountId) throw new Error('Receipt changed')
        manifest.authVersion = receipt.rows[0].version
        manifest.rows.account_deletion_requests = await candidates(tx, 'account_deletion_requests', 't.id = r.id', requestId)
        for (const [table, predicate] of Object.entries(accountTables)) {
          manifest.rows[table] = await candidates(tx, table, predicate, requestId)
          if (table.startsWith('care_') && manifest.rows[table].length) blockers.add('shared_care_records')
        }
        for (const [table, column] of Object.entries(legacyTables)) {
          const normalizedColumn = table === 'subscriptions' || table === 'custom_orders'
            ? 't.user_email_normalized' : `lower(t.${column})`
          manifest.rows[table] = await candidates(tx, table,
            `u.email_confirmed_at is not null and btrim(u.email) <> '' and ${normalizedColumn}=lower(btrim(u.email))`, requestId)
          if (inventory.legacyCandidateCounts?.[table] !== manifest.rows[table].length) blockers.add('candidate_inventory_mismatch')
        }
      }
      const result = {
        status: 'blocked', canApprove: false, canExecute: false,
        planHash: hash(manifest), blockers: [...blockers].sort(),
        schemaDifferenceCount: changed.length,
        candidateCounts: Object.fromEntries(Object.entries(manifest.rows).map(([table, rows]) => [table, rows.length])),
      }
      return { summary: result, manifest }
    })
  } catch {
    return { summary: { status: 'blocked', canApprove: false, canExecute: false,
      planHash: null, blockers: ['read_failed'], schemaDifferenceCount: null, candidateCounts: {} }, manifest: null }
  }
}
