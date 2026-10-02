import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { schemaInspectionSql } from './deletion-preflight.mjs'

const tables = ['user_progress', 'course_progress']
const trusted = JSON.parse(readFileSync(new URL('./deletion-progress-schema.json', import.meta.url)))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const refuse = () => { throw new Error('Progress cleanup needs review') }

async function setup(tx, isolation) {
  await tx.query(`set transaction isolation level ${isolation}`)
  await tx.query("set local lock_timeout = '5s'")
  await tx.query("set local statement_timeout = '30s'")
  await tx.query('set local row_security = off')
  const role = (await tx.query(`select (rolsuper or rolbypassrls)
    and current_setting('session_replication_role')='origin' as ok
    from pg_roles where rolname=current_user`)).rows[0]
  if (!role?.ok) refuse()
}

async function snapshot(tx, requestId, accountId) {
  const schema = (await tx.query(schemaInspectionSql)).rows
  // PostgreSQL 18 adds catalog entries for NOT NULL; column metadata already covers these.
  const nativeNulls = new Set((await tx.query(`select 'constraint:public.deletion_progress_plans.' || conname as object
    from pg_constraint where conrelid='public.deletion_progress_plans'::regclass and contype='n'`)).rows.map(row => row.object))
  const controls = schema.filter(row => !nativeNulls.has(row.object) && (row.object.includes('public.deletion_progress_plans')
    || row.object === 'function:public.guard_progress_plan()'
    || row.object === 'function:public.freeze_deleted_progress()'
    || row.object === 'trigger:public.user_progress.freeze_deleted_progress'
    || row.object === 'trigger:public.course_progress.freeze_deleted_progress'))
  // Approval can select rows, but cannot replace the cleanup safety controls.
  if (controls.length !== trusted.objects.length || controls.some((row, index) => {
    const expected = trusted.objects[index]
    return row.object !== expected.object || (row.fingerprint !== expected.fingerprint
      && !expected.alternateFingerprints?.includes(row.fingerprint))
  })) refuse()
  const executableIndex = (await tx.query(`select exists(select 1 from pg_index
    where indrelid='public.deletion_progress_plans'::regclass
      and (indexprs is not null or indpred is not null)) as unsafe`)).rows[0]
  if (executableIndex.unsafe) refuse()
  const schemaHash = hash(schema)
  const progress = {}
  for (const table of tables) {
    progress[table] = (await tx.query(`select count(*)::int as count,
      encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
        'version',t.xmin::text,'row',encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'))
        order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as fingerprint
      from public.${table} t where user_id=$1`, [accountId])).rows[0]
  }
  const rowsHash = hash(progress)
  const counts = Object.fromEntries(tables.map(table => [table, progress[table].count]))
  return { schemaHash, rowsHash, counts, planHash: hash({ requestId, accountId, schemaHash, rowsHash, counts }) }
}

export async function prepareProgressCleanup(db, requestId) {
  try {
    return await db.transaction(async tx => {
      await setup(tx, 'repeatable read')
      await tx.query('lock table public.deletion_progress_plans in row exclusive mode')
      const receipt = (await tx.query(`select r.account_id from public.account_deletion_requests r
        join auth.users u on u.id=r.account_id where r.id=$1 for update of r`, [requestId])).rows[0]
      if (!receipt) refuse()
      const existing = (await tx.query('select approved_at,completed_at from public.deletion_progress_plans where request_id=$1 for update', [requestId])).rows[0]
      if (existing?.approved_at || existing?.completed_at) refuse()
      const plan = await snapshot(tx, requestId, receipt.account_id)
      await tx.query(`insert into public.deletion_progress_plans
        (request_id,account_id,plan_hash,schema_hash,rows_hash,counts) values ($1,$2,$3,$4,$5,$6)
        on conflict(request_id) do update set account_id=excluded.account_id,
          plan_hash=excluded.plan_hash,schema_hash=excluded.schema_hash,
          rows_hash=excluded.rows_hash,counts=excluded.counts`,
      [requestId, receipt.account_id, plan.planHash, plan.schemaHash, plan.rowsHash, JSON.stringify(plan.counts)])
      return { counts: plan.counts, planHash: plan.planHash, approved: false }
    })
  } catch { refuse() }
}

export async function executeProgressCleanup(db, claim, planHash) {
  try {
    return await db.transaction(async tx => {
      await setup(tx, 'read committed')
      // ponytail: locks the small progress tables and ledger; use per-account guards if throughput requires it.
      await tx.query('lock table public.user_progress,public.course_progress,public.deletion_progress_plans in share row exclusive mode')
      const receipt = (await tx.query(`select *,lease_until>clock_timestamp() as live
        from public.account_deletion_requests where id=$1 for update`, [claim?.request_id])).rows[0]
      const plan = (await tx.query('select * from public.deletion_progress_plans where request_id=$1 for update', [claim?.request_id])).rows[0]
      if (!receipt || !plan || receipt.account_id !== claim.account_id || plan.account_id !== receipt.account_id
        || String(receipt.generation) !== String(claim.generation) || receipt.lease_token !== claim.lease_token
        || !receipt.live || !receipt.reviewed_at || !receipt.reviewed_by?.trim()
        || !plan.approved_at || !plan.approved_by?.trim() || plan.plan_hash !== planHash) refuse()
      if (!(await tx.query('select id from auth.users where id=$1 for share', [plan.account_id])).rows.length) refuse()
      const current = await snapshot(tx, claim.request_id, plan.account_id)
      if (plan.completed_at) {
        if (tables.some(table => current.counts[table] !== 0)) refuse()
        return { progressCleaned: true, alreadyCleaned: true, accountDeleted: false }
      }
      if (current.planHash !== planHash || current.schemaHash !== plan.schema_hash
        || current.rowsHash !== plan.rows_hash || tables.some(table => current.counts[table] !== plan.counts[table])) refuse()
      const effects = (await tx.query(`select
        exists(select 1 from pg_trigger where tgrelid in ('public.user_progress'::regclass,'public.course_progress'::regclass)
          and not tgisinternal and (tgtype::int & 8)<>0) or
        exists(select 1 from pg_constraint where contype='f' and confrelid in
          ('public.user_progress'::regclass,'public.course_progress'::regclass)) or
        exists(select 1 from pg_rewrite where ev_class in ('public.user_progress'::regclass,'public.course_progress'::regclass,
          'public.deletion_progress_plans'::regclass)) or
        exists(select 1 from pg_inherits where inhrelid in ('public.user_progress'::regclass,'public.course_progress'::regclass,
          'public.deletion_progress_plans'::regclass)
          or inhparent in ('public.user_progress'::regclass,'public.course_progress'::regclass,
          'public.deletion_progress_plans'::regclass)) as unsafe`)).rows[0]
      if (effects.unsafe) refuse()
      for (const table of tables) {
        const deleted = await tx.query(`delete from public.${table} where user_id=$1`, [plan.account_id])
        if (deleted.affectedRows !== plan.counts[table]) refuse()
      }
      const completed = await tx.query(`update public.deletion_progress_plans set completed_at=clock_timestamp()
        where request_id=$1 and exists(select 1 from public.account_deletion_requests
          where id=$1 and lease_until>clock_timestamp()) returning completed_at`, [claim.request_id])
      if (completed.affectedRows !== 1 || !completed.rows[0]?.completed_at) refuse()
      // Whole-account states and the original seven/thirty-day deadlines stay unchanged.
      return { progressCleaned: true, alreadyCleaned: false, accountDeleted: false }
    })
  } catch { refuse() }
}
