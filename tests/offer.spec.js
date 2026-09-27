import { test, expect } from '@playwright/test'
import { skipOnboarding, noProductionWrites } from './helpers.js'
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'

test.use({ viewport: { width: 380, height: 820 } })

// Code handoff item 5. The counter is a live count, so the number is checked
// against the library rather than pinned.
test('pricing shows the custom session, the guarantee, and a live counter', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  await page.goto('/premium')

  const annual = page.locator('.card', { hasText: 'Annual, founding rate' })
  await expect(annual).toContainText('Includes a custom session built for you')
  await expect(annual).toContainText('Complete the 6-week program. If you do not feel a difference, full refund.')

  const counter = page.getByTestId('library-counter')
  await expect(counter).toHaveText(/^\d+ of 40 sessions until the price rises to A\$199$/)
  const n = Number((await counter.textContent()).split(' ')[0])
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThanOrEqual(40)

  await page.screenshot({ path: 'shots/after/offer.png', fullPage: true })
})

test('AUD purchase labels and confirmed support contact', async ({ page }) => {
  await skipOnboarding(page)
  await page.route(/\/rest\/v1\/|\/rpc\/|\/auth\/v1\//, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(HARDCODED_SESSIONS),
  }))
  await page.route('**/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))
  await page.route('**/api/verify-session?*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"status":"paid","type":"subscription","plan":"annual"}',
  }))
  await page.goto('/premium')
  await expect(page.locator('.card', { hasText: 'Annual, founding rate' })).toContainText('A$149')
  await expect(page.locator('.card', { hasText: 'Monthly' })).toContainText('A$19')
  await expect(page.getByRole('button', { name: 'Continue at A$149 a year' })).toBeVisible()
  await expect(page.getByTestId('library-counter')).toContainText('A$199')
  await page.screenshot({ path: 'shots/after/aud-premium.png', fullPage: true })

  await page.goto('/custom')
  await page.getByRole('button', { name: 'Start a custom session · A$99' }).click()
  await page.locator('input[type="email"]').fill('brief@example.test')
  await page.locator('textarea').first().fill('A long enough fixture description to pass validation.')
  await page.locator('input[type="text"]').fill('A fixture trigger.')
  await page.locator('textarea').nth(1).fill('A fixture desired state.')
  await page.getByRole('button', { name: 'Review Order' }).click()
  await expect(page.getByRole('button', { name: /^Pay A\$99/ })).toBeVisible()
  await page.screenshot({ path: 'shots/after/aud-custom.png', fullPage: true })

  await page.goto('/success?type=subscription&plan=annual&session_id=fixture')
  await expect(page.getByText('Questions? info@matthewtweediehypnosis.com.au')).toBeVisible()
  await expect(page.getByText(/normally A\$99/)).toBeVisible()
})
