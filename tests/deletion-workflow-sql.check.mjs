import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
const source = path => readFile(new URL(path, import.meta.url), 'utf8')
const account = '00000000-0000-4000-8000-000000000001'
const laterAccount = '00000000-0000-4000-8000-000000000002'
const receipt = '00000000-0000-4000-8000-000000000011'

await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);`)
await db.exec(await source('../migrations/008_account_deletion_requests.sql'))
await db.query('insert into auth.users(id) values ($1)', [account])
await db.query(`insert into public.account_deletion_requests(id,account_id,requested_at)
  values ($1,$2,'2026-09-01T00:00:00Z')`, [receipt, account])
const migration = await source('../migrations/011_account_deletion_workflow.sql')
await db.exec(migration)
await db.exec(migration)

const original = (await db.query('select * from public.account_deletion_requests where id=$1', [receipt])).rows[0]
assert.equal(original.requested_at.toISOString(), '2026-09-01T00:00:00.000Z')
assert.equal(original.review_due_at.toISOString(), '2026-09-08T00:00:00.000Z')
assert.equal(original.ordinary_due_at.toISOString(), '2026-10-01T00:00:00.000Z')
assert.equal(original.next_run_at.toISOString(), original.requested_at.toISOString())
assert.equal(original.ordinary_state, 'pending')
assert.equal(original.held_state, 'pending')
assert.equal(original.reviewed_at, null)

await db.query(`insert into public.account_deletion_requests(account_id,requested_at)
  values ($1,'2026-09-25T00:00:00Z') on conflict(account_id) do nothing`, [account])
assert.deepEqual((await db.query('select id,requested_at,review_due_at,ordinary_due_at from public.account_deletion_requests')).rows.map(row => ({
  id: row.id, requested_at: row.requested_at.toISOString(), review_due_at: row.review_due_at.toISOString(),
  ordinary_due_at: row.ordinary_due_at.toISOString(),
})), [{ id: receipt, requested_at: original.requested_at.toISOString(),
  review_due_at: original.review_due_at.toISOString(), ordinary_due_at: original.ordinary_due_at.toISOString() }])
await db.exec(await source('../migrations/rollback/011_account_deletion_workflow.sql'))
assert.equal((await db.query(`select count(*)::int as n from pg_constraint
  where conrelid='public.account_deletion_requests'::regclass and conname='account_deletion_requests_account_id_fkey'`)).rows[0].n, 1)
await db.exec(migration)
await db.query(`insert into public.account_deletion_requests(account_id,requested_at,review_due_at,ordinary_due_at)
  values ($1,'2026-09-10T00:00:00Z','2026-09-11T00:00:00Z','2026-09-12T00:00:00Z')`, [laterAccount])
const later = (await db.query('select review_due_at,ordinary_due_at,next_run_at from public.account_deletion_requests where account_id=$1', [laterAccount])).rows[0]
assert.equal(later.review_due_at.toISOString(), '2026-09-17T00:00:00.000Z')
assert.equal(later.ordinary_due_at.toISOString(), '2026-10-10T00:00:00.000Z')
assert.equal(later.next_run_at.toISOString(), '2026-09-10T00:00:00.000Z')
await assert.rejects(db.transaction(async tx => tx.query(`update public.account_deletion_requests
  set requested_at='2026-09-02T00:00:00Z' where id=$1`, [receipt])), /deadlines cannot change/)
await assert.rejects(db.transaction(async tx => tx.query(`update public.account_deletion_requests
  set review_due_at='2026-09-09T00:00:00Z' where id=$1`, [receipt])), /deadlines cannot change/)

const { rows: [rights] } = await db.query(`select
  has_table_privilege('anon','public.account_deletion_requests','SELECT') as anon_select,
  has_table_privilege('authenticated','public.account_deletion_requests','INSERT') as account_insert,
  has_table_privilege('service_role','public.account_deletion_requests','SELECT,INSERT,UPDATE') as server_write,
  has_table_privilege('service_role','public.account_deletion_requests','DELETE') as server_delete`)
assert.deepEqual(rights, { anon_select: false, account_insert: false, server_write: true, server_delete: false })
await assert.rejects(db.transaction(async tx => tx.query(`update public.account_deletion_requests set reviewed_at=now() where id=$1`, [receipt])), /workflow_check/)
await db.query(`update public.account_deletion_requests set
  reviewed_at='2026-09-04T00:00:00Z',reviewed_by='operator-verified',
  ordinary_state='done',held_state='held',next_run_at=null,
  generation=1,lease_token='00000000-0000-4000-8000-000000000022',
  lease_until='2026-09-04T00:05:00Z' where id=$1`, [receipt])
await db.exec(migration)
assert.equal((await db.query('select next_run_at from public.account_deletion_requests where id=$1', [receipt])).rows[0].next_run_at, null)
assert.equal((await db.query('select count(*)::int as n from public.account_deletion_requests where ordinary_state=$1 and held_state=$2',
  ['done', 'held'])).rows[0].n, 1)
await db.query('delete from auth.users where id=$1', [account])
assert.equal((await db.query('select count(*)::int as n from public.account_deletion_requests where id=$1', [receipt])).rows[0].n, 1)
await assert.rejects(db.exec(await source('../migrations/rollback/011_account_deletion_workflow.sql')), /rollback refused/)
await db.close()
console.log('PASS: existing receipt backfill, repeat migration, stable retry, deadlines, service rights, workflow checks, Auth closure and guarded rollback.')
