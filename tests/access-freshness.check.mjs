import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { normalEmail, sameEmail } from '../api/_identity.js'

const source = (await readFile(new URL('../api/_access.js', import.meta.url), 'utf8'))
  .replace(/^import .*\n/gm, '').replace('export async function', 'async function')
const initial = Date.UTC(2026, 0, 1)
async function access({ fresh = false, failure = false, provider = 'revenuecat', stripe = false, expiry = 60_000, delay = 0 } = {}) {
  let clock = initial
  const cutoffs = []
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])) }
    static now() { return clock }
  }
  const context = vm.createContext({ normalEmail, sameEmail, Date: Clock, syncRevenueCatSnapshot: async () => {
    clock += delay
    if (failure) throw new Error('Provider unavailable')
    return { enabled: true, fresh }
  } })
  vm.runInContext(source + '\nglobalThis.access = hasPremiumAccess', context)
  const client = { from(table) {
    const filters = {}
    return {
      select() { return this },
      eq(key, value) { filters[key] = value; return this },
      ilike(key, value) { filters[key] = value; return this },
      in(key, value) { filters[key] = value; return this },
      gt(key, value) { filters[key] = value; cutoffs.push(value); return this },
      limit() { return this },
      async maybeSingle() {
        if (table === 'store_entitlements') {
          assert.equal(filters.account_id, 'account-fixture')
          assert.equal(filters.environment, 'production')
          const granted = filters.provider.includes(provider) && initial + expiry > Date.parse(filters.expires_at)
          return { data: granted ? { id: 'store-fixture' } : null }
        }
      },
      then(resolve) {
        assert.equal(table, 'subscriptions')
        assert.equal(filters.user_email, 'fixture@example.test')
        assert.equal(filters.status, 'active')
        return Promise.resolve({ data: stripe ? [{ id: 'stripe-fixture', user_email: 'Fixture@Example.Test' }] : [] }).then(resolve)
      },
    }
  } }
  return { active: await context.access(client, { id: 'account-fixture', email: ' Fixture@Example.test ' }), cutoffs }
}

assert.equal((await access()).active, false)
assert.equal((await access({ fresh: true })).active, true)
assert.equal((await access({ failure: true })).active, false)
assert.equal((await access({ failure: true, stripe: true })).active, true)
assert.equal((await access({ failure: true, provider: 'apple' })).active, true)
assert.equal((await access({ failure: true, provider: 'google' })).active, true)
const expiredDuringSync = await access({ fresh: true, expiry: 10_000, delay: 20_000 })
assert.equal(expiredDuringSync.active, false, 'A subscription expiring during provider sync must not grant access')
assert.ok(expiredDuringSync.cutoffs.every(value => Date.parse(value) === initial + 20_000))
console.log('PASS: RevenueCat freshness is required, provider failure preserves Stripe/native access, and expiry uses the time after sync.')
