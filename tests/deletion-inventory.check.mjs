import assert from 'node:assert/strict'
import { inventoryDeletion } from '../scripts/deletion-inventory.mjs'

const requestId = 'receipt-1'
const accountId = '00000000-0000-4000-8000-000000000001'
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
    course_grants: [{ user_id: accountId, course_id: 'course-1' }, { user_id: 'account-2', course_id: 'course-1' }],
    course_progress: [{ user_id: accountId, lesson_id: 'lesson-1' }, { user_id: 'account-2', lesson_id: 'lesson-1' }],
    dap_purchases: [{ user_id: accountId, status: 'refunded' }, { user_id: 'account-2', status: 'paid' }],
    care_links: [
      { client_id: accountId, practitioner_id: 'account-2', active: false },
      { client_id: 'account-3', practitioner_id: accountId, active: true },
      { client_id: 'account-3', practitioner_id: 'account-2', active: true },
    ],
    care_tasks: [
      { id: 't1', client_id: accountId, practitioner_id: 'account-2', title: privateText },
      { id: 't2', client_id: 'account-3', practitioner_id: accountId },
      { id: 'unrelated-task', client_id: 'account-3', practitioner_id: 'account-2' },
    ],
    care_task_entries: [
      { id: 'entry-1', task_id: 't1', body: privateText }, { id: 'entry-2', task_id: 't1' },
      { id: 'entry-3', task_id: 't2' }, { id: 'unrelated-entry', task_id: 'unrelated-task' },
    ],
    care_messages: [
      { id: 'm1', client_id: accountId, practitioner_id: 'account-2', sender_id: 'account-2', body: privateText },
      { id: 'm2', client_id: 'account-3', practitioner_id: accountId, sender_id: 'account-3' },
      // Keep sender references protected even if a historical schema lacks the participant check.
      { id: 'sender-only', client_id: 'account-3', practitioner_id: 'account-2', sender_id: accountId },
      { id: 'unrelated-message', client_id: 'account-3', practitioner_id: 'account-2', sender_id: 'account-2' },
    ],
    care_message_reactions: [
      { message_id: 'm1', user_id: 'account-2' }, { message_id: 'm1', user_id: accountId },
      { message_id: 'm2', user_id: 'account-3' },
      { message_id: 'sender-only', user_id: 'account-3' },
      { message_id: 'unrelated-message', user_id: accountId },
      { message_id: 'unrelated-message', user_id: 'account-2' },
    ],
    care_push_subscriptions: [
      { id: 'push-1', user_id: accountId, subscription: privateText }, { id: 'push-2', user_id: 'account-2' },
    ],
    care_push_jobs: [
      { id: 'job-1', client_id: accountId, subscription_id: 'push-2' },
      { id: 'job-2', practitioner_id: accountId, subscription_id: 'push-2' },
      { id: 'job-3', sender_id: accountId, subscription_id: 'push-2' },
      { id: 'job-4', recipient_id: accountId, subscription_id: 'push-2' },
      { id: 'job-5', subscription_id: 'push-1' },
      { id: 'job-6', client_id: accountId, sender_id: accountId, subscription_id: 'push-1' },
      { id: 'unrelated-job', subscription_id: 'push-2' },
    ],
    users: [{ id: 'u1', email: email.toLowerCase() }, { id: 'u2', email: 'other@example.test' }],
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
      const query = { table, filters: [] }
      const builder = {
        select(columns, settings = {}) { Object.assign(query, { columns, settings }); return this },
        eq(column, value) { const filter = { method: 'eq', column, value }; Object.assign(query, filter); query.filters.push(filter); return this },
        ilike(column, value) { const filter = { method: 'ilike', column, value }; Object.assign(query, filter); query.filters.push(filter); return this },
        or(value, { referencedTable } = {}) { query.filters.push({ method: 'or', value, referencedTable }); return this },
        order(column) { assert.equal(column, 'id'); query.ordered = true; return this },
        range(start, end) { Object.assign(query, { start, end }); return this },
        single() { query.single = true; return this },
        then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject) },
      }
      function execute() {
        trace.push({ ...query })
        const rows = tables[table]
        assert.ok(rows, 'Only declared inventory tables may be read')
        const relations = {
          care_task_entries: ['care_tasks', 'task_id'],
          care_message_reactions: ['care_messages', 'message_id'],
          care_push_jobs: ['care_push_subscriptions', 'subscription_id'],
        }
        const embedded = query.columns.match(/,(\w+)(!inner)?\(\)$/)
        function matches(row, { method, column, value }) {
          if (method === 'or') return value.split(',').some(term => {
            const [name, operator, ...rest] = term.split('.')
            if (operator === 'not') { assert.deepEqual(rest, ['is', 'null']); return row?.[name] != null }
            assert.equal(operator, 'eq')
            return row?.[name] === rest.join('.')
          })
          if (method === 'ilike') {
            assert.equal(value, user.email.trim().replace(/[\\%_]/g, '\\$&'))
            return row?.[column]?.toLowerCase() === value.replace(/\\([\\%_])/g, '$1').toLowerCase()
          }
          return row?.[column] === value
        }
        const filtered = rows.filter(row => {
          const joined = { ...row }
          if (embedded) {
            const [relation, foreignKey] = relations[table]
            assert.equal(embedded[1], relation, 'Join must follow the current foreign key')
            const childFilters = query.filters.filter(filter => filter.referencedTable === relation || filter.column?.startsWith(`${relation}.`))
            joined[relation] = tables[relation].find(parent => parent.id === row[foreignKey] && childFilters.every(filter =>
              matches(parent, { ...filter, column: filter.column?.replace(`${relation}.`, '') }))) || null
            if (embedded[2] && !joined[relation]) return false
          }
          return query.filters.filter(filter => !filter.referencedTable && !filter.column?.includes('.')).every(filter => matches(joined, filter))
        })
        let response
        if (query.single) {
          assert.equal(table, 'account_deletion_requests')
          assert.equal(query.columns, 'id,account_id')
          response = { data: filtered[0] || null }
        } else if (query.settings.head) {
          assert.ok(embedded || query.columns === query.column || query.columns === 'client_id')
          assert.equal(query.settings.count, 'exact')
          response = { count: filtered.length, data: null }
        } else {
          assert.equal(table, 'custom_orders')
          assert.equal(query.columns, 'id,audio_url')
          assert.equal(query.settings.count, 'exact')
          assert.equal(query.ordered, true)
          assert.equal(query.end - query.start, 999)
          response = {
            count: filtered.length,
            data: filtered.toSorted((a, b) => a.id.localeCompare(b.id)).slice(query.start, query.start + (options.pageLimit || 2)).map(({ id, audio_url }) => ({ id, audio_url })),
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
assert.deepEqual(report.accountCounts, { profiles: 1, user_progress: 1, store_entitlements: 1, revenuecat_sync_state: 1, annual_free_reservations: 1, course_grants: 1, course_progress: 1, dap_purchases: 1 })
assert.deepEqual(report.protectedCareCounts, { care_links: 2, care_tasks: 2, care_messages: 3, care_task_entries: 3, care_message_reactions: 5, care_push_subscriptions: 1, care_push_jobs: 6 })
assert.deepEqual(report.legacyCandidateCounts, { users: 1, subscriptions: 1, session_waitlist: 1, custom_orders: 4 })
assert.equal(normal.trace.some(q => q.table === 'session_completions'), false)
assert.deepEqual(report.mediaReferences, [
  { orderId: 'o1', referenceKind: 'storage-path', ownership: 'unverified' },
  { orderId: 'o2', referenceKind: 'url', ownership: 'unverified' },
  { orderId: 'o4', referenceKind: 'invalid', ownership: 'unverified' },
])
assert.deepEqual(normal.trace.slice(0, 2).map(entry => entry.table || 'auth'), ['account_deletion_requests', 'auth'])
assert.deepEqual(normal.trace.filter(entry => entry.start !== undefined).map(entry => entry.start), [0, 2])
for (const blocker of ['legacy_ownership_review', 'historical_email_mapping_required', 'non_atomic_snapshot', 'auth_foreign_keys', 'provider_review', 'private_media_ownership', 'unmapped_data', 'retention_decision', 'shared_care_records']) {
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
await rejected({ respond: (q, r) => q.table === 'account_deletion_requests' ? { data: { id: requestId, account_id: 'id,client_id.not.is.null' } } : r }, 'receipt')

for (const user of [{ email: null }, { email: '' }, { email_confirmed_at: null }]) {
  const f = fixture({ user })
  const result = await inventoryDeletion(f.client, requestId)
  assert.equal(result.legacyCandidateCounts, null)
  assert.deepEqual(result.protectedCareCounts, report.protectedCareCounts)
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

for (const table of [...Object.keys(report.accountCounts), ...Object.keys(report.protectedCareCounts), ...Object.keys(report.legacyCandidateCounts)]) {
  await rejected({ respond: (q, r) => q.table === table ? { error: { message: privateText } } : r }, table)
  await rejected({ respond: (q, r) => q.table === table ? { ...r, count: null } : r }, table)
  await rejected({ respond: (q, r) => { if (q.table === table) throw new Error(privateText); return r } }, table)
}
for (const count of [-1, 0.5, undefined, Number.MAX_SAFE_INTEGER + 1]) {
  await rejected({ respond: (q, r) => q.table === 'profiles' ? { ...r, count } : r }, 'profiles')
}
const big = fixture({
  pageLimit: 37,
  tables: { custom_orders: Array.from({ length: 1003 }, (_, i) => ({ id: `order-${String(i).padStart(4, '0')}`, user_email: email, audio_url: null })) },
  respond: (q, r) => q.table === 'subscriptions' ? { ...r, count: 3001 } : r,
})
const bigReport = await inventoryDeletion(big.client, requestId)
assert.equal(bigReport.legacyCandidateCounts.subscriptions, 3001)
assert.equal(bigReport.legacyCandidateCounts.custom_orders, 1003)
assert.equal(big.trace.filter(q => q.table === 'subscriptions').length, 1)
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
const noCare = fixture({ tables: Object.fromEntries(Object.keys(report.protectedCareCounts).map(table => [table, []])) })
const noCareReport = await inventoryDeletion(noCare.client, requestId)
assert.ok(Object.values(noCareReport.protectedCareCounts).every(count => count === 0))
assert.equal(noCareReport.blockers.includes('shared_care_records'), false)
console.log('PASS: current tables, both Care roles, child joins, deduplicated associations, private output, paging and read failures.')
