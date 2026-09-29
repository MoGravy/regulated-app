import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
await db.exec('create role anon; create role authenticated; create role service_role bypassrls')
const migration = await readFile(new URL('../migrations/012_annual_free_reservations.sql', import.meta.url), 'utf8')
await db.exec(migration)
await db.exec(migration)
const accountId = '00000000-0000-4000-8000-000000000001'
const firstId = '00000000-0000-4000-8000-000000000002'
await db.query('insert into annual_free_reservations(account_id,user_email,reservation_id) values ($1,$2,$3)', [accountId, 'a@example.test', firstId])
await assert.rejects(db.query('insert into annual_free_reservations(account_id,user_email,reservation_id) values ($1,$2,$3)', [accountId, 'a@example.test', '00000000-0000-4000-8000-000000000003']), /unique constraint/)
await db.exec('set role anon')
await assert.rejects(db.query('select * from annual_free_reservations'), /permission denied/)
await assert.rejects(db.query('insert into annual_free_reservations(account_id,user_email,reservation_id) values ($1,$2,$3)', ['00000000-0000-4000-8000-000000000004', 'b@example.test', '00000000-0000-4000-8000-000000000005']), /permission denied/)
await db.exec('reset role')
await db.close()

const rows = new Map()
let sessionStatus = 'open'
let reservationMatches = true
let serial = 0
const supabase = {
  from() {
    const filters = {}
    return {
      async insert(row) {
        if (rows.has(row.account_id)) return { error: { code: '23505' } }
        rows.set(row.account_id, { stripe_session_id: null, ...row })
        return {}
      },
      select() { return this },
      eq(key, value) { filters[key] = value; return this },
      is(key, value) { filters[key] = value; return this },
      async maybeSingle() {
        const data = [...rows.values()].find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) || null
        return { data }
      },
      delete() {
        return { eq(key, value) { filters[key] = value; return this }, then(resolve) {
          const row = [...rows.values()].find(item => Object.entries(filters).every(([key, value]) => item[key] === value))
          if (row) rows.delete(row.account_id)
          resolve({})
        } }
      },
      update(changes) {
        return { eq(key, value) { filters[key] = value; return this }, is(key, value) { filters[key] = value; return this }, select() { return this }, async maybeSingle() {
          const row = [...rows.values()].find(item => Object.entries(filters).every(([key, value]) => item[key] === value))
          if (!row) return { data: null }
          Object.assign(row, changes)
          return { data: row }
        } }
      },
    }
  },
}
const code = (await readFile(new URL('../api/_annualfree.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
const checkout = await readFile(new URL('../api/create-checkout.js', import.meta.url), 'utf8')
assert.ok(checkout.indexOf('await annualFreeCheckout(gate)') < checkout.indexOf('stripe.coupons.create('), 'Claim must precede Stripe writes')
assert.ok(checkout.includes('await saveAnnualFreeSession(annualReservation.accountId, annualReservation.id, session.id)'))
assert.ok(checkout.includes('annual_free_reservation_id: annualReservation.id'))
const context = vm.createContext({ process: { env: {} }, randomUUID: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
  createClient: () => supabase, Stripe: class { constructor() { return { checkout: { sessions: { retrieve: async id => ({
    id, status: sessionStatus, payment_status: 'unpaid', mode: 'payment',
    metadata: { annual_free_reservation_id: reservationMatches ? rows.get(accountId).reservation_id : 'other', user_email: gate.email },
    url: 'https://checkout.stripe.test/first',
  }) } } } } },
  callerUser() {}, activeSubscriptions() {}, normalEmail() {}, sameEmail() {} })
vm.runInContext(code + '\nglobalThis.reserve = annualFreeCheckout; globalThis.save = saveAnnualFreeSession', context)
const gate = { accountId, email: 'a@example.test' }
const claimed = await context.reserve(gate)
assert.equal(claimed.reservationId, '00000000-0000-4000-8000-000000000001')
assert.match((await context.reserve(gate)).error, /reserved/)
assert.equal(rows.size, 1, 'Unknown Stripe result must keep the only claim')
await context.save(accountId, claimed.reservationId, 'cs_first')
assert.equal((await context.reserve(gate)).session.id, 'cs_first', 'Open checkout is reused')
gate.email = 'new@example.test'
assert.match((await context.reserve(gate)).error, /email changed/)
assert.equal(rows.size, 1)
gate.email = 'a@example.test'
sessionStatus = 'complete'
assert.match((await context.reserve(gate)).error, /already been used/)
assert.equal(rows.size, 1)
sessionStatus = 'expired'
reservationMatches = false
await assert.rejects(context.reserve(gate), /does not match/)
assert.equal(rows.size, 1, 'Mismatched provider session cannot release the claim')
reservationMatches = true
assert.ok((await context.reserve(gate)).reservationId, 'Verified expiration permits a new claim')
assert.equal(rows.size, 1)
console.log('PASS one account claim, unknown holds, open reuse, complete blocks, verified expiry releases')
