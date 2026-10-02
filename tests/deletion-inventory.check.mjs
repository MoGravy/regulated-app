import assert from 'node:assert/strict'
import { inventoryDeletion } from '../scripts/deletion-inventory.mjs'

const requestId = 'receipt-1'
const accountId = 'account-1'
const email = 'Owner@Example.test'
const privateText = 'private fixture text'
const privatePath = 'custom-audios/private.wav'
const privateUrl = 'https://example.test/private.wav?signed=fixture'

function fixture(options = {}) {
  const trace = []
  const user = { id: accountId, email, email_confirmed_at: '2026-01-01T00:00:00Z', ...options.user }
  const tables = {
    account_deletion_requests: [{ id: requestId, account_id: accountId }, { id: 'receipt-2', account_id: 'account-2' }],
    profiles: [{ id: accountId, email: 'untrusted@example.test' }, { id: 'account-2' }],
    user_progress: [{ id: 'p1', user_id: accountId }, { id: 'p2', user_id: 'account-2' }],
    store_entitlements: [{ id: 'e1', account_id: accountId, external_id: 'private provider identifier' }],
    revenuecat_sync_state: [{ account_id: accountId, generation: 3 }, { account_id: 'account-2', generation: 2 }],
    annual_free_reservations: [{ account_id: accountId, reservation_id: 'private-reservation' }],
    users: [{ id: 'u1', email: email.toLowerCase() }, { id: 'u2', email: 'other@example.test' }],
    session_completions: [{ id: 'c1', user_email: email.toUpperCase(), mood_before: 3 }],
    subscriptions: [{ id: 's1', user_email: email.toLowerCase(), stripe_customer_id: 'private customer identifier' }],
    session_waitlist: [{ id: 'w1', email: email.toLowerCase() }],
    custom_orders: [
      { id: 'o1', user_email: email.toLowerCase(), audio_url: privatePath, pattern: privateText },
      { id: 'o2', user_email: email.toUpperCase(), audio_url: privateUrl },
      { id: 'o3', user_email: email.toLowerCase(), audio_url: null },
      { id: 'o4', user_email: email.toLowerCase(), audio_url: '' },
      { id: 'other-order', user_email: 'other@example.test', audio_url: 'other.wav' },
    ],
    ...options.tables,
  }
  const before = structuredClone(tables)
  const client = {
    auth: { admin: { async getUserById(id) {
      trace.push({ auth: id })
      assert.equal(trace[0].table, 'account_deletion_requests')
      assert.equal(id, accountId)
      if (options.authError) throw new Error(privateText)
      return { data: { user: options.missingUser ? null : user } }
    } } },
    get storage() { throw new Error('Storage access is outside this inventory') },
    from(table) {
      const query = { table }
      const builder = {
        select(columns, settings = {}) { Object.assign(query, { columns, settings }); return this },
        eq(column, value) { Object.assign(query, { method: 'eq', column, value }); return this },
        ilike(column, value) { Object.assign(query, { method: 'ilike', column, value }); return this },
        order(column) { assert.equal(column, 'id'); query.ordered = true; return this },
        range(start, end) { Object.assign(query, { start, end }); return this },
        single() { query.single = true; return this },
        then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject) },
      }
      function execute() {
        trace.push({ ...query })
        const rows = tables[table]
        assert.ok(rows, 'Only declared inventory tables may be read')
        let filtered
        if (query.method === 'ilike') {
          assert.equal(query.value, user.email.trim().replace(/[\\%_]/g, '\\$&'))
          const literal = query.value.replace(/\\([\\%_])/g, '$1').toLowerCase()
          filtered = rows.filter(row => row[query.column]?.toLowerCase() === literal)
        } else {
          filtered = rows.filter(row => row[query.column] === query.value)
        }
        let response
        if (query.single) {
          assert.equal(table, 'account_deletion_requests')
          assert.equal(query.columns, 'id,account_id')
          response = { data: filtered[0] || null }
        } else if (query.settings.head) {
          assert.equal(query.columns, query.column)
          assert.equal(query.settings.count, 'exact')
          response = { count: filtered.length, data: null }
        } else {
          assert.equal(table, 'custom_orders')
          assert.equal(query.columns, 'id,audio_url')
          assert.equal(query.settings.count, 'exact')
          assert.equal(query.ordered, true)
          assert.equal(query.end - query.start, 999)
          filtered = filtered.toSorted((a, b) => a.id.localeCompare(b.id))
          response = {
            count: filtered.length,
            data: filtered.slice(query.start, query.start + (options.pageLimit || 2)).map(({ id, audio_url }) => ({ id, audio_url })),
          }
        }
        return options.respond ? options.respond(query, response) : response
      }
      return builder
    },
  }
  return { client, trace, tables, unchanged: () => assert.deepEqual(tables, before) }
}

