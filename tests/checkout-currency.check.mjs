import { ui } from '../src/content/reviewedCopy.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { normalEmail } from '../api/_identity.js'
import { CURRENCY, CUSTOM_AUDIO_PRICE_CENTS, ANNUAL_FOUNDING_PRICE_CENTS, MONTHLY_PRICE_CENTS } from '../src/config/pricing.js'

const source = fs.readFileSync(new URL('../api/create-checkout.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default async function handler', 'async function handler')

async function call(body, options = {}) {
  const calls = { prices: [], coupons: [], checkouts: [], database: 0 }
  const expected = { active: true, currency: 'aud', type: 'recurring', unit_amount: body.plan === 'annual' ? 14900 : 1900, recurring: { interval: body.plan === 'annual' ? 'year' : 'month', interval_count: 1 } }
  const stripe = {
    prices: { async retrieve(id) { calls.prices.push(id); if (options.lookupError) throw new Error('Fixture price unavailable'); return { ...expected, ...options.price } } },
    coupons: { async create(input) { calls.coupons.push(input); return { id: 'fixture-coupon' } } },
    checkout: { sessions: { async create(input) { calls.checkouts.push(input); return { id: 'fixture-session', url: '/fixture-checkout' } } } },
  }
  const database = { from(table) {
    calls.database++
    assert.equal(table, 'coupons')
    return { select() { return this }, eq() { return this }, async single() { return { data: { code: options.code || 'FIXTURE', active: true, max_uses: null, discount_type: options.percentage ? 'percentage' : 'fixed', discount_amount: 10 } } } }
  } }
  const context = vm.createContext({
    normalEmail,
    ui, CURRENCY, CUSTOM_AUDIO_PRICE_CENTS, ANNUAL_FOUNDING_PRICE_CENTS, MONTHLY_PRICE_CENTS,
    process: { env: options.missingConfig ? {} : { STRIPE_PRICE_ANNUAL: 'fixture-annual', STRIPE_PRICE_MONTHLY: 'fixture-monthly' } },
    Stripe: class { constructor() { return stripe } },
    createClient: () => database,
    ANNUAL_FREE: 'ANNUALFREE', annualFreeCheck: async () => { throw new Error('Unexpected free-order gate') },
    console: { error() {} },
  })
  vm.runInContext(source + '\nglobalThis.handler = handler', context)
  let status, payload
  const response = { status(value) { status = value; return this }, json(value) { payload = value; return this }, end() { return this } }
  await context.handler({ method: 'POST', headers: { origin: 'https://example.test' }, body }, response)
  return { status, payload, calls }
}

assert.equal(CURRENCY, 'aud')
const custom = await call({ type: 'custom_audio', email: 'fixture@example.test', currency: 'usd', price: 1, couponCode: 'FIXTURE' })
assert.equal(custom.status, 200)
assert.equal(custom.calls.checkouts[0].line_items[0].price_data.currency, 'aud')
assert.equal(custom.calls.checkouts[0].line_items[0].price_data.unit_amount, 9900)
assert.equal(custom.calls.checkouts[0].line_items[0].price_data.product_data.description, ui.custom_personalized)
assert.equal(custom.calls.coupons[0].currency, 'aud')
assert.equal(custom.calls.coupons[0].amount_off, 1000)
assert.equal(custom.calls.prices.length, 0)
assert.equal('allow_promotion_codes' in custom.calls.checkouts[0], false)
const customNoCode = await call({ type: 'custom_audio', email: 'fixture@example.test' })
assert.equal('allow_promotion_codes' in customNoCode.calls.checkouts[0], false)
const percentage = await call({ type: 'custom_audio', couponCode: 'FIXTURE' }, { percentage: true })
assert.equal(percentage.calls.coupons[0].percent_off, 10)
assert.equal('currency' in percentage.calls.coupons[0], false)

for (const plan of ['annual', 'monthly']) {
  const valid = await call({ type: 'subscription', plan, currency: 'usd', price: 1 })
  assert.equal(valid.status, 200)
  assert.equal(valid.calls.prices[0], `fixture-${plan}`)
  assert.equal(valid.calls.checkouts[0].line_items[0].price, `fixture-${plan}`)
  assert.equal(valid.calls.checkouts[0].metadata.plan, plan)
  assert.equal('allow_promotion_codes' in valid.calls.checkouts[0], false)
}
const subscriptionCoupon = await call({ type: 'subscription', plan: 'annual', couponCode: 'FIXTURE' })
assert.equal(subscriptionCoupon.status, 200)
assert.equal(subscriptionCoupon.calls.checkouts[0].metadata.coupon_code, 'FIXTURE')
assert.equal(subscriptionCoupon.calls.checkouts[0].discounts[0].coupon, 'fixture-coupon')
assert.equal('allow_promotion_codes' in subscriptionCoupon.calls.checkouts[0], false)
const freeSubscription = await call({ type: 'subscription', plan: 'annual', couponCode: 'ANNUALFREE' }, { code: 'ANNUALFREE' })
assert.equal(freeSubscription.status, 400)
assert.equal(freeSubscription.calls.coupons.length, 0)
assert.equal(freeSubscription.calls.checkouts.length, 0)
for (const options of [
  { price: { currency: 'usd' } }, { price: { currency: undefined } },
  { lookupError: true }, { missingConfig: true },
  { price: { active: false } }, { price: { type: 'one_time' } },
  { price: { unit_amount: 19900 } }, { price: { unit_amount: undefined } },
  { price: { recurring: { interval: 'month', interval_count: 1 } } },
  { price: { recurring: { interval: 'year', interval_count: 2 } } },
  { price: { recurring: undefined } },
]) {
  const blocked = await call({ type: 'subscription', plan: 'annual', couponCode: 'FIXTURE' }, options)
  assert.equal(blocked.status, 500)
  assert.equal(blocked.calls.coupons.length, 0)
  assert.equal(blocked.calls.checkouts.length, 0)
  assert.equal(blocked.calls.database, 0)
}
for (const plan of [undefined, '', 'weekly', 'ANNUAL']) {
  const blocked = await call({ type: 'subscription', plan, couponCode: 'FIXTURE' })
  assert.equal(blocked.status, 400)
  assert.equal(blocked.calls.prices.length, 0)
  assert.equal(blocked.calls.coupons.length, 0)
  assert.equal(blocked.calls.checkouts.length, 0)
}
console.log('PASS: AUD amounts and configured recurring price agreement, invalid-plan rejection, no provider mutation on mismatch.')
