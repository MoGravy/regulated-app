import { test, expect } from '@playwright/test'
import { skipOnboarding, enterProgram, watchConsole, expectNoConsoleErrors, noProductionWrites, HAS_API } from './helpers.js'

const SCREENS = [
  ['home', '/'],
  ['library', '/sessions'],
  ['paywall', '/premium'],
  ['custom-audio', '/custom'],
  ['onboarding', '/welcome'],
  ['success', '/success'],
  ['signin', '/signin'],
  ['program', '/program'],
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

  // No struck-through price: the full price appears once, in the counter line.
  await expect(page.getByText('$199')).toHaveCount(1)
  await expect(page.getByTestId('library-counter')).toContainText('$199')
  await expect(page.locator('s, del')).toHaveCount(0)
  await expect(page.getByText(/founding member/i)).toHaveCount(0)
})

test('program stays gated until the map is approved', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const programTab = page.getByRole('tab', { name: /program/i })
  await expect(programTab).toBeVisible()
  await expect(programTab).toBeDisabled()
  await expect(programTab).toHaveText(/soon/)
  await expect(page.getByRole('tab', { name: /browse/i })).toHaveAttribute('aria-selected', 'true')

  // Typing the URL does not get past the gate either.
  await page.goto('/program')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Browse the library' })).toBeVisible()
  await expect(page.getByText('Week 1', { exact: false })).toHaveCount(0)
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

// Brief phase 3. Auth is additive: nothing that worked signed out may now ask
// for a login, and the design's magic link stays the primary path.
test('signed out: nothing requires a login', async ({ page }) => {
  await skipOnboarding(page)

  for (const path of ['/', '/sessions', '/premium', '/custom']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`))
    await expect(page.getByRole('button', { name: /^Sign in$/ })).toHaveCount(0)
  }

  // The paywall keeps its own email-and-restore flow, untouched by auth.
  await page.goto('/premium')
  await expect(page.getByRole('button', { name: 'Restore a purchase' })).toBeVisible()
  await expect(page.locator('#premium-email')).toBeVisible()
})

test('sign in offers the magic link first and a password behind it', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/signin')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible()
  await expect(page.locator('#signin-password')).toHaveCount(0)

  await page.getByRole('button', { name: 'Use a password instead' }).click()
  await expect(page.locator('#signin-password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Email me a link instead' }).click()
  await expect(page.locator('#signin-password')).toHaveCount(0)
})

// A bad address must never reach Supabase. Nothing here sends an email.
test('sign in rejects a malformed email before calling out', async ({ page }) => {
  await skipOnboarding(page)
  let called = false
  await page.route('**/auth/v1/**', route => { called = true; route.abort() })

  await page.goto('/signin')
  await page.waitForLoadState('networkidle')
  await page.locator('#signin-email').fill('not-an-email')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()

  await expect(page.getByRole('alert')).toContainText('Enter an email')
  expect(called, 'a malformed address reached the auth endpoint').toBe(false)
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

  // The premium gates key on the session token when one is sent. A token that
  // does not verify is refused outright, never downgraded to the typed email.
  test('a bad session token is refused, not downgraded to the typed email', async ({ request }) => {
    const res = await request.post('/api/check-subscription', {
      headers: { Authorization: 'Bearer not-a-real-token' },
      data: { email: 'anyone@example.com' },
    })
    expect(res.status()).toBe(400)
  })

  test('checkout redirects to Stripe — never completes a payment', async ({ page }) => {
    // Subscribing upserts a users row before it calls out, and the server
    // creates a real live-mode Checkout Session. Against a real deployment both
    // land in production, so the Supabase write and the checkout call are both
    // stubbed. The handoff to Stripe is still proven, nothing reaches Stripe.
    await noProductionWrites(page)
    await page.route('**/api/create-checkout', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_playwright_stub' }),
    }))
    await skipOnboarding(page)
    await page.goto('/premium')
    await page.waitForLoadState('networkidle')

    await page.locator('#premium-email').fill('playwright-checkout-probe@example.com')

    // Abort at the redirect. Nothing is ever requested of Stripe at all.
    let stripeUrl = null
    await page.route('**://checkout.stripe.com/**', route => {
      stripeUrl = route.request().url()
      route.abort()
    })

    await page.getByRole('button', { name: /continue at \$149/i }).click()
    await expect.poll(() => stripeUrl, { timeout: 20_000 }).toContain('checkout.stripe.com')
  })
})


// Brief phase 4. Program mode is sequential, not calendar-scheduled.
test('today shows the next day, not a calendar day', async ({ page }, testInfo) => {
  const errors = watchConsole(page)
  await enterProgram(page, 9)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Nine days done means week 2 day 3 is next — no date arithmetic involved.
  await expect(page.getByText('Today · Week 2, day 3')).toBeVisible()
  await expect(page.getByRole('button', { name: /Start today's session/ })).toBeVisible()
  await expect(page.getByText('2 of 7 done')).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('program-today.png'), fullPage: true })
  await testInfo.attach('program-today', { path: testInfo.outputPath('program-today.png'), contentType: 'image/png' })

  await page.getByRole('button', { name: 'See all six weeks' }).click()
  await expect(page).toHaveURL(/\/program$/)
  await expectNoConsoleErrors(errors)
})

test('six weeks: done, today and locked are all distinct', async ({ page }, testInfo) => {
  const errors = watchConsole(page)
  await enterProgram(page, 9)
  await page.goto('/program')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('9 of 42 sessions complete')).toBeVisible()

  // Week 1 finished, week 2 sitting on day 3, week 3 flat, weeks 4 to 6 sunk.
  await expect(page.getByRole('button', { name: 'Week 1, day 7, done' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Week 2, day 3, today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Week 2, day 4, not yet' })).toBeDisabled()
  await expect(page.getByRole('img', { name: 'Locked' })).toHaveCount(3)

  // A locked week draws no days at all, so there is nothing to tap ahead.
  await expect(page.getByRole('button', { name: /^Week 5, day/ })).toHaveCount(0)

  await page.screenshot({ path: testInfo.outputPath('program-weeks.png'), fullPage: true })
  await testInfo.attach('program-weeks', { path: testInfo.outputPath('program-weeks.png'), contentType: 'image/png' })
  await expectNoConsoleErrors(errors)
})

test('finishing the program does not leave a dangling today', async ({ page }) => {
  await enterProgram(page, 42)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('Six weeks done')).toBeVisible()
  await expect(page.getByRole('button', { name: /Start today's session/ })).toHaveCount(0)
})
