// Runnable check for api/_identity.js: `node tests/identity.check.mjs`.
// Not a Playwright spec on purpose; it needs no browser and no network.
import assert from 'node:assert/strict'
import { callerEmail, sameEmail, activeSubscriptions } from '../api/_identity.js'

const stub = users => ({ auth: { getUser: async t => users[t] ? { data: { user: users[t] } } : { data: {}, error: new Error('bad') } } })
const sb = stub({ good: { email: ' Kat@Example.com ' } })

// Token wins over the body, and is normalised.
assert.equal(await callerEmail({ headers: { authorization: 'Bearer good' }, body: { email: 'other@example.com' } }, sb), 'kat@example.com')
// A bad token is refused, never downgraded to the body email.
assert.equal(await callerEmail({ headers: { authorization: 'Bearer nope' }, body: { email: 'other@example.com' } }, sb), null)
// No token: the body email counts for nothing.
assert.equal(await callerEmail({ headers: {}, body: { email: ' Other@Example.com ' } }, sb), null)
// Nothing at all.
assert.equal(await callerEmail({ headers: {}, body: {} }, sb), null)
assert.equal(await callerEmail({}, sb), null)

// Stored as typed, matched regardless of case or stray spaces.
const rows = [{ id: 1, user_email: 'Jane@Gmail.com ' }, { id: 2, user_email: 'jxne@gmail.com' }]
assert.deepEqual(sameEmail(rows, 'jane@gmail.com').map(r => r.id), [1])
// ilike's _ wildcard widens the database result; the exact comparison narrows it.
assert.deepEqual(sameEmail(rows, 'j_ne@gmail.com'), [])
assert.deepEqual(sameEmail(null, 'a@b.co'), [])

// Two active rows (monthly then annual) still count as subscribed.
const db = rows => ({ from: () => { const q = { select: () => q, ilike: () => q, eq: () => q, gt: async () => ({ data: rows, error: null }) }; return q } })
assert.equal((await activeSubscriptions(db([{ id: 1, user_email: 'A@b.co' }, { id: 2, user_email: 'a@b.co' }]), 'a@b.co')).length, 2)
assert.equal((await activeSubscriptions(db([]), 'a@b.co')).length, 0)
console.log('identity ok')
