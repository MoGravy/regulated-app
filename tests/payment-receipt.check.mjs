import assert from 'node:assert/strict'
import { receiptStatus } from '../api/_checkout-receipt.js'

const free = {
  status: 'complete', mode: 'payment', payment_status: 'no_payment_required',
  metadata: { type: 'custom_audio' }, currency: 'aud', amount_total: 0,
  amount_subtotal: 9900, total_details: { amount_discount: 9900 },
}
assert.equal(receiptStatus(free), 'no_payment_required')
for (const change of [
  { status: 'open' }, { mode: 'subscription' }, { currency: 'usd' },
  { amount_total: 1 }, { amount_subtotal: 1 },
  { total_details: { amount_discount: 1 } },
  { metadata: { type: 'subscription' } },
]) assert.equal(receiptStatus({ ...free, ...change }), null)
assert.equal(receiptStatus({ metadata: { type: 'subscription' }, payment_status: 'paid' }), 'paid')
assert.equal(receiptStatus({ metadata: { type: 'custom_audio' }, payment_status: 'unpaid' }), null)
console.log('PASS paid receipt and exact free custom checkout')
