const unavailable = table => new Error(`Deletion inventory unavailable: ${table}`)

async function read(table, query) {
  try {
    const result = await query()
    if (!result || result.error) throw unavailable(table)
    return result
  } catch {
    throw unavailable(table)
  }
}

function validCount(count) {
  return Number.isSafeInteger(count) && count >= 0
}

async function countRows(client, table, column, value, method = 'eq') {
  const { count } = await read(table, () => client.from(table)
    .select('id', { count: 'exact', head: true })[method](column, value))
  if (!validCount(count)) throw unavailable(table)
  return count
}

function referenceKind(value) {
  if (typeof value !== 'string' || !value.trim()) return 'invalid'
  if (/^https?:\/\//i.test(value)) return 'url'
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/')) return 'invalid'
  return 'storage-path'
}

async function customOrders(client, emailPattern) {
  const seen = new Set()
  const mediaReferences = []
  let expected = null
  while (expected === null || seen.size < expected) {
    const { data, count } = await read('custom_orders', () => client.from('custom_orders')
      .select('id,audio_url', { count: 'exact' })
      .ilike('user_email', emailPattern).order('id')
      .range(seen.size, seen.size + 999))
    if (!validCount(count) || !Array.isArray(data)) throw unavailable('custom_orders')
    if (expected === null) expected = count
    if (count !== expected || seen.size + data.length > expected || (!data.length && seen.size < expected)) {
      throw unavailable('custom_orders')
    }
    for (const row of data) {
      if (typeof row?.id !== 'string' || !row.id || seen.has(row.id)) throw unavailable('custom_orders')
      seen.add(row.id)
      if (row.audio_url !== null && row.audio_url !== undefined) {
        mediaReferences.push({ orderId: row.id, referenceKind: referenceKind(row.audio_url), ownership: 'unverified' })
      }
    }
  }
  return { count: expected, mediaReferences }
}

export async function inventoryDeletion(client, requestId) {
  if (typeof requestId !== 'string' || !requestId.trim()) throw unavailable('receipt')
  const { data: receipt } = await read('receipt', () => client.from('account_deletion_requests')
    .select('id,account_id').eq('id', requestId).single())
  if (receipt?.id !== requestId || typeof receipt.account_id !== 'string' || !receipt.account_id) {
    throw unavailable('receipt')
  }
  const { data: auth } = await read('auth', () => client.auth.admin.getUserById(receipt.account_id))
  const user = auth?.user
  if (!user || user.id !== receipt.account_id) throw unavailable('auth')

  const report = {
    requestId: receipt.id,
    accountId: receipt.account_id,
    accountCounts: {},
    legacyCandidateCounts: null,
    mediaReferences: [],
    blockers: [
      'legacy_ownership_review', 'historical_email_mapping_required',
      'non_atomic_snapshot', 'auth_foreign_keys', 'provider_review',
      'private_media_ownership', 'unmapped_data', 'retention_decision',
    ],
  }
  for (const [table, column] of [['profiles', 'id'], ['user_progress', 'user_id'], ['store_entitlements', 'account_id']]) {
    report.accountCounts[table] = await countRows(client, table, column, user.id)
  }

  if (!user.email_confirmed_at || typeof user.email !== 'string' || !user.email.trim()) {
    report.blockers.push('current_email_unverified_or_missing')
    return report
  }
  // PostgREST also treats * as an ILIKE wildcard.
  if (user.email.includes('*')) {
    report.blockers.push('unsupported_email_pattern')
    return report
  }
  const emailPattern = user.email.trim().replace(/[\\%_]/g, '\\$&')
  report.legacyCandidateCounts = {}
  for (const [table, column] of [['users', 'email'], ['session_completions', 'user_email'], ['subscriptions', 'user_email'], ['session_waitlist', 'email']]) {
    report.legacyCandidateCounts[table] = await countRows(client, table, column, emailPattern, 'ilike')
  }
  const orders = await customOrders(client, emailPattern)
  report.legacyCandidateCounts.custom_orders = orders.count
  report.mediaReferences = orders.mediaReferences
  return report
}
