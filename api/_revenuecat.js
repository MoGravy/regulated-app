import { randomUUID } from 'node:crypto'

const API_ROOT = 'https://api.revenuecat.com/v2'
const API_ORIGIN = new URL(API_ROOT).origin
const CACHE_SECONDS = 300
const LEASE_SECONDS = 45
const MAX_PAGES = 25
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const TOTAL_TIMEOUT_MS = 12000

function readConfig(env) {
  const apiKey = env.REVENUECAT_V2_SECRET_API_KEY
  const projectId = env.REVENUECAT_PROJECT_ID
  const entitlementId = env.REVENUECAT_ENTITLEMENT_ID
  let products
  try {
    products = JSON.parse(env.REVENUECAT_ALLOWED_PRODUCTS || 'null')
  } catch {
    return null
  }
  if (!apiKey || !projectId || !entitlementId || !products || Array.isArray(products) || typeof products !== 'object') return null
  const entries = Object.entries(products)
  if (!entries.length || entries.some(([id, item]) => !id || !item ||
    typeof item.appId !== 'string' || !item.appId || typeof item.storeIdentifier !== 'string' || !item.storeIdentifier ||
    !['app_store', 'play_store', 'mac_app_store'].includes(item.store))) return null
  return { apiKey, projectId, entitlementId, products }
}

function rpcRow(data) {
  if (Array.isArray(data)) return data[0] || null
  return data && typeof data === 'object' ? data : null
}

function safePath(path) {
  return `${API_ROOT}${path}`
}

function checkNextPage(nextPage, basePath, lastId, environment, entitlementPage = false) {
  if (typeof nextPage !== 'string' || !nextPage) throw new Error('Invalid pagination link')
  const url = new URL(nextPage, `${API_ROOT}/`)
  const base = new URL(safePath(basePath))
  if (url.origin !== API_ORIGIN || url.pathname !== base.pathname || url.username || url.password || url.hash) {
    throw new Error('Invalid pagination scope')
  }
  const allowed = new Set(['starting_after', 'limit', ...(environment ? ['environment'] : []), ...(entitlementPage ? ['status'] : [])])
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new Error('Invalid pagination query')
  if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) throw new Error('Invalid pagination query')
  if (url.searchParams.get('starting_after') !== lastId) throw new Error('Invalid pagination cursor')
  const limit = url.searchParams.get('limit')
  if (limit && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) throw new Error('Invalid pagination limit')
  if (environment && url.searchParams.has('environment') && url.searchParams.get('environment') !== environment) throw new Error('Invalid pagination environment')
  if (entitlementPage && url.searchParams.has('status') && url.searchParams.get('status') !== 'active') throw new Error('Invalid entitlement status')
  if (environment && !url.searchParams.has('environment')) url.searchParams.set('environment', environment)
  return url
}

async function readJson(response) {
  const length = Number(response.headers?.get?.('content-length') || 0)
  if (length > MAX_RESPONSE_BYTES) throw new Error('RevenueCat response too large')
  const raw = await response.text()
  if (raw.length > MAX_RESPONSE_BYTES) throw new Error('RevenueCat response too large')
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('Invalid RevenueCat response') }
  if (!response.ok) throw new Error('RevenueCat request failed')
  return value
}

async function providerGet(pathOrUrl, config, signal, fetchImpl) {
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(safePath(pathOrUrl))
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/v2/')) throw new Error('Invalid RevenueCat URL')
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
    redirect: 'error',
    signal,
  })
  return readJson(response)
}

async function listPages(basePath, config, signal, fetchImpl, environment) {
  const query = new URLSearchParams({ limit: '100' })
  if (environment) query.set('environment', environment)
  let current = new URL(`${safePath(basePath)}?${query}`)
  const visited = new Set()
  const items = []
  for (let page = 0; page < MAX_PAGES; page++) {
    if (visited.has(current.href)) throw new Error('RevenueCat pagination cycle')
    visited.add(current.href)
    const payload = await providerGet(current, config, signal, fetchImpl)
    if (payload?.object !== 'list' || !Array.isArray(payload.items)) throw new Error('Invalid RevenueCat list')
    items.push(...payload.items)
    if (items.length > MAX_PAGES * 100) throw new Error('RevenueCat result too large')
    if (!payload.next_page) return items
    const last = payload.items.at(-1)
    if (!last?.id) throw new Error('Invalid RevenueCat page cursor')
    current = checkNextPage(payload.next_page, basePath, last.id, environment)
    if (!current.searchParams.has('limit')) current.searchParams.set('limit', '100')
  }
  throw new Error('RevenueCat page limit exceeded')
}

async function completeEmbeddedList(initial, basePath, config, signal, fetchImpl) {
  if (initial?.object !== 'list' || !Array.isArray(initial.items)) throw new Error('Invalid RevenueCat entitlement list')
  const items = [...initial.items]
  const visited = new Set()
  let nextPage = initial.next_page
  for (let page = 1; nextPage; page++) {
    if (page >= MAX_PAGES) throw new Error('RevenueCat page limit exceeded')
    const last = items.at(-1)
    if (!last?.id) throw new Error('Invalid RevenueCat page cursor')
    const current = checkNextPage(nextPage, basePath, last.id, null, true)
    if (visited.has(current.href)) throw new Error('RevenueCat pagination cycle')
    visited.add(current.href)
    const payload = await providerGet(current, config, signal, fetchImpl)
    if (payload?.object !== 'list' || !Array.isArray(payload.items)) throw new Error('Invalid RevenueCat entitlement page')
    items.push(...payload.items)
    if (items.length > MAX_PAGES * 100) throw new Error('RevenueCat result too large')
    nextPage = payload.next_page
  }
  return items
}

