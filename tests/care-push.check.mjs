import assert from 'node:assert/strict'
import { dispatchCarePush, scheduledDispatch, validSubscription } from '../api/_care-push.js'

const schedulerSecret = 'fixture-only-not-a-real-secret-123456789'
const scheduledRequest = { method: 'POST', body: { action: 'dispatch' }, headers: { authorization: `Bearer ${schedulerSecret}` } }
assert.equal(scheduledDispatch(scheduledRequest, schedulerSecret), true)
for (const request of [
  { ...scheduledRequest, method: 'GET' },
  { ...scheduledRequest, body: { action: 'subscribe' } },
  { ...scheduledRequest, body: { action: 'unsubscribe' } },
  { ...scheduledRequest, headers: {} },
  { ...scheduledRequest, headers: { authorization: `Bearer ${schedulerSecret.slice(0, -1)}x` } },
  { ...scheduledRequest, headers: { authorization: `Bearer ${'é'.repeat(schedulerSecret.length)}` } },
]) assert.equal(scheduledDispatch(request, schedulerSecret), false)
assert.equal(scheduledDispatch(scheduledRequest, ''), false)
assert.equal(scheduledDispatch(scheduledRequest, 'short'), false)

const subscription = { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } }
assert.equal(validSubscription(subscription), true)
for (const endpoint of ['http://web.push.apple.com/x', 'https://127.0.0.1/x', 'https://web.push.apple.com.evil.test/x', 'https://user:pass@web.push.apple.com/x', 'https://web.push.apple.com:8443/x']) {
  assert.equal(validSubscription({ ...subscription, endpoint }), false)
}
assert.equal(validSubscription({ ...subscription, keys: { p256dh: 'x', auth: 'y' } }), false)

function database({ active = true, recipient = 'client', sendError = null } = {}) {
  const writes = [], payloads = []
  const db = {
    rpc: async (name, args) => {
      assert.equal(name, 'claim_care_push'); assert.deepEqual(args, { actor: 'practitioner' })
      return { data: [{ id: 'job', recipient_id: 'client', client_id: 'client', practitioner_id: 'practitioner', subscription_id: 'device', kind: 'task' }], error: null }
    },
    from(table) {
      const chain = {
        select() { return this }, eq() { return this },
        maybeSingle: async () => ({ data: table === 'care_links' ? { active } : { user_id: recipient, subscription }, error: null }),
        update(value) { writes.push({ table, value }); return this },
        delete() { writes.push({ table, deleted: true }); return this },
        then(resolve) { resolve({ error: null }) },
      }
      return chain
    },
  }
  const send = async (_, payload) => { if (sendError) throw sendError; payloads.push(JSON.parse(payload)) }
  return { db, send, writes, payloads }
}
let fake = database()
assert.equal(await dispatchCarePush(fake.db, fake.send, 'practitioner'), 1)
assert.deepEqual(fake.payloads, [{ kind: 'task', id: 'job' }])
assert.deepEqual(fake.writes[0].value, { state: 'sent' })
for (const settings of [{ active: false }, { recipient: 'other' }]) {
  fake = database(settings)
  assert.equal(await dispatchCarePush(fake.db, fake.send, 'practitioner'), 0)
  assert.equal(fake.payloads.length, 0)
  assert.deepEqual(fake.writes[0].value, { state: 'cancelled' })
}
fake = database({ sendError: { statusCode: 410 } })
await dispatchCarePush(fake.db, fake.send, 'practitioner')
assert.equal(fake.writes[0].deleted, true)
fake = database({ sendError: { statusCode: 503 } })
await dispatchCarePush(fake.db, fake.send, 'practitioner')
assert.equal(fake.writes.length, 0)
console.log('care push validation, privacy, revocation and retry checks passed')
