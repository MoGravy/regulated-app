import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const env = import.meta.env
let tail = Promise.resolve()
let desiredAccount = null
let revision = 0
let configured = false
let packages = new Map()
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

async function sdkFor(account, captured) {
  const config = configuration()
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
  return Purchases
}

export function setBillingAccount(account) {
  if (account === desiredAccount) return Promise.resolve()
  desiredAccount = account
  const captured = ++revision
  packages = new Map()
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
    const sdk = await sdkFor(account, captured)
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
      const sdk = await sdkFor(account, captured)
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
