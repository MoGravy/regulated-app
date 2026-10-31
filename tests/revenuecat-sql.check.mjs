import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.argv[2]) throw new Error('Pass the local PGlite module path; no production database is used.')
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = await PGlite.create()
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const T1 = '33333333-3333-4333-8333-333333333333'
const T2 = '44444444-4444-4444-8444-444444444444'
const T3 = '55555555-5555-4555-8555-555555555555'
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const claim = (id, token) => one('select * from public.claim_revenuecat_sync($1,$2,45)', [id, token])
const commit = (id, generation, token, rows, seconds = 300) => one(
  'select * from public.commit_revenuecat_snapshot($1,$2,$3,$4::jsonb,$5)',
  [id, generation, token, JSON.stringify(rows), seconds],
)
const release = (id, generation, token) => db.query(
  'select public.release_revenuecat_sync($1,$2,$3)', [id, generation, token],
)
const row = (id = 'fixture-subscription') => ({
  external_id: id, product_id: 'fixture-product', status: 'active',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
})
const expireFresh = id => db.query("update public.revenuecat_sync_state set fresh_until=now()-interval '1 second' where account_id=$1", [id])

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
  `)
  await db.query('insert into auth.users values ($1),($2)', [A, B])
  for (const file of ['007_store_entitlements.sql', '009_revenuecat_sync.sql']) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  for (const role of ['anon', 'authenticated']) {
    for (const signature of [
      'public.claim_revenuecat_sync(uuid,uuid,integer)',
      'public.commit_revenuecat_snapshot(uuid,bigint,uuid,jsonb,integer)',
      'public.release_revenuecat_sync(uuid,bigint,uuid)',
    ]) {
      assert.equal((await one('select has_function_privilege($1,$2,\'EXECUTE\') as allowed', [role, signature])).allowed, false)
    }
  }
  const initial = await claim(A, T1)
  assert.equal(initial.claimed, true)
  assert.equal((await one('select * from public.commit_revenuecat_snapshot($1,$2,$3,NULL,300)', [A, initial.generation, T1])).committed, false)
  const competing = await claim(A, T2)
  assert.equal(competing.claimed, false)
  assert.equal(competing.fresh, false)
  assert.equal((await commit(A, initial.generation, T1, [row()])).committed, true)
  const saved = await one("select account_id,expires_at > now() as active,expires_at <= now()+interval '300 seconds' as bounded from public.store_entitlements")
  assert.deepEqual(saved, { account_id: A, active: true, bounded: true })
  assert.equal((await commit(A, initial.generation, T1, [])).committed, false, 'A cleared lease cannot be replayed')
  const cached = await claim(A, T2)
  assert.equal(cached.claimed, false)
  assert.equal(cached.fresh, true)

  const other = await claim(B, T2)
  assert.equal((await commit(B, other.generation, T2, [row('new-before-conflict'), row()])).committed, false)
  assert.equal((await one('select count(*)::int as count from public.store_entitlements')).count, 1)
  assert.equal((await one("select account_id from public.store_entitlements where external_id='fixture-subscription'")).account_id, A)
  await assert.rejects(commit(B, other.generation, T2, [row('rollback-first'), { ...row('rollback-invalid'), expires_at: 'not-a-date' }]))
  assert.equal((await one('select count(*)::int as count from public.store_entitlements')).count, 1)
  await release(B, other.generation, T2)

  await expireFresh(A)
  const next = await claim(A, T2)
  assert.equal(next.claimed, true)
  assert.ok(BigInt(next.generation) > BigInt(initial.generation))
  assert.equal((await commit(A, initial.generation, T1, [])).committed, false)
  await release(A, initial.generation, T1)
  assert.equal((await claim(A, T3)).claimed, false)
  await db.query("update public.revenuecat_sync_state set lease_until=now()-interval '1 second' where account_id=$1", [A])
  const recovered = await claim(A, T3)
  assert.equal(recovered.claimed, true)
  assert.ok(BigInt(recovered.generation) > BigInt(next.generation))
  assert.equal((await commit(A, next.generation, T2, [row('stale-worker')])).committed, false)
  assert.equal((await commit(A, recovered.generation, T3, [], 5)).committed, true)
  assert.equal((await one("select count(*)::int as count from public.store_entitlements where account_id=$1 and status in ('active','grace') and expires_at>now()", [A])).count, 0)
  assert.equal((await one("select fresh_until <= now()+interval '5 seconds' as short from public.revenuecat_sync_state where account_id=$1", [A])).short, true)

  await expireFresh(A)
  const again = await claim(A, T1)
  assert.equal((await commit(A, again.generation, T1, [row()])).committed, true)
  assert.equal((await one("select count(*)::int as count from public.store_entitlements where external_id='fixture-subscription'")).count, 1)
  console.log('PASS: real PostgreSQL migration/RPC execution, client-role denial, leases, cache bounds, immutable ownership, atomic conflict rollback, stale-worker rejection, crash recovery, revocation and repeated snapshots.')
  console.log('PGlite runs one connection; this is not a multi-connection concurrency stress test.')
} catch (error) {
  console.error('FAIL:', error.code || '', error.message)
  if (error.internalQuery) console.error(error.internalQuery)
  process.exitCode = 1
} finally {
  await db.close()
}
