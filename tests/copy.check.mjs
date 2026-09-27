import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { receiptStatus } from '../api/_checkout-receipt.js'
import { build } from 'esbuild'
import { reviewedSession, unreviewedSessionIds, ui } from '../src/content/reviewedCopy.js'
import { HARDCODED_SESSIONS, HARDCODED_SESSIONS_BY_ID } from '../src/lib/hardcodedSessions.js'

const original = Object.freeze({ id: HARDCODED_SESSIONS[0].id, title: 'Old claim', description: 'Old description', free: false, has_audio: false, audio_url: null, duration: 37, category: 'Fixture', tags: ['unchanged'] })
const reviewed = reviewedSession(original)
assert.notEqual(reviewed, original)
assert.equal(original.title, 'Old claim')
assert.notEqual(reviewed.title, original.title)
assert.deepEqual(Object.fromEntries(Object.entries(reviewed).filter(([key]) => !['title', 'description'].includes(key))), Object.fromEntries(Object.entries(original).filter(([key]) => !['title', 'description'].includes(key))))
for (const id of ['unknown-session', 'toString', '__proto__']) {
  const unknown = { id, title: 'Unreviewed' }
  assert.equal(reviewedSession(unknown), unknown)
  assert.deepEqual(unreviewedSessionIds([unknown]), [id])
}
assert.deepEqual(unreviewedSessionIds(HARDCODED_SESSIONS), [])
for (const row of HARDCODED_SESSIONS) assert.equal(HARDCODED_SESSIONS_BY_ID[row.id].title, reviewedSession(row).title)
assert.equal(HARDCODED_SESSIONS.filter(row => row.free).length, 4)
assert.equal(HARDCODED_SESSIONS.filter(row => row.has_audio).length, 4)

async function apiModule(file, expose = '') {
  const result = await build({
    stdin: { contents: await readFile(file, 'utf8') + expose, resolveDir: dirname(resolve(file)), loader: 'js' },
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'local-providers', setup(builder) {
      builder.onResolve({ filter: /^(@supabase\/supabase-js|resend|stripe)$/ }, ({ path }) => ({ path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents:
        path === 'resend' ? 'export class Resend { constructor() { return globalThis.copyFixture.mail } }'
          : path === 'stripe' ? 'export default class Stripe { constructor() { return globalThis.copyFixture.stripe } }'
          : 'export const createClient = () => globalThis.copyFixture.db',
      }))
    } }],
  })
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
}

