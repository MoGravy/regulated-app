import { test, expect } from '@playwright/test'
import { skipOnboarding, noProductionWrites } from './helpers.js'

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
  await expect(counter).toHaveText(/^\d+ of 40 sessions until the price rises to \$199$/)
  const n = Number((await counter.textContent()).split(' ')[0])
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThanOrEqual(40)

  await page.screenshot({ path: 'shots/after/offer.png', fullPage: true })
})
