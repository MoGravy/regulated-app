import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const env = import.meta.env
let tail = Promise.resolve()
let desiredAccount = null
let revision = 0
let configured = false
let packages = new Map()
let coursePackage = null
let busy = false
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const stale = { status: 'stale' }

function configuration() {
  const platform = Capacitor.getPlatform()
  const prefix = platform === 'ios' ? 'VITE_BILLING_IOS_' : 'VITE_BILLING_ANDROID_'
  const key = env[`${prefix}PUBLIC_KEY`]
  const offering = env[`${prefix}OFFERING`]
  const monthly = env[`${prefix}MONTHLY_PRODUCT`]
  const annual = env[`${prefix}ANNUAL_PRODUCT`]
  if (!Capacitor.isNativePlatform() || !['ios', 'android'].includes(platform) ||
      env.VITE_BILLING_BACKEND_READY !== 'true' ||
      typeof key !== 'string' || !key.startsWith(platform === 'ios' ? 'appl_' : 'goog_') ||
      !offering || !monthly || !annual || monthly === annual) {
    throw new Error('billing-unavailable')
  }
  return { key, offering, monthly, annual }
}

function queue(work) {
  const next = tail.then(work)
  tail = next.catch(() => {})
  return next
}

function current(account, captured) {
  return uuid.test(account || '') && desiredAccount === account && revision === captured
}

async function sdkFor(account, captured, configProvider = configuration) {
  const config = configProvider()
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  if (!current(account, captured)) return null
  if (!configured) {
    await Purchases.configure({ apiKey: config.key, appUserID: account })
    configured = true
  } else {
    const { appUserID } = await Purchases.getAppUserID()
    if (!current(account, captured)) return null
    if (appUserID !== account) await Purchases.logIn({ appUserID: account })
  }
  if (!current(account, captured)) return null
  const { appUserID } = await Purchases.getAppUserID()
  if (!current(account, captured)) return null
  if (appUserID !== account) throw new Error('billing-identity')
  return { sdk: Purchases }
}

export function setBillingAccount(account) {
  if (account === desiredAccount) return Promise.resolve()
  desiredAccount = account
  const captured = ++revision
  packages = new Map()
  coursePackage = null
  return queue(async () => {
    if (captured !== revision) return
    if (account) {
      if (!uuid.test(account)) throw new Error('billing-identity')
      await sdkFor(account, captured)
    } else if (configured) {
      const { Purchases } = await import('@revenuecat/purchases-capacitor')
      if (captured !== revision) return
      const { isAnonymous } = await Purchases.isAnonymous()
      if (captured !== revision) return
      if (!isAnonymous) await Purchases.logOut()
    }
  })
}

export function loadPackages(account) {
  const captured = revision
  return queue(async () => {
    if (!current(account, captured)) return stale
    const config = configuration()
    const connection = await sdkFor(account, captured)
    const sdk = connection?.sdk
    if (!sdk) return stale
    const offerings = await sdk.getOfferings()
    if (!current(account, captured)) return stale
    const offering = offerings.all?.[config.offering]
    const allowed = (offering?.identifier === config.offering ? offering.availablePackages : [])
      .filter(p => (p.product.identifier === config.monthly && p.product.subscriptionPeriod === 'P1M') ||
        (p.product.identifier === config.annual && p.product.subscriptionPeriod === 'P1Y'))
    if (!allowed.length || new Set(allowed.map(p => p.identifier)).size !== allowed.length ||
        allowed.some(p => !p.identifier || !p.product.title || !p.product.priceString)) {
      packages = new Map()
      throw new Error('billing-packages')
    }
    packages = new Map(allowed.map(p => [p.identifier, { package: p, revision: captured }]))
    return { status: 'ready', packages: allowed.map(p => ({ id: p.identifier, title: p.product.title, price: p.product.priceString, period: p.product.subscriptionPeriod })) }
  })
}

