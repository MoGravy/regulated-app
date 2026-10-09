import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { claimDue, overdueRequests, processClaim, recordRequest } from '../scripts/deletion-worker-proof.mjs'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
await db.exec(await readFile(new URL('./fixtures/deletion-worker.sql', import.meta.url), 'utf8'))
await db.exec(`insert into proof_clock values ('2026-09-01 00:00+00');`)
const original = await recordRequest(db, 'r1', 'a')
await db.exec(`update proof_clock set instant='2026-09-29 12:00+00'`)
assert.deepEqual(await recordRequest(db, 'duplicate', 'a'), original)
assert.equal((await overdueRequests(db)).length, 1)
assert.equal((await overdueRequests(db))[0].review_overdue, true)
await db.exec(`insert into proof_ordinary values ('o1','a',1),('o2','b',1);
  insert into proof_clinical values
    ('c1','a',1,1,true,'verified clinician record','2019-09-29','2010-04-12',true,true,null),
    ('c2','b',1,1,true,'verified clinician record','2010-01-01','1980-01-01',false,true,null);
  insert into proof_operations(id,request_id,kind,resource_id,owner_id,expected_version,fact_version,approved)
  values ('op1','r1','ordinary','o1','a',1,null,true),
    ('op2','r1','clinical','c1','a',1,1,true);`)

const row = async (table, id) => (await db.query(`select * from ${table} where id=$1`, [id])).rows[0]
const first = await claimDue(db, 'r1', 'worker-a')
assert.equal(first.generation, 1)
assert.equal(await claimDue(db, 'r1', 'worker-b'), null)
await assert.rejects(processClaim(db, first, true), /simulated_crash/)
assert.ok(await row('proof_ordinary', 'o1'))
assert.equal((await row('proof_requests', 'r1')).ordinary_state, 'pending')
await db.exec(`update proof_clock set instant='2026-09-29 12:06+00'`)
const recovered = await claimDue(db, 'r1', 'worker-b')
assert.equal(recovered.generation, 2)
await assert.rejects(processClaim(db, first), /stale_claim/)
assert.deepEqual(await processClaim(db, recovered), { ordinaryState: 'done', heldState: 'held' })
assert.equal(await row('proof_ordinary', 'o1'), undefined)
assert.ok(await row('proof_ordinary', 'o2'))
assert.ok(await row('proof_clinical', 'c1'))
assert.ok(await row('proof_clinical', 'c2'))
let receipt = await row('proof_requests', 'r1')
assert.equal(receipt.review_due_at.toISOString(), '2026-09-08T00:00:00.000Z')
assert.equal(receipt.ordinary_due_at.toISOString(), '2026-10-01T00:00:00.000Z')
assert.equal(receipt.ordinary_state, 'done')
assert.equal(receipt.held_state, 'held')
assert.equal((await row('proof_operations', 'op2')).hold_through.toISOString().slice(0, 10), '2035-04-12')
assert.equal(receipt.next_run_at.toISOString(), '2035-04-12T14:30:00.000Z')

await db.exec(`update proof_clock set instant='2035-04-12 14:29+00'`)
assert.equal(await claimDue(db, 'r1', 'worker-c'), null)
await db.exec(`update proof_clock set instant='2035-04-12 14:31+00'`)
await db.exec(`update proof_clinical set fact_version=2 where id='c1'`)
const changed = await claimDue(db, 'r1', 'worker-c')
await assert.rejects(processClaim(db, changed), /clinical_evidence_changed/)
assert.ok(await row('proof_clinical', 'c1'))
assert.equal((await row('proof_requests', 'r1')).failures, 1)
await db.exec(`update proof_operations set fact_version=2 where id='op2'`)
await db.exec(`update proof_clock set instant='2035-04-12 15:32+00'`)
const released = await claimDue(db, 'r1', 'worker-c')
assert.deepEqual(await processClaim(db, released), { ordinaryState: 'done', heldState: 'done' })
assert.equal(await row('proof_clinical', 'c1'), undefined)
assert.ok(await row('proof_clinical', 'c2'))
receipt = await row('proof_requests', 'r1')
assert.equal(receipt.next_run_at, null)
assert.equal(receipt.ordinary_due_at.toISOString(), '2026-10-01T00:00:00.000Z')

await db.exec(`insert into proof_requests(id,account_id,requested_at,review_due_at,ordinary_due_at,next_run_at)
  values ('r2','x','2026-09-01','2026-09-08','2026-10-01','2026-09-01');
  insert into proof_operations(id,request_id,kind,resource_id,owner_id,expected_version,approved)
  values ('bad','r2','unexpected','o2','x',1,true);`)
await assert.rejects(processClaim(db, await claimDue(db, 'r2', 'worker-d')), /unknown_resource/)
assert.ok(await row('proof_ordinary', 'o2'))
assert.equal((await row('proof_requests', 'r2')).failures, 1)
assert.equal((await row('proof_requests', 'r2')).last_error, 'review_required')
await recordRequest(db, 'r3', 'z')
await db.exec(`insert into proof_ordinary values ('o3','z',1);
  insert into proof_clinical values
  ('c3','z',1,1,false,null,null,null,null,false,null);
  insert into proof_operations(id,request_id,kind,resource_id,owner_id,expected_version,fact_version,approved)
  values ('ordinary-before-review','r3','ordinary','o3','z',1,null,true),
    ('missing-facts','r3','clinical','c3','z',1,1,true);`)
assert.deepEqual(await processClaim(db, await claimDue(db, 'r3', 'worker-e')),
  { ordinaryState: 'done', heldState: 'review_required' })
assert.equal(await row('proof_ordinary', 'o3'), undefined)
assert.ok(await row('proof_clinical', 'c3'))
assert.equal((await row('proof_requests', 'r3')).reviewed_at, null)
assert.equal((await row('proof_requests', 'r3')).last_error, 'review_required')
await recordRequest(db, 'r4', 'y')
await db.exec(`insert into proof_ordinary values ('o4','y',1);
  insert into proof_operations(id,request_id,kind,resource_id,owner_id,expected_version,approved)
  values ('no-approval','r4','ordinary','o4','y',1,false);`)
await assert.rejects(processClaim(db, await claimDue(db, 'r4', 'worker-f')), /unapproved_operation/)
assert.ok(await row('proof_ordinary', 'o4'))
await db.close()
console.log('PASS disposable deletion worker: deadlines, lease recovery, owned deletion, hold expiry, changed and missing facts, unknown and unapproved resources')
