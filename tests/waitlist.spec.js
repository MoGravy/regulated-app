import { test, expect } from '@playwright/test'
import { skipOnboarding, noProductionWrites, HAS_API } from './helpers.js'

test.use({ viewport: { width: 380, height: 820 } })

// Code handoff item 8. Every session is made to look unrecorded so the capture
// is reachable whatever the live library holds; the API call itself is stubbed.
test('a session without audio takes an email for the waitlist', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  await page.route(/\/rest\/v1\/sessions/, async route => {
    const res = await route.fetch()
    const strip = x => Array.isArray(x) ? x.map(strip) : x && typeof x === 'object' ? { ...x, has_audio: false } : x
    await route.fulfill({ response: res, json: strip(await res.json()) })
  })
  const calls = []
  await page.route('**/api/waitlist', route => {
    calls.push(route.request().postDataJSON())
    route.fulfill({ status: 200, json: { ok: true } })
  })

  await page.goto('/sessions')
  await page.locator('.row').first().click()
  await expect(page).toHaveURL(/\/sessions\/[^/]+$/)

  await page.getByLabel('Notify me when this session is ready').fill('test@example.com')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'shots/after/waitlist.png' })
  await page.getByRole('button', { name: 'Notify me' }).click()
  await expect(page.getByRole('status')).toContainText('on the list')
  expect(calls).toHaveLength(1)
  expect(calls[0].email).toBe('test@example.com')
  expect(page.url()).toContain(calls[0].session_id)
})

// Live checks against a deployed preview: both endpoints answer, and the
// ANNUALFREE gate turns away a caller with no bearer before anything else.
test('deployed: waitlist rejects an unknown session, ANNUALFREE rejects the signed out', async ({ page }) => {
  test.skip(!HAS_API, 'needs a deployed API')
  const w = await page.request.post('/api/waitlist', {
    data: { session_id: '00000000-0000-0000-0000-000000000000', email: 'nobody@example.com' },
  })
  expect(w.status()).toBe(404)
  const c = await page.request.post('/api/validate-coupon', { data: { code: 'ANNUALFREE' } })
  const body = await c.json()
  expect([403, 404]).toContain(c.status())
  expect(body.valid).toBe(false)
  console.log('validate-coupon ANNUALFREE signed out ->', c.status(), body.error)
})
