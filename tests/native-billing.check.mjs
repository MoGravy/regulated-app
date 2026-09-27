import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = (await readFile(new URL('../src/lib/nativeBilling.js', import.meta.url), 'utf8'))
  .replace(/^import .*\n/gm, '')
  .replace('import.meta.env', 'environment')
  .replaceAll("await import('@revenuecat/purchases-capacitor')", 'await getSDK()')
  .replaceAll('export ', '')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const valid = { VITE_BILLING_BACKEND_READY: 'true', VITE_BILLING_IOS_PUBLIC_KEY: 'appl_fixture', VITE_BILLING_IOS_OFFERING: 'main', VITE_BILLING_IOS_MONTHLY_PRODUCT: 'monthly', VITE_BILLING_IOS_ANNUAL_PRODUCT: 'annual' }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture(environment = valid) {
  let id, session = A
  const calls = []
  const pack = { identifier: 'month', product: { identifier: 'monthly', subscriptionPeriod: 'P1M', title: 'Monthly fixture', priceString: 'A$19.00' } }
  const sdk = {
    configure: async o => { calls.push(['configure', o.appUserID]); id = o.appUserID },
    getAppUserID: async () => ({ appUserID: id }),
    logIn: async o => { calls.push(['login', o.appUserID]); id = o.appUserID },
    isAnonymous: async () => ({ isAnonymous: !id }),
    logOut: async () => { calls.push(['logout']); id = null },
    getOfferings: async () => ({ all: { main: { identifier: 'main', availablePackages: [pack] } } }),
    purchasePackage: async o => { assert.equal(o.aPackage, pack); calls.push(['buy', id]) },
    restorePurchases: async () => { calls.push(['restore', id]) },
  }
  const context = vm.createContext({ environment, Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true }, supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: session } } } }) } }, getSDK: async () => ({ Purchases: sdk }) })
  vm.runInContext(`${source}\nglobalThis.billing = {setBillingAccount, loadPackages, purchase, restore}`, context)
  return { billing: context.billing, sdk, calls, session: value => { session = value }, identity: value => { id = value } }
}
for (const env of [{}, { ...valid, VITE_BILLING_IOS_PUBLIC_KEY: 'test_fixture' }]) {
  const f = fixture(env)
  await assert.rejects(f.billing.setBillingAccount(A), /unavailable/)
  await assert.rejects(f.billing.loadPackages(A), /unavailable/)
  assert.equal(f.calls.length, 0)
}
const f = fixture()
await f.billing.setBillingAccount(A)
await f.billing.setBillingAccount(A)
assert.equal(f.calls.filter(c => c[0] === 'configure').length, 1)
assert.equal((await f.billing.loadPackages(A)).packages[0].price, 'A$19.00')
f.session(B)
await assert.rejects(f.billing.purchase(A, 'month'), /identity/)
f.session(A)
const gate = deferred(), entered = deferred()
f.sdk.purchasePackage = async () => { f.calls.push(['buy', A]); entered.resolve(); await gate.promise }
const buy = f.billing.purchase(A, 'month')
await entered.promise
await assert.rejects(f.billing.purchase(A, 'month'), /busy/)
const change = f.billing.setBillingAccount(B)
f.session(B)
assert.equal(f.calls.filter(c => c[0] === 'login').length, 0)
gate.resolve()
assert.equal((await buy).status, 'stale')
await change
await assert.rejects(f.billing.purchase(B, 'month'), /packages/)
await f.billing.loadPackages(B)
f.sdk.purchasePackage = async () => { throw { userCancelled: true } }
assert.equal((await f.billing.purchase(B, 'month')).status, 'canceled')
const logoutGate = deferred(), logoutEntered = deferred()
f.sdk.purchasePackage = async () => { logoutEntered.resolve(); await logoutGate.promise }
const buying = f.billing.purchase(B, 'month')
await logoutEntered.promise
const logout = f.billing.setBillingAccount(null)
assert.equal(f.calls.filter(c => c[0] === 'logout').length, 0)
logoutGate.resolve()
assert.equal((await buying).status, 'stale')
await logout
const loginGate = deferred(), loginEntered = deferred()
f.sdk.logIn = async () => { loginEntered.resolve(); await loginGate.promise; f.identity(A) }
const login = f.billing.setBillingAccount(A)
await loginEntered.promise
const switchAgain = f.billing.setBillingAccount(B)
f.sdk.logIn = async () => { throw new Error('fixture') }
loginGate.resolve()
await login
await assert.rejects(switchAgain)
f.sdk.logIn = async ({ appUserID }) => f.identity(appUserID)
assert.equal((await f.billing.loadPackages(B)).status, 'ready')
assert.equal((await f.billing.restore(B)).status, 'restored')
assert.equal(f.calls.filter(c => c[0] === 'configure').length, 1)
console.log('Native billing controller fixtures passed: configuration, identity, queue recovery, stale packages, overlap, cancellation and sign-out.')
const race = fixture()
await race.billing.setBillingAccount(A)
await race.billing.loadPackages(A)
const identityGate = deferred(), identityEntered = deferred()
race.sdk.getAppUserID = async () => { identityEntered.resolve(); await identityGate.promise; return { appUserID: A } }
const racedBuy = race.billing.purchase(A, 'month')
await identityEntered.promise
race.session(B)
identityGate.resolve()
await assert.rejects(racedBuy, /identity/)
assert.equal(race.calls.filter(c => c[0] === 'buy').length, 0)
const noOffer = fixture()
await noOffer.billing.setBillingAccount(A)
noOffer.sdk.getOfferings = async () => ({ all: {} })
await assert.rejects(noOffer.billing.loadPackages(A), /packages/)
assert.equal((await noOffer.billing.restore(A)).status, 'restored')
noOffer.sdk.restorePurchases = async () => { throw { code: '20' } }
assert.equal((await noOffer.billing.restore(A)).status, 'pending')
console.log('Queued session reread, offering-independent restore and pending payment fixtures passed.')
