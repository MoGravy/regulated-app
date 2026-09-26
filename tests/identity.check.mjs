// Runnable check for api/_identity.js: `node tests/identity.check.mjs`.
// Not a Playwright spec on purpose; it needs no browser and no network.
import assert from 'node:assert/strict'
import { callerEmail, callerUser } from '../api/_identity.js'

const stub = users => ({ auth: { getUser: async t => users[t] ? { data: { user: users[t] } } : { data: {}, error: new Error('bad') } } })
const sb = stub({ good: { id: 'account-a', email: ' Kat@Example.com ' } })

assert.equal((await callerUser({ headers: { authorization: 'Bearer good' } }, sb)).id, 'account-a')

// Token wins over the body, and is normalised.
assert.equal(await callerEmail({ headers: { authorization: 'Bearer good' }, body: { email: 'other@example.com' } }, sb), 'kat@example.com')
// A bad token is refused, never downgraded to the body email.
assert.equal(await callerEmail({ headers: { authorization: 'Bearer nope' }, body: { email: 'other@example.com' } }, sb), null)
// No token: the body email counts for nothing.
assert.equal(await callerEmail({ headers: {}, body: { email: ' Other@Example.com ' } }, sb), null)
// Nothing at all.
assert.equal(await callerEmail({ headers: {}, body: {} }, sb), null)
assert.equal(await callerEmail({}, sb), null)
console.log('identity ok')
