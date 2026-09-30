import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { DAP_ID, DAP_AMOUNT, dapReceipt, dapCheckoutMatches, reconcileDap, reconcileDapRefund } from '../api/_dap-payment.js'

const user = { id: '30000000-0000-4000-8000-000000000001', email: 'buyer@example.test', email_confirmed_at: '2026-01-01' }
const purchase = { id: '40000000-0000-4000-8000-000000000001', user_id: user.id, course_id: DAP_ID, checkout_session_id: 'cs_fixture' }
const receipt = {
  id: purchase.checkout_session_id, client_reference_id: user.id,
  metadata: { type: 'dap', purchase_id: purchase.id, user_id: user.id },
  mode: 'payment', status: 'complete', payment_status: 'paid', livemode: true,
  currency: 'aud', amount_subtotal: DAP_AMOUNT, amount_total: DAP_AMOUNT, total_details: { amount_discount: 0 },
  payment_intent: { id: 'pi_fixture', status: 'succeeded', livemode: true, currency: 'aud',
    amount: DAP_AMOUNT, amount_received: DAP_AMOUNT, metadata: { type: 'dap', purchase_id: purchase.id },
    latest_charge: { payment_intent: 'pi_fixture', livemode: true, paid: true, captured: true,
      currency: 'aud', amount: DAP_AMOUNT, amount_refunded: 0, disputed: false } },
}
assert.deepEqual(dapReceipt(receipt, purchase), { intentId: 'pi_fixture', fullyRefunded: false })
for (const mutate of [
  x => { x.payment_status = 'unpaid' }, x => { x.status = 'open' },
  x => { x.mode = 'subscription' }, x => { x.currency = 'usd' }, x => { x.livemode = false },
  x => { x.amount_total = 1 }, x => { x.amount_subtotal = 1 }, x => { x.total_details.amount_discount = 1 },
  x => { x.client_reference_id = 'another-buyer' }, x => { x.metadata.user_id = 'another-buyer' },
  x => { x.metadata.purchase_id = 'another-order' }, x => { x.metadata.type = 'subscription' },
  x => { x.payment_intent.currency = 'usd' }, x => { x.payment_intent.amount_received = 0 },
  x => { x.payment_intent.status = 'processing' }, x => { x.payment_intent.livemode = false },
  x => { x.payment_intent.metadata.purchase_id = 'another-order' },
  x => { x.payment_intent.latest_charge.payment_intent = 'pi_other' },
  x => { x.payment_intent.latest_charge.captured = false },
  x => { x.payment_intent.latest_charge.amount_refunded = -1 },
  x => { x.payment_intent.latest_charge.amount_refunded = DAP_AMOUNT + 1 },
  x => { x.payment_intent.latest_charge.disputed = true },
  x => { x.payment_intent = 'pi_not-expanded' },
]) {
  const altered = structuredClone(receipt); mutate(altered)
  assert.equal(dapReceipt(altered, purchase), null)
}
assert.equal(dapReceipt(receipt, { ...purchase, course_id: 'private-empowerment' }), null)
assert.equal(dapReceipt(receipt, { ...purchase, payment_intent_id: 'pi_other' }), null)
const fullRefund = structuredClone(receipt)
fullRefund.payment_intent.latest_charge.amount_refunded = DAP_AMOUNT
assert.equal(dapReceipt(fullRefund, purchase).fullyRefunded, true)
fullRefund.payment_intent.latest_charge.disputed = true
assert.equal(dapReceipt(fullRefund, purchase).fullyRefunded, true)
const partial = structuredClone(receipt); partial.payment_intent.latest_charge.amount_refunded = 1
assert.equal(dapReceipt(partial, purchase).fullyRefunded, false)

let writes = 0
const db = {
  from() { return { select() { return this }, eq() { return this }, async maybeSingle() { return { data: purchase } } } },
  async rpc(name, params) { assert.equal(name, 'reconcile_dap_purchase'); assert.equal(params.checkout_id, receipt.id); writes++; return { data: true } },
}
const provider = {
  checkout: { sessions: { async retrieve(id, params) { assert.equal(id, receipt.id); assert.deepEqual(params.expand, ['payment_intent.latest_charge']); return receipt } } },
  paymentIntents: { async retrieve() { return receipt.payment_intent } },
}
assert.equal(await reconcileDap(receipt.id, db, provider), true)
assert.equal(await reconcileDapRefund('pi_fixture', db, provider), true)
assert.equal(writes, 2)
assert.equal(await reconcileDapRefund('invalid', db, provider), false)
await assert.rejects(reconcileDap(receipt.id, { ...db, async rpc() { return { data: false } } }, provider))

