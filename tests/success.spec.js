import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { ui } from '../src/content/reviewedCopy.js'

let harness

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'jsx', contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { MemoryRouter, useNavigate } from 'react-router-dom'
        import Success from './src/pages/Success.jsx'
        function Fixture() {
          window.navigate = useNavigate()
          return <Success />
        }
        createRoot(document.getElementById('root')).render(
          <MemoryRouter initialEntries={[window.initialPath]}><Fixture /></MemoryRouter>
        )
      `,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': '{}' },
    plugins: [{ name: 'receipt-fixture', setup(builder) {
      builder.onResolve({ filter: /hooks\/useApp$/ }, () => ({ path: 'context', namespace: 'fixture' }))
      builder.onResolve({ filter: /lib\/analytics$/ }, () => ({ path: 'analytics', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ resolveDir: process.cwd(), contents: path === 'context'
        ? `import { useState } from 'react';
          const refreshPremium = async () => { window.refreshes++; return window.accessState.isPremium };
          export function useApp() {
            const [access, setAccess] = useState(window.accessState);
            window.setAccess = value => { window.accessState = value; setAccess(value) };
            return { ...access, refreshPremium };
          }`
        : 'export const Events = {}; export const trackEvent = () => {}' }))
    } }],
  })
  harness = result.outputFiles[0].text
})

async function setup(page, path = '/success?session_id=first&type=subscription&plan=annual', access = {}) {
  await page.route('**/*', route => route.request().url().includes('/receipt-fixture')
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    : route.abort())
  await page.goto('/receipt-fixture')
  await page.evaluate(({ path, access }) => {
    window.initialPath = path
    window.accessState = { isPremium: false, authUser: null, ...access }
    window.refreshes = 0
    window.receipts = []
    window.fetch = url => new Promise(resolve => window.receipts.push({
      url, reply: (data, ok = true) => resolve({ ok, status: ok ? 200 : 500, json: async () => data }),
    }))
  }, { path, access })
  await page.addScriptTag({ content: harness })
  await page.waitForFunction(() => window.navigate)
}

async function reply(page, data, index = 0) {
  await expect.poll(() => page.evaluate(() => window.receipts.length)).toBeGreaterThan(index)
  await page.evaluate(({ data, index }) => window.receipts[index].reply(data), { data, index })
}

test('pending and unpaid receipts cannot claim success or reveal the annual code', async ({ page }) => {
  await setup(page)
  await expect(page.getByRole('heading')).toHaveText(ui.payment_pending_title)
  await expect(page.getByText('ANNUALFREE', { exact: true })).toHaveCount(0)
  await reply(page, { status: 'complete', type: 'subscription', plan: 'annual' })
  await expect(page.getByRole('heading')).toHaveText(ui.payment_failed_title)
  await expect(page.getByText('ANNUALFREE', { exact: true })).toHaveCount(0)
})

test('missing, unknown-type and failed receipts stay unconfirmed', async ({ page }) => {
  await setup(page, '/success?type=custom_audio&plan=annual')
  await expect(page.getByRole('heading')).toHaveText(ui.payment_failed_title)
  expect(await page.evaluate(() => window.receipts.length)).toBe(0)
  await page.evaluate(() => window.navigate('/success?session_id=bad'))
  await reply(page, { status: 'paid', type: 'unknown', plan: 'annual' })
  await expect(page.getByRole('heading')).toHaveText(ui.payment_failed_title)
  await page.evaluate(() => window.navigate('/success?session_id=error'))
  await expect.poll(() => page.evaluate(() => window.receipts.length)).toBe(2)
  await page.evaluate(() => window.receipts[1].reply({}, false))
  await expect(page.getByRole('heading')).toHaveText(ui.payment_failed_title)
})

test('server type defeats URL spoofing and receipt does not unlock an account', async ({ page }) => {
  await setup(page, '/success?session_id=first&type=custom_audio&plan=annual')
  await reply(page, { status: 'paid', type: 'subscription', plan: 'monthly' })
  await expect(page.getByRole('heading')).toHaveText(ui.payment_confirmed_title)
  await expect(page.getByText(ui.purchase_active, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByText('ANNUALFREE', { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.setAccess({ authUser: { id: 'other-account' }, isPremium: false }))
  await expect(page.getByText(ui.purchase_active, { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.setAccess({ authUser: { id: 'current-account' }, isPremium: true }))
  await expect(page.getByText(ui.purchase_active, { exact: true })).toBeVisible()
})

test('navigation clears an earlier receipt and ignores its delayed response', async ({ page }) => {
  await setup(page)
  await expect.poll(() => page.evaluate(() => window.receipts.length)).toBe(1)
  await page.evaluate(() => window.navigate('/success?session_id=second&type=subscription&plan=annual'))
  await reply(page, { status: 'paid', type: 'custom_audio' }, 1)
  await expect(page.getByRole('heading')).toHaveText('Purchase verified')
  await reply(page, { status: 'paid', type: 'subscription', plan: 'annual' }, 0)
  await expect(page.getByRole('heading')).toHaveText('Purchase verified')
  await expect(page.getByText('ANNUALFREE', { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.navigate('/success?session_id=third'))
  await expect(page.getByRole('heading')).toHaveText(ui.payment_pending_title)
  await expect(page.getByText(ui.custom_confirmed_body, { exact: true })).toHaveCount(0)
  await reply(page, { status: 'paid', type: 'subscription', plan: 'annual' }, 2)
  await expect(page.getByText('ANNUALFREE', { exact: true })).toBeVisible()
  await page.evaluate(() => window.navigate('/success?session_id=fourth'))
  await expect(page.getByRole('heading')).toHaveText(ui.payment_pending_title)
  await expect(page.getByText('ANNUALFREE', { exact: true })).toHaveCount(0)
})


test('only a server-verified free custom checkout confirms a zero-price receipt', async ({ page }) => {
  await setup(page)
  await reply(page, { status: 'no_payment_required', type: 'subscription', plan: 'annual' })
  await expect(page.getByRole('heading')).toHaveText(ui.payment_failed_title)
  await page.evaluate(() => window.navigate('/success?session_id=free'))
  await reply(page, { status: 'no_payment_required', type: 'custom_audio' }, 1)
  await expect(page.getByRole('heading')).toHaveText('Purchase verified')
  await expect(page.getByRole('status')).toHaveText('Your purchase has been verified.')
  await expect(page.getByText(ui.custom_confirmed_body, { exact: true })).toHaveCount(0)
  await expect(page.getByText('ANNUALFREE', { exact: true })).toHaveCount(0)
})