async function storeOperation(account, packageId, restoring) {
  if (busy) throw new Error('billing-busy')
  busy = true
  const captured = revision
  try {
    configuration()
    if (!current(account, captured)) return stale
    return await queue(async () => {
      if (!current(account, captured)) return stale
      const cached = packages.get(packageId)
      if (!restoring && (!cached || cached.revision !== captured)) throw new Error('billing-packages')
      const connection = await sdkFor(account, captured)
      const sdk = connection?.sdk
      if (!sdk) return stale
      const { data, error } = await supabase.auth.getSession()
      if (!current(account, captured)) return stale
      if (error || data?.session?.user?.id !== account) throw new Error('billing-identity')
      try {
        if (restoring) await sdk.restorePurchases()
        else await sdk.purchasePackage({ aPackage: cached.package })
        return current(account, captured) ? { status: restoring ? 'restored' : 'purchased' } : stale
      } catch (error) {
        if (!current(account, captured)) return stale
        if (error.userCancelled) return { status: 'canceled' }
        if (String(error.code) === '20') return { status: 'pending' }
        throw new Error('billing-operation')
      }
    })
  } finally {
    busy = false
  }
}

export const purchase = (account, packageId) => storeOperation(account, packageId, false)
export const restore = account => storeOperation(account, null, true)

export function billingAvailable() {
  try { configuration(); return true } catch { return false }
}

function dapConfiguration() {
  const key = env.VITE_BILLING_ANDROID_PUBLIC_KEY
  const offering = env.VITE_PLAY_DAP_OFFERING
  const product = env.VITE_PLAY_DAP_PRODUCT
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android' ||
      env.VITE_PLAY_DAP_READY !== 'true' || env.VITE_PLAY_DAP_BACKEND_READY !== 'true' ||
      typeof key !== 'string' || !key.startsWith('goog_') || !offering || !product) throw new Error('billing-unavailable')
  return { key, offering, product }
}

async function sessionMatches(account, captured) {
  const { data, error } = await supabase.auth.getSession()
  return !error && current(account, captured) && data?.session?.user?.id === account
}

export function loadDapPackage(account) {
  const captured = revision
  return queue(async () => {
    coursePackage = null
    if (!current(account, captured)) return stale
    const config = dapConfiguration()
    const connection = await sdkFor(account, captured, dapConfiguration)
    if (!connection || !current(account, captured)) return stale
    const offerings = await connection.sdk.getOfferings()
    if (!current(account, captured)) return stale
    const offering = offerings.all?.[config.offering]
    const matches = (offering?.identifier === config.offering ? offering.availablePackages : [])
      .filter(item => item?.product?.identifier === config.product && item.product.productCategory === 'NON_SUBSCRIPTION' && item.product.subscriptionPeriod == null)
    if (matches.length !== 1 || !matches[0].identifier || !matches[0].product.title || !matches[0].product.priceString) {
      coursePackage = null
      throw new Error('billing-packages')
    }
    coursePackage = { package: matches[0], revision: captured }
    return { status: 'ready', title: matches[0].product.title, price: matches[0].product.priceString }
  })
}

// The injected trusted client transport is not a source of purchase proof; the server must verify provider state.
export async function purchaseDap(account, { reserve, confirm }) {
  if (busy) throw new Error('billing-busy')
  busy = true
  const captured = revision
  try {
    dapConfiguration()
    return await queue(async () => {
      if (!current(account, captured) || !coursePackage || coursePackage.revision !== captured) return { status: 'pending' }
      const connection = await sdkFor(account, captured, dapConfiguration)
      if (!connection || !await sessionMatches(account, captured)) return { status: 'pending' }
      const nonce = crypto.randomUUID()
      let claim
      try { claim = await reserve({ nonce }) } catch { return { status: 'pending' } }
      if (claim?.status !== 'created' || claim.sku !== dapConfiguration().product || claim.sdkKey !== dapConfiguration().key ||
          coursePackage?.package?.product?.identifier !== claim.sku || !await sessionMatches(account, captured)) return { status: 'pending' }
      try { await connection.sdk.purchasePackage({ aPackage: coursePackage.package }) } catch { return { status: 'pending' } }
      if (!await sessionMatches(account, captured)) return { status: 'pending' }
      try {
        const result = await confirm({ nonce })
        if (!await sessionMatches(account, captured)) return { status: 'pending' }
        return { status: result?.ready === true ? 'ready' : 'pending' }
      } catch { return { status: 'pending' } }
    })
  } finally { busy = false }
}

// Server-side discovery, not RevenueCat SDK restore, avoids an unapproved account transfer.
export async function recoverDap(account, { confirm }) {
  const captured = revision
  return queue(async () => {
    dapConfiguration()
    if (!await sessionMatches(account, captured)) return { status: 'pending' }
    try {
      const result = await confirm({})
      if (!await sessionMatches(account, captured)) return { status: 'pending' }
      return { status: result?.ready === true ? 'ready' : 'pending' }
    } catch { return { status: 'pending' } }
  })
}