const source = fs.readFileSync(new URL('../api/_dap-checkout.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace('export default async function handler', 'async function handler')
async function checkout(options = {}) {
  const calls = { reconciled: 0, retrieved: 0, filters: [], created: [], updates: [], reservations: 0, expired: [], identity: 0 }
  const pending = { ...purchase, checkout_session_id: options.reuse ? receipt.id : null }
  const database = {
    async rpc(name, params) { assert.equal(name, 'reserve_dap_checkout'); assert.equal(params.account, user.id); calls.reservations++; return { data: options.hasAccess ? null : pending } },
    from(table) {
      assert.ok(['dap_purchases', 'course_grants'].includes(table))
      return { update(value) { calls.updates.push(value); return this }, eq(key, value) { calls.filters.push([key, value]); return this }, is() { return this }, select() { return this },
        async maybeSingle() { return { data: table === 'course_grants' ? (options.ready ? { course_id: DAP_ID } : null) : options.foreign ? null : pending } },
        async single() { return options.saveError ? { error: { code: 'fixture' } } : { data: { checkout_session_id: receipt.id } } } }
    },
  }
  const stripe = { checkout: { sessions: {
    async create(params, idempotency) { calls.created.push(params); assert.equal(idempotency.idempotencyKey, `dap:${purchase.id}`); return { id: receipt.id, status: 'open', url: 'https://checkout.stripe.com/fixture', livemode: !options.testMode } },
    async retrieve() { calls.retrieved++; return { ...receipt, ...options.reusedChanges, status: 'open', url: 'https://checkout.stripe.com/fixture' } },
    async expire(id) { calls.expired.push(id) },
  } } }
  const context = vm.createContext({ DAP_ID, DAP_AMOUNT, dapCheckoutMatches,
    reconcileDap: async () => { calls.reconciled++; return !options.unpaid },
    process: { env: { DAP_SALES_ENABLED: options.disabled ? undefined : 'true' } },
    Stripe: class { constructor() { return stripe } }, createClient: () => database,
    callerUser: async () => { calls.identity++; return options.signedOut ? null : options.unconfirmed ? { ...user, email_confirmed_at: null } : user },
  })
  vm.runInContext(source + '\nglobalThis.handler=handler', context)
  let status, payload
  const res = { setHeader() {}, status(n) { status = n; return this }, json(x) { payload = x; return this }, end() {} }
  await context.handler({ method: options.method || 'POST', headers: {}, body: { price: 1, currency: 'usd', email: 'impostor@example.test', user_id: 'impostor', ...(options.status ? { action: 'status', sessionId: options.sessionId || receipt.id } : {}) } }, res)
  return { calls, status, payload }
}
const valid = await checkout()
assert.equal(valid.status, 200)
assert.equal(valid.calls.created.length, 1)
const sent = valid.calls.created[0]
assert.equal(sent.customer_email, user.email)
assert.equal(sent.client_reference_id, user.id)
assert.equal(sent.line_items[0].price_data.currency, 'aud')
assert.equal(sent.line_items[0].price_data.unit_amount, 24700)
assert.equal(sent.line_items[0].quantity, 1)
assert.equal('discounts' in sent, false)
assert.equal('allow_promotion_codes' in sent, false)
for (const opts of [{ signedOut: true }, { unconfirmed: true }]) {
  const r = await checkout(opts); assert.equal(r.status, 401); assert.equal(r.calls.created.length, 0)
}
const off = await checkout({ disabled: true })
assert.equal(off.status, 503); assert.equal(off.calls.identity, 0)
const owned = await checkout({ hasAccess: true }); assert.equal(owned.status, 409); assert.equal(owned.calls.created.length, 0)
const reused = await checkout({ reuse: true }); assert.equal(reused.status, 200); assert.equal(reused.calls.created.length, 0)
const wrongReused = await checkout({ reuse: true, reusedChanges: { currency: 'usd' } }); assert.equal(wrongReused.status, 409)
for (const opts of [{ testMode: true }, { saveError: true }]) {
  const r = await checkout(opts); assert.equal(r.status, 500); assert.equal(r.calls.expired.length, 1)
}
console.log('PASS: DAP account-bound AUD247 checkout, sale-off gate, paid/refunded evidence and failure checks. Synthetic only.')

const availability = await checkout({ method: 'GET', disabled: true })
assert.equal(availability.status, 200); assert.equal(availability.payload.enabled, false)
assert.equal(availability.calls.identity, 0)
const foreign = await checkout({ status: true, foreign: true })
assert.equal(foreign.status, 404); assert.equal(foreign.calls.reconciled, 0)
assert.ok(foreign.calls.filters.some(([key, value]) => key === 'user_id' && value === user.id))
const invalidSession = await checkout({ status: true, sessionId: 'foreign/url' })
assert.equal(invalidSession.status, 400); assert.equal(invalidSession.calls.reconciled, 0)
const unpaidStatus = await checkout({ status: true, unpaid: true })
assert.equal(unpaidStatus.status, 200); assert.equal(unpaidStatus.payload.ready, false)
assert.equal(unpaidStatus.calls.created.length, 0)
const paidStatus = await checkout({ status: true, ready: true, disabled: true })
assert.equal(paidStatus.status, 200); assert.equal(paidStatus.payload.ready, true)
assert.equal(paidStatus.calls.reconciled, 1)
console.log('DAP status ownership and availability checks PASS')