async function validateProducts(config, signal, fetchImpl) {
  const result = new Map()
  for (const [id, expected] of Object.entries(config.products)) {
    const path = `/projects/${encodeURIComponent(config.projectId)}/products/${encodeURIComponent(id)}`
    const product = await providerGet(path, config, signal, fetchImpl)
    if (product?.object !== 'product' || product.id !== id || product.state !== 'active' ||
      product.type !== 'subscription' || product.app_id !== expected.appId ||
      product.store_identifier !== expected.storeIdentifier) {
      throw new Error('RevenueCat product does not match allowlist')
    }
    result.set(id, expected)
  }
  return result
}

function expiresAtFor(subscription, nowMs, cacheUntilMs) {
  if (subscription.gives_access !== true) return new Date(nowMs).toISOString()
  if (subscription.ends_at == null || !Number.isFinite(subscription.ends_at)) return new Date(nowMs).toISOString()
  const grace = subscription.status === 'in_grace_period'
  if (subscription.ends_at <= nowMs && !grace) return new Date(nowMs).toISOString()
  return new Date(Math.min(cacheUntilMs, subscription.ends_at > nowMs ? subscription.ends_at : cacheUntilMs)).toISOString()
}

async function normalizeSnapshot(accountId, config, products, signal, fetchImpl, nowMs) {
  const path = `/projects/${encodeURIComponent(config.projectId)}/customers/${encodeURIComponent(accountId)}/subscriptions`
  const subscriptions = await listPages(path, config, signal, fetchImpl, 'production')
  const cacheUntilMs = nowMs + CACHE_SECONDS * 1000
  const rows = []
  for (const sub of subscriptions) {
    if (sub?.object !== 'subscription' || typeof sub.id !== 'string' ||
      sub.customer_id !== accountId || sub.original_customer_id !== accountId ||
      sub.environment !== 'production') throw new Error('RevenueCat customer ownership mismatch')
    const allowedProduct = products.get(sub.product_id)
    if (!allowedProduct || sub.store !== allowedProduct.store) continue

    let entitlementAllowed = false
    if (sub.gives_access === true) {
      const entitlementsPath = `/projects/${encodeURIComponent(config.projectId)}/subscriptions/${encodeURIComponent(sub.id)}/entitlements`
      const entitlements = await completeEmbeddedList(sub.entitlements, entitlementsPath, config, signal, fetchImpl)
      entitlementAllowed = entitlements.some(item => item?.id === config.entitlementId &&
        item.project_id === config.projectId && item.state === 'active')
    }
    const givesAccess = sub.gives_access === true && entitlementAllowed &&
      !(sub.ends_at == null) && (sub.ends_at > nowMs || sub.status === 'in_grace_period')
    const effective = givesAccess ? { ...sub, gives_access: true } : { ...sub, gives_access: false }
    rows.push({
      external_id: sub.id,
      product_id: sub.product_id,
      status: givesAccess ? (sub.status === 'in_grace_period' ? 'grace' : 'active') : 'expired',
      expires_at: expiresAtFor(effective, nowMs, cacheUntilMs),
    })
  }
  return rows
}

function snapshotFreshSeconds(rows, nowMs) {
  const active = rows.filter(row => ['active', 'grace'].includes(row.status))
  if (!active.length) return 5
  const earliestExpiry = Math.min(...active.map(row => Date.parse(row.expires_at)))
  return Math.max(1, Math.min(CACHE_SECONDS, Math.floor((earliestExpiry - nowMs) / 1000)))
}

async function releaseLease(supabase, accountId, generation, token) {
  try {
    await supabase.rpc('release_revenuecat_sync', {
      p_account_id: accountId,
      p_generation: generation,
      p_lease_token: token,
    })
  } catch {
    // Lease expiry is the recovery path if release itself fails.
  }
}

// Returns true only when a complete production snapshot is committed or still fresh.
export async function syncRevenueCatSnapshot(supabase, accountId, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  makeToken = randomUUID,
} = {}) {
  const config = readConfig(env)
  if (!config || typeof fetchImpl !== 'function') return { enabled: false, fresh: false }

  const token = makeToken()
  let claim
  try {
    const { data, error } = await supabase.rpc('claim_revenuecat_sync', {
      p_account_id: accountId,
      p_lease_token: token,
      p_lease_seconds: LEASE_SECONDS,
    })
    if (error) throw error
    claim = rpcRow(data)
  } catch {
    return { enabled: true, fresh: false }
  }
  if (claim?.fresh === true) return { enabled: true, fresh: true }
  if (claim?.claimed !== true || !Number.isSafeInteger(Number(claim.generation))) return { enabled: true, fresh: false }
  const generation = Number(claim.generation)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS)
  const snapshotAt = now()
  try {
    const products = await validateProducts(config, controller.signal, fetchImpl)
    const rows = await normalizeSnapshot(accountId, config, products, controller.signal, fetchImpl, snapshotAt)
    const { data, error } = await supabase.rpc('commit_revenuecat_snapshot', {
      p_account_id: accountId,
      p_generation: generation,
      p_lease_token: token,
      p_rows: rows,
      p_fresh_seconds: snapshotFreshSeconds(rows, snapshotAt),
    })
    if (error || rpcRow(data)?.committed !== true) throw new Error('RevenueCat snapshot was not committed')
    return { enabled: true, fresh: true }
  } catch {
    await releaseLease(supabase, accountId, generation, token)
    return { enabled: true, fresh: false }
  } finally {
    clearTimeout(timer)
  }
}
