import { test, expect } from '@playwright/test'
import { build } from 'esbuild'

let harness

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'jsx', contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { AppProvider, useApp } from './src/hooks/useApp.jsx'
        import { checkSubscription } from './src/lib/supabase.js'
        function Probe() { window.access = useApp(); return null }
        const root = createRoot(document.getElementById('root'))
        window.unmountProvider = () => root.unmount()
        window.checkSubscription = checkSubscription
        root.render(<AppProvider><Probe /></AppProvider>)
      `,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': '{}' },
    plugins: [{ name: 'account-fixture', setup(builder) {
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'fixture' }))
      builder.onResolve({ filter: /config\/credentials$/ }, () => ({ path: 'credentials', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'client'
        ? 'export const createClient = () => window.authFixture'
        : 'export const SUPABASE_URL = "https://example.test"; export const SUPABASE_ANON_KEY = "fixture"' }))
    } }],
  })
  harness = result.outputFiles[0].text
})

async function setup(page, { account = 'A', delayedInitial = false } = {}) {
  await page.route('**/*', route => route.request().url().includes('/premium-refresh-fixture')
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    : route.abort())
  await page.goto('/premium-refresh-fixture')
  await page.evaluate(({ account, delayedInitial }) => {
    const session = id => id ? { user: { id, email: `${id}@example.test` }, access_token: `fixture-${id}` } : null
    let current = session(account), listener, reads = 0
    window.requests = []
    window.authFixture = {
      auth: {
        initialize: async () => ({ error: null }),
        getSession() {
          reads++
          if (reads === 1 && delayedInitial) return new Promise(resolve => { window.resolveInitial = id => resolve({ data: { session: session(id) } }) })
          return Promise.resolve({ data: { session: current } })
        },
        onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { listener = null } } } } },
        signOut: async () => { current = null; listener?.('SIGNED_OUT', null); return {} },
      },
      from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }),
    }
    window.changeAccount = id => { current = session(id); listener?.('SIGNED_IN', current) }
    window.changeSessionSilently = id => { current = session(id) }
    window.sessionReads = () => reads
    window.fetch = async (_url, options) => new Promise(resolve => {
      window.requests.push({ options, resolve: (active, status = 200) => resolve({ ok: status === 200, status, json: async () => ({ active }) }) })
    })
    window.results = []
    window.refresh = () => window.access.refreshPremium().then(value => window.results.push(value), () => window.results.push('error'))
  }, { account, delayedInitial })
  await page.addScriptTag({ content: harness })
  await page.waitForFunction(() => window.access && window.authFixture)
}

async function requests(page, count) {
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(count)
}
async function reply(page, index, value, status = 200) {
  await page.evaluate(({ index, value, status }) => window.requests[index].resolve(value, status), { index, value, status })
}
async function premium(page, value) {
  await expect.poll(() => page.evaluate(() => window.access.isPremium)).toBe(value)
}

test('current false and errors revoke access; newer refresh wins and stale errors stay silent', async ({ page }) => {
  await setup(page)
  await requests(page, 1)
  await reply(page, 0, true)
  await premium(page, true)
  await page.evaluate(() => { void window.refresh(); void window.refresh() })
  await requests(page, 3)
  await reply(page, 2, false)
  await premium(page, false)
  await reply(page, 1, true)
  await expect.poll(() => page.evaluate(() => window.results)).toEqual([false, null])
  await premium(page, false)
  await page.evaluate(() => { void window.refresh(); void window.refresh() })
  await requests(page, 5)
  await reply(page, 4, true)
  await premium(page, true)
  await reply(page, 3, null, 500)
  await expect.poll(() => page.evaluate(() => window.results)).toEqual([false, null, true, null])
  await premium(page, true)
  await page.evaluate(() => { void window.refresh() })
  await requests(page, 6)
  await reply(page, 5, null, 500)
  await premium(page, false)
  await expect.poll(() => page.evaluate(() => window.results.at(-1))).toBe('error')
})

test('old account, sign-out and unmount cannot commit pending checks', async ({ page }) => {
  await setup(page)
  await requests(page, 1)
  await page.evaluate(() => window.changeAccount('B'))
  await requests(page, 2)
  await reply(page, 1, false)
  await reply(page, 0, true)
  await premium(page, false)
  await page.evaluate(() => { void window.refresh() })
  await requests(page, 3)
  await page.evaluate(() => window.access.signOut())
  await reply(page, 2, true)
  await expect.poll(() => page.evaluate(() => window.results)).toEqual([null])
  await premium(page, false)
  await page.evaluate(() => window.changeAccount('C'))
  await requests(page, 4)
  await page.evaluate(() => { void window.refresh() })
  await requests(page, 5)
  await page.evaluate(() => window.unmountProvider())
  await reply(page, 4, true)
  await reply(page, 3, true)
  await expect.poll(() => page.evaluate(() => window.results)).toEqual([null, null])
})

test('a delayed initial session cannot replace a newer auth event', async ({ page }) => {
  await setup(page, { delayedInitial: true })
  await page.evaluate(() => window.changeAccount('B'))
  await requests(page, 1)
  await reply(page, 0, true)
  await premium(page, true)
  await page.evaluate(() => window.resolveInitial('A'))
  await expect.poll(() => page.evaluate(() => window.access.authUser.id)).toBe('B')
  expect(await page.evaluate(() => window.requests.length)).toBe(1)
})

test('sign-out invalidates a delayed initial session before the remote sign-out finishes', async ({ page }) => {
  await setup(page, { delayedInitial: true })
  await page.evaluate(() => {
    window.authFixture.auth.signOut = () => new Promise(resolve => { window.finishSignOut = resolve })
    void window.access.signOut()
    window.resolveInitial('A')
  })
  await premium(page, false)
  expect(await page.evaluate(() => window.access.authUser)).toBe(null)
  expect(await page.evaluate(() => window.requests.length)).toBe(0)
  await page.evaluate(() => window.finishSignOut({}))
})

test('one captured session supplies identity and token; mismatches and malformed responses reject', async ({ page }) => {
  await setup(page)
  await requests(page, 1)
  await reply(page, 0, false)
  await premium(page, false)
  const before = await page.evaluate(() => window.sessionReads())
  await page.evaluate(() => { void window.refresh() })
  await requests(page, 2)
  expect(await page.evaluate(() => window.sessionReads())).toBe(before + 1)
  const options = await page.evaluate(() => window.requests[1].options)
  expect(options.headers.Authorization).toBe('Bearer fixture-A')
  expect(JSON.parse(options.body)).toEqual({ email: 'A@example.test' })
  await reply(page, 1, 'true')
  await expect.poll(() => page.evaluate(() => window.results)).toEqual(['error'])
  await premium(page, false)
  await page.evaluate(() => { window.changeSessionSilently('B'); void window.refresh() })
  await expect.poll(() => page.evaluate(() => window.results)).toEqual(['error', 'error'])
  expect(await page.evaluate(() => window.requests.length)).toBe(2)
})
