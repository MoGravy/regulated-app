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

async function countRows(client, table, filter, columns) {
  const { count } = await read(table, () => filter(client.from(table)
    .select(columns, { count: 'exact', head: true })))
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
  if (receipt?.id !== requestId || typeof receipt.account_id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(receipt.account_id)) {
    throw unavailable('receipt')
  }
  const { data: auth } = await read('auth', () => client.auth.admin.getUserById(receipt.account_id))
  const user = auth?.user
  if (!user || user.id !== receipt.account_id) throw unavailable('auth')

  const report = {
    requestId: receipt.id,
    accountId: receipt.account_id,
    accountCounts: {},
    protectedCareCounts: {},
    notificationCounts: {},
    legacyCandidateCounts: null,
    mediaReferences: [],
    blockers: [
      'legacy_ownership_review', 'historical_email_mapping_required',
      'non_atomic_snapshot', 'auth_foreign_keys', 'provider_review',
      'private_media_ownership', 'unmapped_data', 'retention_decision',
    ],
  }
  for (const [table, column] of [
    ['profiles', 'id'], ['user_progress', 'user_id'], ['store_entitlements', 'account_id'],
    ['revenuecat_sync_state', 'account_id'], ['annual_free_reservations', 'account_id'],
    ['course_grants', 'user_id'], ['course_progress', 'user_id'], ['dap_purchases', 'user_id'],
  ]) {
    report.accountCounts[table] = await countRows(client, table, query => query.eq(column, user.id), column)
  }

  // These are shared or clinical associations, never deletion authority.
  const participants = `client_id.eq.${user.id},practitioner_id.eq.${user.id}`
  const messageAssociations = `${participants},sender_id.eq.${user.id}`
  for (const [table, filter] of [['care_links', participants], ['care_tasks', participants], ['care_messages', messageAssociations]]) {
    report.protectedCareCounts[table] = await countRows(client, table,
      query => query.or(filter), 'client_id')
  }
  report.protectedCareCounts.care_task_entries = await countRows(client, 'care_task_entries',
    query => query.or(participants, { referencedTable: 'care_tasks' }), 'id,care_tasks!inner()')
  report.protectedCareCounts.care_message_reactions = await countRows(client, 'care_message_reactions',
    query => query.or(messageAssociations, { referencedTable: 'care_messages' })
      .or(`user_id.eq.${user.id},care_messages.not.is.null`), 'message_id,care_messages()')
  report.notificationCounts.devices = await countRows(client, 'care_push_subscriptions',
    query => query.eq('user_id', user.id), 'user_id')
  report.notificationCounts.ownedJobs = await countRows(client, 'care_push_jobs',
    query => query.eq('care_push_subscriptions.user_id', user.id), 'id,care_push_subscriptions!inner()')
  report.notificationCounts.associatedJobs = await countRows(client, 'care_push_jobs',
    query => query.eq('care_push_subscriptions.user_id', user.id)
      .or(`${participants},sender_id.eq.${user.id},recipient_id.eq.${user.id},care_push_subscriptions.not.is.null`),
    'id,care_push_subscriptions()')
  if (report.notificationCounts.associatedJobs < report.notificationCounts.ownedJobs) throw unavailable('care_push_jobs')
  if (report.notificationCounts.associatedJobs > report.notificationCounts.ownedJobs) report.blockers.push('shared_notification_jobs')
  if (Object.values(report.protectedCareCounts).some(count => count > 0)) report.blockers.push('shared_care_records')

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
  for (const [table, column] of [['users', 'email'], ['subscriptions', 'user_email'], ['session_waitlist', 'email']]) {
    report.legacyCandidateCounts[table] = await countRows(client, table, query => query.ilike(column, emailPattern), column)
  }
  const orders = await customOrders(client, emailPattern)
  report.legacyCandidateCounts.custom_orders = orders.count
  report.mediaReferences = orders.mediaReferences
  return report
}
