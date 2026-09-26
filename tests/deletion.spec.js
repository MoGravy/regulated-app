import { test, expect } from '@playwright/test'
import { signedIn, FAKE_JWT } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { active: false } }))
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, route => route.fulfill({ json: [] }))
})

test('the public deletion page works without the app or onboarding', async ({ page }) => {
  await page.goto('/delete-account')
  await expect(page.getByRole('heading', { name: 'Request account deletion' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/signin')
  await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0)
})

test('a confirmed account request handles failure and reports a saved receipt', async ({ page }) => {
  await signedIn(page)
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, route => route.fulfill({ json: [] }))
  let attempts = 0
  await page.route('**/api/request-account-deletion', route => {
    attempts++
    expect(route.request().headers().authorization).toBe(`Bearer ${FAKE_JWT}`)
    expect(route.request().postData()).toBeNull()
    return route.fulfill(attempts === 1
      ? { status: 500, json: { error: 'Unavailable' } }
      : { json: { requestId: 'test-receipt', status: 'requested', requestedAt: '2026-09-26T00:00:00Z' } })
  })
  await page.goto('/premium')
  await page.getByRole('button', { name: 'Request account deletion' }).click()
  const submit = page.getByRole('button', { name: 'Submit request' })
  await expect(submit).toBeDisabled()
  expect(attempts).toBe(0)
  await page.screenshot({ path: '/private/tmp/regulated-deletion-confirm.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('checkbox').check()
  await submit.click()
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.')
  await expect(page.getByRole('heading', { name: 'Request received' })).toHaveCount(0)
  await submit.click()
  await expect(page.getByRole('status')).toContainText('Your deletion request has been recorded.')
  await expect(submit).toHaveCount(0)
  expect(attempts).toBe(2)
  await page.screenshot({ path: '/private/tmp/regulated-deletion-ui.png', fullPage: true, animations: 'disabled' })
})