const normal = fixture()
const report = await inventoryDeletion(normal.client, requestId)
assert.deepEqual(report.accountCounts, { profiles: 1, user_progress: 1, store_entitlements: 1, revenuecat_sync_state: 1, annual_free_reservations: 1 })
assert.deepEqual(report.legacyCandidateCounts, { users: 1, session_completions: 1, subscriptions: 1, session_waitlist: 1, custom_orders: 4 })
assert.deepEqual(report.mediaReferences, [
  { orderId: 'o1', referenceKind: 'storage-path', ownership: 'unverified' },
  { orderId: 'o2', referenceKind: 'url', ownership: 'unverified' },
  { orderId: 'o4', referenceKind: 'invalid', ownership: 'unverified' },
])
assert.deepEqual(normal.trace.slice(0, 2).map(entry => entry.table || 'auth'), ['account_deletion_requests', 'auth'])
assert.deepEqual(normal.trace.filter(entry => entry.start !== undefined).map(entry => entry.start), [0, 2])
for (const blocker of ['legacy_ownership_review', 'historical_email_mapping_required', 'non_atomic_snapshot', 'auth_foreign_keys', 'provider_review', 'private_media_ownership', 'unmapped_data', 'retention_decision']) {
  assert.ok(report.blockers.includes(blocker))
}
const serialized = JSON.stringify(report)
for (const value of [email, email.toLowerCase(), privateText, privatePath, privateUrl, 'private provider identifier', 'private customer identifier', 'untrusted@example.test', 'other-order']) {
  assert.equal(serialized.includes(value), false)
}
assert.deepEqual(await inventoryDeletion(normal.client, requestId), report)
normal.unchanged()

async function rejected(options, scope, id = requestId) {
  const f = fixture(options)
  await assert.rejects(inventoryDeletion(f.client, id), { message: `Deletion inventory unavailable: ${scope}` })
  f.unchanged()
  return f
}
assert.equal((await rejected({}, 'receipt', '')).trace.length, 0)
assert.equal((await rejected({}, 'receipt', 'missing')).trace.length, 1)
await rejected({ missingUser: true }, 'auth')
await rejected({ user: { id: 'account-2' } }, 'auth')
await rejected({ authError: true }, 'auth')
await rejected({ respond: _q => { throw new Error(privateText) } }, 'receipt')
await rejected({ respond: (q, r) => q.table === 'account_deletion_requests' ? { data: { id: 'wrong', account_id: accountId } } : r }, 'receipt')

for (const user of [{ email: null }, { email: '' }, { email_confirmed_at: null }]) {
  const f = fixture({ user })
  const result = await inventoryDeletion(f.client, requestId)
  assert.equal(result.legacyCandidateCounts, null)
  assert.equal(result.mediaReferences.length, 0)
  assert.ok(result.blockers.includes('current_email_unverified_or_missing'))
  assert.equal(f.trace.some(q => q.method === 'ilike'), false)
}
const wildcard = fixture({ user: { email: 'a*b@example.test' } })
const wildcardReport = await inventoryDeletion(wildcard.client, requestId)
assert.deepEqual(wildcardReport.accountCounts, report.accountCounts)
assert.equal(wildcardReport.legacyCandidateCounts, null)
assert.deepEqual(wildcardReport.mediaReferences, [])
assert.ok(wildcardReport.blockers.includes('unsupported_email_pattern'))
assert.equal(wildcard.trace.some(q => q.method === 'ilike'), false)
assert.equal(JSON.stringify(wildcardReport).includes('a*b@example.test'), false)
const specialEmail = 'percent%under_score\\@example.test'
const special = fixture({ user: { email: specialEmail }, tables: { users: [{ id: 'u-special', email: specialEmail.toUpperCase() }, { id: 'u-other', email: 'percentANYunderXscore@example.test' }] } })
assert.equal((await inventoryDeletion(special.client, requestId)).legacyCandidateCounts.users, 1)
assert.equal(special.trace.find(q => q.method === 'ilike').value, String.raw`percent\%under\_score\\@example.test`)

for (const table of ['profiles', 'user_progress', 'store_entitlements', 'revenuecat_sync_state', 'annual_free_reservations', 'users', 'session_completions', 'subscriptions', 'session_waitlist', 'custom_orders']) {
  await rejected({ respond: (q, r) => q.table === table ? { error: { message: privateText } } : r }, table)
  await rejected({ respond: (q, r) => q.table === table ? { ...r, count: null } : r }, table)
}
for (const count of [-1, 0.5, undefined, Number.MAX_SAFE_INTEGER + 1]) {
  await rejected({ respond: (q, r) => q.table === 'profiles' ? { ...r, count } : r }, 'profiles')
}
const big = fixture({
  pageLimit: 37,
  tables: { custom_orders: Array.from({ length: 1003 }, (_, i) => ({ id: `order-${String(i).padStart(4, '0')}`, user_email: email, audio_url: null })) },
  respond: (q, r) => q.table === 'session_completions' ? { ...r, count: 3001 } : r,
})
const bigReport = await inventoryDeletion(big.client, requestId)
assert.equal(bigReport.legacyCandidateCounts.session_completions, 3001)
assert.equal(bigReport.legacyCandidateCounts.custom_orders, 1003)
assert.equal(big.trace.filter(q => q.table === 'session_completions').length, 1)
assert.equal(big.trace.filter(q => q.table === 'custom_orders').length, 28)
big.unchanged()

for (const broken of [
  r => ({ ...r, data: [] }),
  r => ({ ...r, count: r.count + 1 }),
  r => ({ ...r, data: [{ id: 'o1', audio_url: null }] }),
  r => ({ ...r, data: null }),
]) {
  await rejected({ respond: (q, r) => q.table === 'custom_orders' && q.start > 0 ? broken(r) : r }, 'custom_orders')
}
const empty = fixture({ tables: { custom_orders: [] } })
assert.equal((await inventoryDeletion(empty.client, requestId)).legacyCandidateCounts.custom_orders, 0)
console.log('PASS: receipt identity, private output, read-only counts, paging and incomplete inventory checks.')