const sent = []
globalThis.copyFixture = {
  stripe: { webhooks: { constructEvent: () => globalThis.copyFixture.event }, checkout: { sessions: { retrieve: async () => globalThis.copyFixture.receipt || ({ payment_status: 'paid', customer_email: 'private@example.test', metadata: { type: 'subscription', plan: 'annual' } }) } } },
  mail: { emails: { send: async email => { sent.push(email); return {} } } },
  db: { from(table) {
    if (table === 'sessions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: original }) }) }) }
    assert.equal(table, 'session_waitlist')
    return { insert: async () => ({}) }
  } },
}
const { default: waitlist } = await apiModule('api/waitlist.js')
const res = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
await waitlist({ method: 'POST', headers: {}, body: { session_id: original.id, email: 'fixture@example.test' } }, res)
assert.equal(res.code, 200)
assert.ok(sent[0].subject.includes(reviewed.title))
assert.ok(sent[0].text.includes(reviewed.title))
assert.ok(!sent[0].text.includes('Old claim'))
assert.ok(!sent[0].text.includes('when it is ready'))

const emails = await apiModule('api/stripe-webhook.js', '\nexport { premiumWelcomeEmail, customAudioConfirmationEmail }\n')
for (const plan of ['monthly', undefined, 'other']) {
  const html = emails.premiumWelcomeEmail(plan)
  assert.ok(!html.includes('ANNUALFREE'))
  assert.ok(!html.includes(ui.annual_custom_help))
  assert.ok(html.includes(ui.premium_available))
}
assert.ok(emails.premiumWelcomeEmail('annual').includes('ANNUALFREE'))
assert.ok(emails.premiumWelcomeEmail('annual').includes(ui.annual_custom_help))
assert.ok(emails.customAudioConfirmationEmail().includes(ui.custom_access))
const { deliveryEmail } = await apiModule('api/deliver-audio.js', '\nexport { deliveryEmail }\n')
const delivery = deliveryEmail('https://example.test/download', { pattern: '', trigger: '', desired_state: '' })
assert.ok(delivery.includes(ui.listening_safety))
assert.ok(delivery.includes(ui.custom_use))
assert.ok(!delivery.includes('21 days'))
const { default: verifyReceipt } = await apiModule('api/verify-session.js')
await verifyReceipt({ method: 'GET', query: { session_id: 'fixture' } }, res)
assert.deepEqual(res.body, { status: 'paid', type: 'subscription', plan: 'annual' })

const writes = []
globalThis.copyFixture.db.from = function (table) { return {
    insert: async row => { writes.push({ table, row }); return {} },
    upsert: async () => ({}),
  }
}
async function webhook(type, status, fields = {}) {
  globalThis.copyFixture.event = { type, data: { object: { id: 'fixture', payment_status: status, metadata: { type: 'custom_audio', user_email: 'fixture@example.test' }, ...fields } } }
  const req = new EventEmitter()
  req.method = 'POST'
  req.headers = { 'stripe-signature': 'fixture' }
  const response = { status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, end() { return this } }
  const pending = emails.default(req, response)
  req.emit('end')
  await pending
  assert.equal(response.code, 200)
}
const before = sent.length
await webhook('checkout.session.completed', 'unpaid')
assert.equal(writes.length, 0)
assert.equal(sent.length, before)
await webhook('checkout.session.async_payment_succeeded', 'paid')
assert.equal(writes.length, 1)
assert.equal(writes[0].table, 'custom_orders')
assert.equal(sent.length, before + 1)
await webhook('checkout.session.completed', 'paid')
assert.equal(writes.length, 2)
assert.equal(sent.length, before + 2)
const freeOrder = {
  payment_status: 'no_payment_required', status: 'complete', mode: 'payment',
  currency: 'aud', amount_total: 0, amount_subtotal: 9900,
  total_details: { amount_discount: 9900 },
  metadata: { type: 'custom_audio', coupon_code: 'ANNUALFREE', discount_applied: '100', user_email: 'fixture@example.test' },
}
assert.equal(receiptStatus(freeOrder), 'no_payment_required')
const hostedPromotion = { ...freeOrder, metadata: { type: 'custom_audio' } }
assert.equal(receiptStatus(hostedPromotion), 'no_payment_required')
for (const changed of [
  { amount_total: 1 }, { amount_subtotal: 0 }, { total_details: { amount_discount: 0 } },
  { payment_status: 'unpaid' }, { status: 'open' }, { mode: 'subscription' }, { currency: 'usd' },
  { metadata: { ...freeOrder.metadata, type: 'subscription' } },
]) {
  const invalid = { ...freeOrder, ...changed }
  assert.equal(receiptStatus(invalid), null)
  globalThis.copyFixture.receipt = invalid
  await verifyReceipt({ method: 'GET', query: { session_id: 'fixture' } }, res)
  assert.equal(res.body.status, 'unconfirmed')
}
globalThis.copyFixture.receipt = freeOrder
await verifyReceipt({ method: 'GET', query: { session_id: 'fixture' } }, res)
assert.equal(res.body.status, 'no_payment_required')
const count = writes.length
globalThis.copyFixture.db.rpc = async () => ({})
await webhook('checkout.session.completed', 'no_payment_required', freeOrder)
assert.equal(writes.length, count + 1)
await webhook('checkout.session.completed', 'no_payment_required', hostedPromotion)
assert.equal(writes.length, count + 2)
await webhook('checkout.session.completed', 'no_payment_required', { ...freeOrder, amount_total: 1 })
assert.equal(writes.length, count + 2)
delete globalThis.copyFixture
console.log('Reviewed copy checks passed: metadata, unknown IDs, waitlist, monthly/annual email and delivery safety.')
