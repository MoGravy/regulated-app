import assert from 'node:assert/strict'
import test from 'node:test'
import { syncRevenueCatSnapshot } from '../api/_revenuecat.js'
import { hasPremiumAccess } from '../api/_access.js'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const PROJECT = 'proj_fixture'
const PRODUCT = 'prod_monthly_fixture'
const APP = 'app_ios_fixture'
const ENTITLEMENT = 'ent_premium_fixture'
const NOW = Date.UTC(2026, 0, 1)
const config = {
  REVENUECAT_V2_SECRET_API_KEY: 'fixture-only-key',
  REVENUECAT_PROJECT_ID: PROJECT,
  REVENUECAT_ENTITLEMENT_ID: ENTITLEMENT,
  REVENUECAT_ALLOWED_PRODUCTS: JSON.stringify({
    [PRODUCT]: { appId: APP, storeIdentifier: 'regulated.monthly', store: 'app_store' },
  }),
}

function database({ claim = { claimed: true, fresh: false, generation: 1 }, commit = null } = {}) {
  const calls = []
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args })
      if (name === 'claim_revenuecat_sync') return { data: [claim], error: null }
      if (name === 'commit_revenuecat_snapshot') return { data: [{ committed: commit ?? true }], error: null }
      return { data: null, error: null }
    },
  }
}

function product() {
  return {
    object: 'product', id: PRODUCT, state: 'active', type: 'subscription',
    app_id: APP, store_identifier: 'regulated.monthly',
  }
}

function subscription(overrides = {}) {
  return {
    object: 'subscription', id: 'sub_fixture_1', customer_id: ACCOUNT,
    original_customer_id: ACCOUNT, product_id: PRODUCT, store: 'app_store',
    environment: 'production', gives_access: true, status: 'active',
    ends_at: NOW + 60 * 60 * 1000,
    entitlements: { object: 'list', items: [
      { object: 'entitlement', id: ENTITLEMENT, project_id: PROJECT, state: 'active' },
    ], next_page: null, url: '/v2/projects/proj_fixture/subscriptions/sub_fixture_1/entitlements' },
    ...overrides,
  }
}

function response(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(value),
  }
}

function fetchFixture({ sub = subscription(), productValue = product(), subscriptionPages } = {}) {
  const calls = []
  const fetchImpl = async (input, options) => {
    const url = new URL(input)
    calls.push({ url, options })
    if (url.pathname === '/v2/projects/proj_fixture/products/prod_monthly_fixture') return response(productValue)
    if (url.pathname === '/v2/projects/proj_fixture/customers/' + ACCOUNT + '/subscriptions') {
      return response(subscriptionPages?.shift() ?? { object: 'list', items: [sub], next_page: null })
    }
    throw new Error('Unexpected fixture URL: ' + url.pathname)
  }
  return { calls, fetchImpl }
}

async function run({ db = database(), fetch = fetchFixture(), env = config } = {}) {
  const result = await syncRevenueCatSnapshot(db, ACCOUNT, {
    env, fetchImpl: fetch.fetchImpl, now: () => NOW, makeToken: () => 'token-fixture',
  })
  return { result, db, fetch }
}

test('disabled config does not claim a lease or call RevenueCat', async () => {
  const db = database()
  let calls = 0
  const result = await syncRevenueCatSnapshot(db, ACCOUNT, {
    env: {}, fetchImpl: async () => { calls++ }, makeToken: () => 'token-fixture',
  })
  assert.deepEqual(result, { enabled: false, fresh: false })
  assert.equal(db.calls.length, 0)
  assert.equal(calls, 0)
})

test('matching production product, customer and entitlement commits bounded active access', async () => {
  const { result, db, fetch } = await run()
  assert.deepEqual(result, { enabled: true, fresh: true })
  const commit = db.calls.find(call => call.name === 'commit_revenuecat_snapshot')
  assert.deepEqual(commit.args.p_rows.map(({ external_id, product_id, status }) => ({ external_id, product_id, status })), [
    { external_id: 'sub_fixture_1', product_id: PRODUCT, status: 'active' },
  ])
  assert.equal(commit.args.p_fresh_seconds, 300)
  assert.equal(Date.parse(commit.args.p_rows[0].expires_at), NOW + 300000)
  assert.equal(fetch.calls.length, 2)
  assert.equal(fetch.calls.every(({ options }) => options.redirect === 'error'), true)
  assert.equal(fetch.calls.every(({ options }) => options.headers.Authorization === 'Bearer fixture-only-key'), true)
})

