import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPremiumAccess } from './_access.js'

function database(rows) {
  return {
    from(table) {
      let found = rows[table] || []
      return {
        select() { return this },
        eq(key, value) { found = found.filter(row => row[key] === value); return this },
        in(key, values) { found = found.filter(row => values.includes(row[key])); return this },
        gt(key, value) { found = found.filter(row => row[key] > value); return this },
        limit() { return this },
        async maybeSingle() { return { data: found[0] || null, error: null } },
      }
    },
  }
}

const now = new Date('2026-09-26T00:00:00Z')
const user = { id: 'account-a', email: 'a@example.com' }

test('only this account gets a verified unexpired store entitlement', async () => {
  const db = database({ store_entitlements: [
    { id: 1, account_id: 'account-b', environment: 'production', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
    { id: 2, account_id: 'account-a', environment: 'production', status: 'revoked', expires_at: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), false)
  db.from = database({ store_entitlements: [
    { id: 3, account_id: 'account-a', environment: 'production', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
  ] }).from
  assert.equal(await hasPremiumAccess(db, user, now), true)
})

test('an active legacy Stripe subscription still grants access', async () => {
  const db = database({ subscriptions: [
    { id: 4, user_email: 'a@example.com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), true)
})

test('expired purchases do not grant access', async () => {
  const db = database({
    store_entitlements: [{ id: 5, account_id: 'account-a', environment: 'production', status: 'active', expires_at: '2026-09-25T00:00:00Z' }],
    subscriptions: [{ id: 6, user_email: 'a@example.com', status: 'active', current_period_end: '2026-09-25T00:00:00Z' }],
  })
  assert.equal(await hasPremiumAccess(db, user, now), false)
})

test('sandbox purchases do not grant production access', async () => {
  const db = database({ store_entitlements: [
    { id: 7, account_id: 'account-a', environment: 'sandbox', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), false, 'Sandbox must not unlock production')
})

test('sandbox purchase does not block a valid legacy Stripe subscription', async () => {
  const db = database({
    store_entitlements: [
      { id: 8, account_id: 'account-a', environment: 'sandbox', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
    ],
    subscriptions: [
      { id: 9, user_email: 'a@example.com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
    ],
  })
  assert.equal(await hasPremiumAccess(db, user, now), true)
})
