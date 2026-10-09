import { test, expect } from '@playwright/test'
import { build } from 'esbuild'

async function harness(native, signedIn = false, withOffer = false) {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import App from './src/App.jsx'
      createRoot(document.getElementById('root')).render(<App />)
    ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify(signedIn ? {VITE_BILLING_BACKEND_READY:'true',VITE_BILLING_IOS_PUBLIC_KEY:'appl_fixture',VITE_BILLING_IOS_OFFERING:'main',VITE_BILLING_IOS_MONTHLY_PRODUCT:'monthly',VITE_BILLING_IOS_ANNUAL_PRODUCT:'annual'} : {}) },
    plugins: [{ name: 'offline-billing', setup(builder) {
      builder.onResolve({ filter: /(@revenuecat\/purchases-capacitor|@capacitor\/core|@capacitor\/app|supabase|lib\/analytics|lib\/stripe)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
        if (path === '@revenuecat/purchases-capacitor') return {contents: `export const Purchases = { configure: async () => {}, getAppUserID: async () => ({appUserID:'11111111-1111-4111-8111-111111111111'}), getOfferings: async () => (${JSON.stringify(withOffer ? {all:{main:{identifier:'main',availablePackages:[{identifier:'month',product:{identifier:'monthly',subscriptionPeriod:'P1M',title:'Store product',priceString:'A$19.00'}}]}}} : {all:{}})}), purchasePackage: async () => {throw {userCancelled:true}}, restorePurchases: async () => {window.restored = true} }`}
        if (path === '@capacitor/core') return { contents: `export const Capacitor = { isNativePlatform: () => ${native}, getPlatform: () => '${native ? 'ios' : 'web'}' }; export const SystemBarsStyle = {Light:'LIGHT',Dark:'DARK'}; export const SystemBars = {setStyle: async (value) => {window.barStyle = value.style}}; export class WebPlugin {}; export const registerPlugin = () => ({})` }
        if (path === '@capacitor/app') return { contents: 'export const App = { addListener: async () => ({remove(){}}) }' }
        if (path.endsWith('/stripe')) return { contents: 'window.stripeLoaded = true; export const stripePromise = Promise.resolve({redirectToCheckout: async () => {window.stripeRedirected = true; return {}}})' }
        if (path.endsWith('/analytics')) return { contents: 'export const trackEvent = () => {}; export const Events = {}' }
        return { contents: `
          export const supabase = { auth: { initialize: async () => ({error:null}), getSession: async () => ({data:{session:${signedIn ? JSON.stringify({user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.test'}}) : 'null'}}}), onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) } }
          export const checkSubscription = async () => {window.accessChecks = (window.accessChecks || 0) + 1; return false}
          export const ensureProfile = async () => {}
          export const signOutUser = async () => {}
          export const upsertUser = async () => {}
          export const confirmEmailLink = async () => {}
          export const sendMagicLink = async () => {}
          export const authHeaders = async () => ({})
          export const getAllSessions = async () => []
          export const getSessionById = async () => null
          export const getAudioUrl = async () => null
          export const getFeaturedSession = async () => null
          export const getSessionsByCategory = async () => []
          export const getSession = async () => null
          export const getSessions = async () => []
          export const SESSION_COLUMNS = ''
          export const getCachedSession = () => null
          export const trackSessionCompletion = async () => {}
          export const signInWithPassword = async () => {}
          export const signUpWithPassword = async () => {}
          export const saveCheckIn = async () => {}
        ` }
      })
    } }],
  })
  return result.outputFiles[0].text
}

for (const native of [true, false]) {
  test(`${native ? 'native blocks custom and Stripe' : 'web keeps Stripe checkout'}`, async ({ page }) => {
    const script = await harness(native)
    const calls = []
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/create-checkout') { calls.push(route.request().postDataJSON()); return route.fulfill({json:{sessionId:'fixture-session'}}) }
      if (route.request().isNavigationRequest()) return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'})
      return route.abort()
    })
    await page.goto(native ? '/custom' : '/premium')
    await page.evaluate(() => localStorage.setItem('regulated_onboarding', 'true'))
    await page.addScriptTag({content:script})
    if (native) {
      await expect(page).toHaveURL(/\/premium$/)
      await expect(page.getByRole('button', {name:'Sign in to subscribe'})).toBeVisible()
      await expect(page.getByText('Custom audio', {exact:true})).toHaveCount(0)
      expect(await page.evaluate(() => window.stripeLoaded)).toBeUndefined()
      expect(calls).toHaveLength(0)
    } else {
      await page.getByLabel('Email', {exact:true}).fill('fixture@example.test')
      await page.getByRole('button', {name:/Continue at/}).click()
      await expect.poll(() => page.evaluate(() => window.stripeRedirected)).toBe(true)
      expect(calls).toHaveLength(1)
      expect(calls[0].type).toBe('subscription')
    }
  })
}

test('native success redirects and restore remains available without offerings', async ({ page }) => {
  const script = await harness(true, true)
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}) : route.abort())
  await page.goto('/success')
  await page.addScriptTag({content:script})
  await expect(page).toHaveURL(/\/premium$/)
  await expect(page.getByText('Subscriptions are not available right now.')).toBeVisible()
  await page.getByRole('button', {name:'Restore a purchase', exact:true}).click()
  await expect.poll(() => page.evaluate(() => window.restored)).toBe(true)
  await expect(page.getByRole('status')).toContainText('still being confirmed')
  await expect(page.getByRole('heading', {name:'You have premium'})).toHaveCount(0)
  expect(await page.evaluate(() => window.stripeLoaded)).toBeUndefined()
})

test('native package shows localized title, price and validated period', async ({ page }) => {
  const script = await harness(true, true, true)
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}) : route.abort())
  await page.goto('/premium')
  await page.addScriptTag({content:script})
  await expect(page.getByRole('button', {name:'Store product A$19.00 a month'})).toBeVisible()
  await expect(page.getByText('Annual, founding rate')).toHaveCount(0)
  const checks = await page.evaluate(() => window.accessChecks)
  await page.getByRole('button', {name:'Subscribe', exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('')
  expect(await page.evaluate(() => window.accessChecks)).toBe(checks)
  expect(await page.evaluate(() => window.stripeLoaded)).toBeUndefined()
})