test('grace with an ended billing period is allowed only to the five-minute freshness bound', async () => {
  const grace = subscription({ status: 'in_grace_period', ends_at: NOW - 1000 })
  const { db } = await run({ fetch: fetchFixture({ sub: grace }) })
  const commit = db.calls.find(call => call.name === 'commit_revenuecat_snapshot')
  assert.equal(commit.args.p_rows[0].status, 'grace')
  assert.equal(commit.args.p_fresh_seconds, 300)
  assert.equal(Date.parse(commit.args.p_rows[0].expires_at), NOW + 300000)
})

test('positive snapshot refreshes at paid term end and an empty snapshot caches only five seconds', async () => {
  const shortTerm = subscription({ ends_at: NOW + 90_000 })
  const short = await run({ fetch: fetchFixture({ sub: shortTerm }) })
  assert.equal(short.db.calls.find(call => call.name === 'commit_revenuecat_snapshot').args.p_fresh_seconds, 90)

  const empty = await run({ fetch: fetchFixture({ sub: subscription({ gives_access: false, ends_at: NOW - 1000 }) }) })
  const commit = empty.db.calls.find(call => call.name === 'commit_revenuecat_snapshot')
  assert.equal(commit.args.p_fresh_seconds, 5)
  assert.equal(commit.args.p_rows[0].status, 'expired')
})

test('null end, missing entitlement and non-access state all refuse a grant', async () => {
  for (const sub of [
    subscription({ ends_at: null }),
    subscription({ entitlements: { object: 'list', items: [], next_page: null } }),
    subscription({ gives_access: false }),
  ]) {
    const { db } = await run({ fetch: fetchFixture({ sub }) })
    const commit = db.calls.find(call => call.name === 'commit_revenuecat_snapshot')
    assert.equal(commit.args.p_rows[0].status, 'expired')
    assert.equal(commit.args.p_fresh_seconds, 5)
  }
})

