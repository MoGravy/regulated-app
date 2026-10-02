import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { handleDeletionDispatch } from '../api/_deletion-dispatch.js'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
const source = path => readFile(new URL(path, import.meta.url), 'utf8')
await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key)')
for (const file of ['008_account_deletion_requests.sql', '011_account_deletion_workflow.sql', '019_deletion_dispatch.sql']) {
  await db.exec(await source(`../migrations/${file}`))
}
await db.exec(await source('../migrations/019_deletion_dispatch.sql'))
const account = '00000000-0000-4000-8000-000000000001'
await db.query(`insert into public.account_deletion_requests(account_id,requested_at) values ($1,now()-interval '31 days')`, [account])
const original = (await db.query('select requested_at,review_due_at,ordinary_due_at from public.account_deletion_requests')).rows
const claim = async () => (await db.query('select * from public.claim_deletion_requests(10)')).rows
const [first] = await claim()
assert.ok(first.lease_token)
assert.deepEqual(await claim(), [], 'Duplicate dispatch must not claim the live lease')
const settle = async (item, failed = false) => (await db.query('select public.settle_deletion_dispatch($1,$2,$3,$4) as ok',
  [item.request_id, item.generation, item.lease_token, failed])).rows[0].ok
assert.equal(await settle({ ...first, lease_token: account }), false)
await db.exec("update public.account_deletion_requests set lease_until=now()-interval '1 second'")
assert.equal(await settle(first), false, 'Expired worker cannot settle')
const [second] = await claim()
assert.equal(second.generation, first.generation + 1)
assert.notEqual(second.lease_token, first.lease_token)
assert.equal(await settle(first), false)
assert.equal(await settle(second, true), true)
assert.deepEqual(await claim(), [])
let row = (await db.query('select * from public.account_deletion_requests')).rows[0]
assert.equal(row.failures, 1)
assert.equal(row.last_error_code, 'dispatch_failed')
assert.equal(row.ordinary_state, 'review_required')
assert.equal(row.reviewed_at, null, 'Inventory does not count as operator approval')
assert.equal(row.lease_token, null)
assert.ok(row.next_run_at > new Date())
assert.deepEqual((await db.query('select requested_at,review_due_at,ordinary_due_at from public.account_deletion_requests')).rows, original)
await db.exec("update public.account_deletion_requests set next_run_at=now()-interval '2 days',ordinary_state='done',held_state='held'")
const [held] = await claim()
assert.equal(await settle(held), true)
row = (await db.query('select * from public.account_deletion_requests')).rows[0]
assert.equal(row.ordinary_state, 'done')
assert.equal(row.held_state, 'held', 'Due hold cannot become deleted by dispatch')
await db.exec("update public.account_deletion_requests set ordinary_state='done',held_state='done',next_run_at=now()-interval '1 day'")
assert.deepEqual(await claim(), [])
for (const role of ['anon', 'authenticated']) {
  const { rows: [rights] } = await db.query(`select has_function_privilege($1,'public.claim_deletion_requests(integer)','execute') as claim,
    has_function_privilege($1,'public.settle_deletion_dispatch(uuid,bigint,uuid,boolean)','execute') as settle`, [role])
  assert.deepEqual(rights, { claim: false, settle: false })
}
await db.close()

const env = { CRON_SECRET: 'disposable-fixture-only', DELETION_DISPATCH_ENABLED: 'true', DELETION_MONITOR_ENABLED: 'true',
  DELETION_ALERT_EMAIL: 'operator@example.test', RESEND_API_KEY: 'disposable-provider-stub' }
async function request(overrides = {}) {
  let status, body, calls = 0
  const database = { async rpc(name) {
    calls++
    return name === 'claim_deletion_requests' ? { data: [first] } : { data: true }
  } }
  await handleDeletionDispatch({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` }, ...overrides.req }, {
    setHeader() {}, status(code) { status = code; return this }, json(value) { body = value; return this },
  }, { env, database: () => database, inventory: async () => ({ accountId: account }),
    alert: async (_req, res) => res.status(200).json({ ok: true }), ...overrides.dependencies })
  return { status, body, calls }
}
assert.equal((await request({ req: { method: 'POST' } })).status, 405)
assert.deepEqual(await request({ req: { headers: {} } }), { status: 401, body: { error: 'Unauthorized' }, calls: 0 })
assert.equal((await request({ dependencies: { env: { ...env, DELETION_DISPATCH_ENABLED: 'false' } } })).status, 503)
assert.deepEqual((await request()).body, { ok: true, inventoried: 1, failed: 0, completed: 0 })
assert.deepEqual((await request({ dependencies: { inventory: async () => { throw new Error('private detail') } } })).body,
  { ok: true, inventoried: 0, failed: 1, completed: 0 })
const failedAlert = await request({ dependencies: { alert: async (_req, res) => res.status(500).json({ error: 'private email' }) } })
assert.equal(failedAlert.status, 500)
assert.equal(JSON.stringify(failedAlert.body).includes('private'), false)
assert.equal((await request({ dependencies: { database: () => ({ rpc: async () => ({ data: false }) }) } })).status, 500)
console.log('PASS: durable dispatch leases, crash/reclaim, deadlines, protected holds, permissions, authentication and alert failures. No cleanup completion claimed.')
