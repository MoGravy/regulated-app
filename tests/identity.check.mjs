// Runnable check for api/_identity.js: `node tests/identity.check.mjs`.
// Not a Playwright spec on purpose; it needs no browser and no network.
import assert from 'node:assert/strict'
import { callerEmail } from '../api/_identity.js'

const stub = users => ({ auth: { getUser: async t => users[t] ? { data: { user: users[t] } } : { data: {}, error: new Error('bad') } } })
const sb = stub({ good: { email: ' Kat@Example.com ' } })

// Token wins over the body, and is normalised.
assert.equal(await callerEmail({ headers: { authorization: 'Bearer good' }, body: { email: 'other@example.com' } }, sb), 'kat@example.com')
// A bad token is refused, never downgraded to the body email.
assert.equal(await callerEmail({ headers: { authorization: 'Bearer nope' }, body: { email: 'other@example.com' } }, sb), null)
// No token: the body email still works (overlap), normalised.
assert.equal(await callerEmail({ headers: {}, body: { email: ' Other@Example.com ' } }, sb), 'other@example.com')
// Nothing at all.
assert.equal(await callerEmail({ headers: {}, body: {} }, sb), null)
assert.equal(await callerEmail({}, sb), null)
console.log('identity ok')