test('sandbox, wrong entitlement project, unknown product and wrong store cannot grant access', async () => {
  const sandbox = await run({ fetch: fetchFixture({ sub: subscription({ environment: 'sandbox' }) }) })
  assert.equal(sandbox.db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
  assert.equal(sandbox.db.calls.some(call => call.name === 'release_revenuecat_sync'), true)

  for (const { sub, rows } of [
    { sub: subscription({ entitlements: { object: 'list', items: [
      { id: ENTITLEMENT, project_id: 'other_project', state: 'active' },
    ], next_page: null } }), rows: 1 },
    { sub: subscription({ product_id: 'unknown_product' }), rows: 0 },
    { sub: subscription({ store: 'play_store' }), rows: 0 },
  ]) {
    const { db } = await run({ fetch: fetchFixture({ sub }) })
    const commit = db.calls.find(call => call.name === 'commit_revenuecat_snapshot')
    assert.equal(commit.args.p_fresh_seconds, 5)
    assert.equal(commit.args.p_rows.length, rows)
    assert.equal(commit.args.p_rows.every(row => row.status === 'expired'), true)
  }
})

test('same-origin pagination cannot change project, customer or subscription scope', async () => {
  for (const nextPage of [
    '/v2/projects/other_project/customers/' + ACCOUNT + '/subscriptions?starting_after=sub_fixture_1',
    '/v2/projects/proj_fixture/customers/22222222-2222-4222-8222-222222222222/subscriptions?starting_after=sub_fixture_1',
  ]) {
    const pages = [{
      object: 'list', items: [subscription({ entitlements: { object: 'list', items: [], next_page: null } })],
      next_page: nextPage,
    }]
    const { db } = await run({ fetch: fetchFixture({ subscriptionPages: pages }) })
    assert.equal(db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
    assert.equal(db.calls.some(call => call.name === 'release_revenuecat_sync'), true)
  }

  const wrongEntitlementPath = subscription({
    entitlements: { object: 'list', items: [{ id: 'previous', project_id: PROJECT, state: 'active' }],
      next_page: '/v2/projects/proj_fixture/subscriptions/other_subscription/entitlements?status=active&starting_after=previous' },
  })
  const { db } = await run({ fetch: fetchFixture({ sub: wrongEntitlementPath }) })
  assert.equal(db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
})

test('wrong product metadata or transferred customer fails closed and releases lease', async () => {
  const wrongProduct = await run({ fetch: fetchFixture({ productValue: { ...product(), app_id: 'other_app' } }) })
  assert.equal(wrongProduct.db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
  assert.equal(wrongProduct.db.calls.some(call => call.name === 'release_revenuecat_sync'), true)

  const transferred = await run({ fetch: fetchFixture({ sub: subscription({ original_customer_id: 'previous_user' }) }) })
  assert.equal(transferred.db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
  assert.equal(transferred.db.calls.some(call => call.name === 'release_revenuecat_sync'), true)
})

test('all pages are followed only in the requested customer and subscription scope', async () => {
  const firstSub = subscription({ id: 'sub_fixture_1', entitlements: { object: 'list', items: [], next_page: null } })
  const secondSub = subscription({ id: 'sub_fixture_2', entitlements: {
    object: 'list',
    items: [{ object: 'entitlement', id: 'other_entitlement', project_id: PROJECT, state: 'active' }],
    next_page: '/v2/projects/proj_fixture/subscriptions/sub_fixture_2/entitlements?status=active&starting_after=other_entitlement',
  } })
  const pages = [
    { object: 'list', items: [firstSub], next_page: '/v2/projects/proj_fixture/customers/' + ACCOUNT + '/subscriptions?starting_after=sub_fixture_1' },
    { object: 'list', items: [secondSub], next_page: null },
  ]
  const fetch = fetchFixture({ subscriptionPages: [...pages] })
  const original = fetch.fetchImpl
  const nextEntitlement = {
    object: 'list',
    items: [{ object: 'entitlement', id: ENTITLEMENT, project_id: PROJECT, state: 'active' }],
    next_page: null,
  }
  fetch.fetchImpl = async (input, options) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/subscriptions/sub_fixture_2/entitlements') && url.searchParams.has('starting_after')) {
      fetch.calls.push({ url, options })
      return response(nextEntitlement)
    }
    return original(input, options)
  }
  const { db } = await run({ fetch })
  const commit = db.calls.find(call => call.name === 'commit_revenuecat_snapshot')
  assert.deepEqual(commit.args.p_rows.map(row => row.external_id), ['sub_fixture_1', 'sub_fixture_2'])
  assert.equal(commit.args.p_rows[0].status, 'expired')
  assert.equal(commit.args.p_rows[1].status, 'active')
  assert.equal(fetch.calls.length, 4)
  assert.equal(fetch.calls[1].url.searchParams.get('environment'), 'production')
})

test('unsafe next page, failed provider call, and stale commit never replace the snapshot', async () => {
  const malicious = subscription({
    entitlements: { object: 'list', items: [{ id: 'old', project_id: PROJECT, state: 'active' }],
      next_page: 'https://attacker.invalid/steal?starting_after=old' },
  })
  const unsafe = await run({ fetch: fetchFixture({ sub: malicious }) })
  assert.equal(unsafe.db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
  assert.equal(unsafe.fetch.calls.some(({ url }) => url.origin === 'https://attacker.invalid'), false)

  const failed = await run({ fetch: { fetchImpl: async () => { throw new Error('fixture network failure') }, calls: [] } })
  assert.equal(failed.db.calls.some(call => call.name === 'commit_revenuecat_snapshot'), false)
  assert.equal(failed.db.calls.some(call => call.name === 'release_revenuecat_sync'), true)

  const stale = await run({ db: database({ commit: false }) })
  assert.deepEqual(stale.result, { enabled: true, fresh: false })
  assert.equal(stale.db.calls.some(call => call.name === 'release_revenuecat_sync'), true)
})

test('fresh cache and held lease skip provider calls', async () => {
  for (const claim of [
    { claimed: false, fresh: true, generation: 4 },
    { claimed: false, fresh: false, generation: 4 },
  ]) {
    const db = database({ claim })
    let requests = 0
    const result = await syncRevenueCatSnapshot(db, ACCOUNT, {
      env: config, fetchImpl: async () => { requests++ }, makeToken: () => 'token-fixture',
    })
    assert.equal(result.fresh, claim.fresh)
    assert.equal(requests, 0)
  }
})

test('shared access gate preserves verified Apple/Google rows and legacy Stripe fallback', async () => {
  const queries = []
  const supabase = {
    from(table) {
      const query = { table, filters: {} }
      queries.push(query)
      const chain = {
        select() { return chain },
        eq(field, value) { query.filters[field] = value; return chain },
        in(field, value) { query.filters[field] = value; return chain },
        gt(field, value) { query.filters[field] = value; return chain },
        limit() { return chain },
        async maybeSingle() {
          if (table === 'store_entitlements') return { data: null, error: null }
          return { data: { id: 'legacy-stripe-row' }, error: null }
        },
      }
      return chain
    },
  }
  assert.equal(await hasPremiumAccess(supabase, { id: ACCOUNT, email: ' Buyer@Example.test ' }, new Date(NOW)), true)
  assert.deepEqual(queries[0].filters.provider, ['apple', 'google'])
  assert.equal(queries[1].filters.user_email, 'buyer@example.test')
})
