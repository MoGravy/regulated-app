import { test, expect } from '@playwright/test'
import { skipOnboarding, watchConsole, expectNoConsoleErrors, HAS_API } from './helpers.js'

const SCREENS = [
  ['home', '/'],
  ['library', '/sessions'],
  ['paywall', '/premium'],
  ['custom-audio', '/custom'],
  ['onboarding', '/welcome'],
  ['success', '/success'],
]

test.describe('every screen renders clean at 390x844', () => {
  for (const [name, path] of SCREENS) {
    test(`${name} — no console errors, screenshot`, async ({ page }, testInfo) => {
      await skipOnboarding(page)
      const errors = watchConsole(page)

      await page.goto(path)
      await page.waitForLoadState('networkidle')

      // Something must actually be on the page.
      await expect(page.locator('body')).not.toBeEmpty()

      await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
      })
      await testInfo.attach(name, { path: testInfo.outputPath(`${name}.png`), contentType: 'image/png' })

      await expectNoConsoleErrors(errors)
    })
  }
})

test('session detail and player render', async ({ page }, testInfo) => {
  await skipOnboarding(page)
  const errors = watchConsole(page)

  await page.goto('/sessions')
  await page.waitForLoadState('networkidle')

  // First unlocked row.
  const firstRow = page.locator('.row').first()
  await expect(firstRow).toBeVisible()
  await firstRow.click()

  await expect(page).toHaveURL(/\/sessions\/[^/]+$/)
  await expect(page.getByRole('button', { name: /start session/i })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('session-detail.png'), fullPage: true })
  await testInfo.attach('session-detail', { path: testInfo.outputPath('session-detail.png'), contentType: 'image/png' })

  await page.getByRole('button', { name: /start session/i }).click()
  await expect(page).toHaveURL(/\/play$/)
  await page.screenshot({ path: testInfo.outputPath('player.png'), fullPage: true })
  await testInfo.attach('player', { path: testInfo.outputPath('player.png'), contentType: 'image/png' })

  await expectNoConsoleErrors(errors)
})

test('signed out: premium sessions show the locked state', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/sessions')
  await page.waitForLoadState('networkidle')

  const locked = page.locator('.row-locked')
  await expect(locked.first()).toBeVisible()

  // Locked rows are dimmed, not badged — the design is explicit about this.
  await expect(page.getByText('Premium', { exact: false }).first()).toBeVisible()

  // A locked row routes to the paywall, it never opens the player.
  await locked.first().click()
  await expect(page).toHaveURL(/\/premium$/)
})

test('paywall renders all three price points', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/premium')
  await page.waitForLoadState('networkidle')

  // Scope each price to its own card so the footer CTA does not double-match.
  const cards = page.locator('.card')
  await expect(cards.filter({ hasText: 'Annual, founding rate' })).toContainText('$149')
  await expect(cards.filter({ hasText: 'Monthly' })).toContainText('$19')
  await expect(cards.filter({ hasText: 'Custom audio' })).toContainText('$99')

  // The design rules these out explicitly.
  await expect(page.getByText('$199')).toHaveCount(0)
  await expect(page.getByText(/founding member/i)).toHaveCount(0)
})

test('program stays gated until the map is approved', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const programTab = page.getByRole('tab', { name: /program/i })
  await expect(programTab).toBeVisible()
  await expect(programTab).toBeDisabled()
  await expect(page.getByRole('tab', { name: /browse/i })).toHaveAttribute('aria-selected', 'true')
})

test('tab bar moves between the three tabs', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Browse', exact: true }).click()
  await expect(page).toHaveURL(/\/sessions$/)

  await page.getByRole('button', { name: 'You', exact: true }).click()
  await expect(page).toHaveURL(/\/premium$/)

  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})

// ---------------------------------------------------------------------------
// These need the serverless functions, so they only run against a deployment.
// ---------------------------------------------------------------------------
test.describe('needs /api', () => {
  test.skip(!HAS_API, 'set BASE_URL to a deployment — vite preview does not serve /api')

  test('a free session gets a signed URL and the audio reaches canplay', async ({ page }) => {
    await skipOnboarding(page)

    const audioResponses = []
    page.on('response', r => {
      if (r.url().includes('/api/get-audio-url')) audioResponses.push(r.status())
    })

    await page.goto('/sessions')
    await page.waitForLoadState('networkidle')
    await page.locator('.row').first().click()
    await page.getByRole('button', { name: /start session/i }).click()
    await expect(page).toHaveURL(/\/play$/)

    // Past the mood question.
    await page.getByRole('button', { name: /^skip$/i }).click()

    await expect.poll(() => audioResponses, { timeout: 20_000 }).toContain(200)

    const canplay = await page.evaluate(() => new Promise(resolve => {
      const el = document.querySelector('audio')
      if (!el) return resolve('no audio element')
      if (el.readyState >= 3) return resolve('canplay')
      el.addEventListener('canplay', () => resolve('canplay'), { once: true })
      el.addEventListener('error', () => resolve('error'), { once: true })
      setTimeout(() => resolve(`timeout readyState=${el.readyState}`), 25_000)
    }))
    expect(canplay).toBe('canplay')
  })

  test('checkout redirects to Stripe — never completes a payment', async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/premium')
    await page.waitForLoadState('networkidle')

    await page.locator('#premium-email').fill('playwright-checkout-probe@example.com')

    // Abort at the redirect. Nothing is ever submitted on Stripe's side.
    let stripeUrl = null
    await page.route('**://checkout.stripe.com/**', route => {
      stripeUrl = route.request().url()
      route.abort()
    })

    await page.getByRole('button', { name: /continue at \$149/i }).click()
    await expect.poll(() => stripeUrl, { timeout: 20_000 }).toContain('checkout.stripe.com')
  })
})
