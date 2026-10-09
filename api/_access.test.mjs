import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPremiumAccess } from './_access.js'

function database(rows) {
  return {
    from(table) {
      let found = (rows[table] || []).map(row => ({ ...row, user_email_normalized: row.user_email?.trim().toLowerCase() }))
      return {
        select() { return this },
        eq(key, value) { found = found.filter(row => row[key] === value); return this },
        ilike(key, value) {
          const pattern = new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
          found = found.filter(row => pattern.test(row[key]))
          return this
        },
        in(key, values) { found = found.filter(row => values.includes(row[key])); return this },
        gt(key, value) { found = found.filter(row => row[key] > value); return this },
        limit() { return this },
        async maybeSingle() { return { data: found[0] || null, error: null } },
        then(resolve) { return Promise.resolve({ data: found, error: null }).then(resolve) },
      }
    },
  }
}

const now = new Date('2026-09-26T00:00:00Z')
const user = { id: 'account-a', email: 'a@example.com' }

test('only this account gets a verified unexpired store entitlement', async () => {
  const db = database({ store_entitlements: [
    { id: 1, account_id: 'account-b', environment: 'production', provider: 'apple', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
    { id: 2, account_id: 'account-a', environment: 'production', provider: 'apple', status: 'revoked', expires_at: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), false)
  db.from = database({ store_entitlements: [
    { id: 3, account_id: 'account-a', environment: 'production', provider: 'apple', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
  ] }).from
  assert.equal(await hasPremiumAccess(db, user, now), true)
})

test('an active legacy Stripe subscription still grants access', async () => {
  const db = database({ subscriptions: [
    { id: 4, user_email: 'a@example.com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), true)
})

test('mixed-case legacy email and two active rows retain access', async () => {
  const db = database({ subscriptions: [
    { id: 10, user_email: 'A@Example.Com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
    { id: 11, user_email: 'A@Example.Com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), true)
})

test('email wildcards cannot borrow another account subscription', async () => {
  const db = database({ subscriptions: [
    { id: 12, user_email: 'alice@example.com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
  ] })
  for (const email of ['a%example.com', 'a_ice@example.com', 'other@example.com']) {
    assert.equal(await hasPremiumAccess(db, { ...user, email }, now), false)
  }
})

test('expired purchases do not grant access', async () => {
  const db = database({
    store_entitlements: [{ id: 5, account_id: 'account-a', environment: 'production', provider: 'apple', status: 'active', expires_at: '2026-09-25T00:00:00Z' }],
    subscriptions: [{ id: 6, user_email: 'a@example.com', status: 'active', current_period_end: '2026-09-25T00:00:00Z' }],
  })
  assert.equal(await hasPremiumAccess(db, user, now), false)
})

test('sandbox purchases do not grant production access', async () => {
  const db = database({ store_entitlements: [
    { id: 7, account_id: 'account-a', environment: 'sandbox', provider: 'apple', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
  ] })
  assert.equal(await hasPremiumAccess(db, user, now), false, 'Sandbox must not unlock production')
})

test('sandbox purchase does not block a valid legacy Stripe subscription', async () => {
  const db = database({
    store_entitlements: [
      { id: 8, account_id: 'account-a', environment: 'sandbox', provider: 'apple', status: 'active', expires_at: '2026-10-01T00:00:00Z' },
    ],
    subscriptions: [
      { id: 9, user_email: 'a@example.com', status: 'active', current_period_end: '2026-10-01T00:00:00Z' },
    ],
  })
  assert.equal(await hasPremiumAccess(db, user, now), true)
})
