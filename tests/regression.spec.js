// Phase 6a-1. Everything here answers one question: does the redesign break a
// customer who is already using production? It runs against the built bundle,
// not the dev server, and no test in this file may write to the database —
// noProductionWrites() fulfils every non-GET to Supabase locally.
import { test, expect } from '@playwright/test'
import {
  skipOnboarding, enterProgram, watchConsole, expectNoConsoleErrors,
  noProductionWrites, asPremium, fakeAudio, storage, signedIn, FAKE_JWT,
} from './helpers.js'

// Exactly what live production writes today. Nothing else exists for a
// returning customer, so this is the real upgrade state.
const PROD_STATE = {
  regulated_onboarding: 'true',
  regulated_email: '"returning@example.com"',
  regulated_completed: '["7a875d14-f77e-47e9-8ff3-16d5db08d2e6","a8e6ed56-e87c-4ef6-8b77-ee6ff25c4442"]',
}

const FREE_ID = '7a875d14-f77e-47e9-8ff3-16d5db08d2e6'

const ROUTES = ['/', '/sessions', '/premium', '/custom', '/program', '/signin', '/welcome', '/success']

// ---------------------------------------------------------------------------
// The returning customer. This is the regression that would cost real money.
// ---------------------------------------------------------------------------
test.describe('a customer arriving from the current production build', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(state => {
      for (const [k, v] of Object.entries(state)) localStorage.setItem(k, v)
    }, PROD_STATE)
    // localhost has no /api routes; a 404 here would read as a console error.
    await page.route(/\/api\/check-subscription/, route => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"active":false}',
    }))
  })

  test('is not thrown back into onboarding', async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
    await expect(page.getByText('Feel safe in your own body')).toHaveCount(0)
    await expectNoConsoleErrors(errors)
  })

  test('keeps every key production wrote, byte for byte', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.goto('/sessions')
    await page.waitForLoadState('networkidle')

    const after = await storage(page)
    for (const [k, v] of Object.entries(PROD_STATE)) {
      expect(after[k], `${k} was altered by the redesign`).toBe(v)
    }
  })

  test('still sees its finished sessions marked Done', async ({ page }) => {
    await page.goto('/sessions')
    await page.waitForLoadState('networkidle')

    // Stress Off Switch, the only free id whose title agrees between the live
    // sessions table and src/lib/hardcodedSessions.js. The other three free
    // ids are attached to the wrong titles in that fallback — pre-existing on
    // main, not introduced here, and only visible if Supabase is unreachable.
    const done = page.locator('.row', { hasText: 'Stress Off Switch' })
    await expect(done).toContainText('Done')
  })

  test('lands in Browse, never in the unapproved program', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('tab', { name: /browse/i })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(/^Today · Week/)).toHaveCount(0)
    await expect(page.getByText('Where you are today')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Nothing may demand a login, and nothing may write to production.
// ---------------------------------------------------------------------------
test('every route renders signed out, with no redirect and no write', async ({ page }) => {
  const writes = await noProductionWrites(page)
  const errors = watchConsole(page)
  await skipOnboarding(page)

  for (const path of ROUTES) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(page.url(), `${path} redirected`).toContain(path)
    await expect(page.locator('body')).not.toBeEmpty()
  }

  expect(writes, 'a signed-out walk wrote to the database').toEqual([])
  await expectNoConsoleErrors(errors)
})

test('an unknown path lands on Home rather than a blank page', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/no-such-page')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
})

test('a deep link to a session that does not exist says so', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/sessions/00000000-0000-0000-0000-000000000000/play')
  await expect(page.getByText('Session not found')).toBeVisible({ timeout: 20_000 })
})

// Reloading on a deep route is the classic SPA break — the rewrite in
// vercel.json is what makes it work, so it gets asserted rather than assumed.
test('reload and back/forward survive on every route', async ({ page }) => {
  await skipOnboarding(page)

  for (const path of ROUTES) {
    await page.goto(path)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body'), `${path} broke on reload`).not.toBeEmpty()
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'Browse', exact: true }).click()
  await expect(page).toHaveURL(/\/sessions$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await page.goForward()
  await expect(page).toHaveURL(/\/sessions$/)
})

// ---------------------------------------------------------------------------
// Library and paywall in both subscription states.
// ---------------------------------------------------------------------------
test('a premium customer sees no locked rows and no paywall', async ({ page }) => {
  await asPremium(page)
  const errors = watchConsole(page)

  await page.goto('/sessions')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.row').first()).toBeVisible()
  await expect(page.locator('.row-locked')).toHaveCount(0)

  await page.goto('/premium')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'You have premium' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue at \$/ })).toHaveCount(0)
  await expectNoConsoleErrors(errors)
})

test('category chips filter, and the filter survives a deep link', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/sessions')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Sleep', exact: true }).click()
  await expect(page).toHaveURL(/category=Sleep/)
  const filtered = await page.locator('.row').count()
  const all = await page.getByRole('button', { name: /^All \d+$/ }).textContent()
  expect(filtered).toBeLessThan(Number(all.replace(/\D/g, '')))

  await page.goto('/sessions?category=Sleep')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Sleep', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('the paywall refuses a bad email before it opens checkout', async ({ page }) => {
  await skipOnboarding(page)
  let checkout = false
  await page.route('**/api/create-checkout', route => { checkout = true; route.abort() })

  await page.goto('/premium')
  await page.waitForLoadState('networkidle')
  await page.locator('#premium-email').fill('nope')
  await page.getByRole('button', { name: /Continue at \$/ }).click()

  await expect(page.getByRole('alert')).toContainText('Enter the email')
  expect(checkout, 'a malformed address reached create-checkout').toBe(false)
})

test('restore reports honestly when there is no subscription', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route(/\/api\/check-subscription/, route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))

  await page.goto('/premium')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Restore a purchase' }).click()

  await expect(page.getByText('No active subscription on that email.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'You have premium' })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// The custom audio brief. Validated and reviewed, never submitted — a real
// submission would create a live Stripe checkout.
// ---------------------------------------------------------------------------
test('the custom brief validates every required field and never posts', async ({ page }) => {
  await skipOnboarding(page)
  let checkout = false
  await page.route('**/api/create-checkout', route => { checkout = true; route.abort() })

  await page.goto('/custom')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /Start a custom session/ }).click()

  await page.getByRole('button', { name: 'Review Order' }).click()
  await expect(page.getByText('Valid email required for delivery')).toBeVisible()
  await expect(page.getByText(/Please describe your pattern/)).toBeVisible()

  await page.locator('input[type="email"]').fill('brief@example.com')
  await page.locator('textarea').first().fill('A long enough description of the pattern to pass the check.')
  await page.locator('input[type="text"]').fill('When my phone buzzes after hours.')
  await page.locator('textarea').nth(1).fill('Calm and grounded.')
  await page.getByRole('button', { name: 'Review Order' }).click()

  await expect(page.getByText('Order Summary')).toBeVisible()
  await expect(page.getByText('brief@example.com')).toBeVisible()
  expect(checkout, 'the brief reached create-checkout without a payment decision').toBe(false)
})

// ---------------------------------------------------------------------------
// The full listen, end to end, on fake audio. This is the only test that
// exercises markSessionComplete, which is what moves program progress.
// ---------------------------------------------------------------------------
test('a session played to the end is marked complete and leaves Continue listening', async ({ page }) => {
  const writes = await noProductionWrites(page)
  await fakeAudio(page)
  await skipOnboarding(page)

  await page.goto(`/sessions/${FREE_ID}/play`)
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 20_000 })

  // The silent WAV is half a second, so the end arrives on its own.
  await expect(page.getByRole('heading', { name: 'How does your system feel now?' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Calmer' }).click()
  await expect(page.getByRole('heading', { name: 'That is done.' })).toBeVisible()

  const after = await storage(page)
  expect(JSON.parse(after.regulated_completed)).toContain(FREE_ID)
  expect(JSON.parse(after.regulated_progress || '{}')).not.toHaveProperty(FREE_ID)

  // The completion insert is real code on a real path; it must have been the
  // only write attempted, and the stub is what stopped it reaching production.
  expect(writes.join(',')).toContain('session_completions')
})

test('a part-played session shows up in Continue listening', async ({ page }) => {
  await noProductionWrites(page)
  await fakeAudio(page, 60)
  await skipOnboarding(page)

  await page.goto(`/sessions/${FREE_ID}/play`)
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })

  // The player's clock is its own, not the audio element's, so the position has
  // to be moved through the control the user would actually press. Wait for the
  // real duration first, or the 15 seconds lands under the resume threshold.
  await page.waitForFunction(() => {
    const a = document.querySelector('audio')
    return a && Number.isFinite(a.duration) && a.duration > 50
  }, null, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Forward 15 seconds' }).click()
  await page.getByRole('button', { name: 'Close player' }).click()
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('Continue listening')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Resume / })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Layout. The seven day circles already overflowed once at 390px.
// ---------------------------------------------------------------------------
const SIZES = [
  ['small phone', 360, 740],
  ['design phone', 390, 844],
  ['large phone', 430, 932],
  ['tablet', 768, 1024],
  ['desktop', 1280, 800],
]

for (const [name, width, height] of SIZES) {
  test(`nothing overflows sideways at ${name} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await enterProgram(page, 9)

    for (const path of ['/', '/sessions', '/premium', '/custom', '/program']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => {
        const d = document.documentElement
        return d.scrollWidth - d.clientWidth
      })
      expect(overflow, `${path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(1)
    }
  })
}

test('the day circles stay tappable at the narrowest phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await enterProgram(page, 9)
  await page.goto('/program')
  await page.waitForLoadState('networkidle')

  const box = await page.getByRole('button', { name: 'Week 2, day 3, today' }).boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(40)
  expect(box.width).toBeGreaterThanOrEqual(28)
})

// ---------------------------------------------------------------------------
// Program progression, the part that only moves through a real completion.
// ---------------------------------------------------------------------------
test('finishing the day the program is waiting on advances it by exactly one', async ({ page }) => {
  await noProductionWrites(page)
  await fakeAudio(page)
  await enterProgram(page, 0)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Today · Week 1, day 1')).toBeVisible()

  await page.getByRole('button', { name: /Start today's session/ }).click()
  await page.getByRole('button', { name: 'Start session' }).click()
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'How does your system feel now?' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Calmer' }).click()
  await expect(page.getByRole('heading', { name: 'That is done.' })).toBeVisible()

  expect(JSON.parse((await storage(page)).regulated_program_day)).toBe(1)
})

test('listening ahead in Browse does not skip a program day', async ({ page }) => {
  await noProductionWrites(page)
  await fakeAudio(page)
  await enterProgram(page, 0)

  // Gut Brain Reset. Day one of the program is Deep Sleep Reset, so this is a
  // session the program is not waiting on.
  const AHEAD = 'ca65ecd1-8ade-4a6e-915e-84810f8b26cb'
  await page.goto(`/sessions/${AHEAD}/play`)
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'How does your system feel now?' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Calmer' }).click()
  await expect(page.getByRole('heading', { name: 'That is done.' })).toBeVisible()

  const after = await storage(page)
  expect(JSON.parse(after.regulated_completed)).toContain(AHEAD)
  expect(JSON.parse(after.regulated_program_day), 'browsing ahead moved the program').toBe(0)
})

// ---------------------------------------------------------------------------
// Onboarding, the one screen a brand new visitor sees.
// ---------------------------------------------------------------------------
test('a brand new visitor is taken through onboarding and out the other side', async ({ page }) => {
  const errors = watchConsole(page)
  await page.route(/\/api\/check-subscription/, route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)

  await page.locator('#onboard-email').fill('nope')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter an email')

  await page.locator('#onboard-email').fill('new@example.com')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Sleep', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Go to the library' }).click()

  await expect(page).toHaveURL(/\/$/)
  const after = await storage(page)
  expect(after.regulated_onboarding).toBe('true')
  expect(JSON.parse(after.regulated_email)).toBe('new@example.com')

  // Second visit goes straight in.
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/$/)
  await expectNoConsoleErrors(errors)
})

// ---------------------------------------------------------------------------
// Session-keyed premium. Signed in, the account is the identity: the token
// goes with every premium check and a typed email cannot override it. Signed
// out, a typed email unlocks nothing: restore only sends a sign-in link.
// ---------------------------------------------------------------------------
test('signed in, premium checks carry the session and ignore the typed email', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  await signedIn(page)

  const checks = []
  await page.route(/\/api\/check-subscription/, route => {
    checks.push({ auth: route.request().headers().authorization, body: route.request().postDataJSON() })
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"active":true}' })
  })
  let otp = false
  await page.route(/\/auth\/v1\/otp/, route => { otp = true; route.fulfill({ status: 200, body: '{}' }) })

  await page.goto('/premium')
  await expect(page.getByRole('heading', { name: 'You have premium' })).toBeVisible()
  expect(checks.length).toBeGreaterThan(0)
  for (const c of checks) {
    expect(c.auth).toBe(`Bearer ${FAKE_JWT}`)
    expect(c.body.email).toBe('account@example.com')
  }
  expect(otp, 'a signed-in restore must not send a sign-in link').toBe(false)
})

test('signed out, restore sends a sign-in link and unlocks nothing', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  // Even a server that says yes must not unlock: the client never asks.
  let checked = false
  await page.route(/\/api\/check-subscription/, route => {
    checked = true
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"active":true}' })
  })
  const otp = []
  await page.route(/\/auth\/v1\/otp/, route => {
    otp.push(route.request().postDataJSON()?.email)
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/premium')
  await page.waitForLoadState('networkidle')
  await page.locator('#premium-email').fill('buyer@example.com')
  await page.getByRole('button', { name: 'Restore a purchase' }).click()

  await expect(page.getByText(/Check your email for a sign-in link/)).toBeVisible()
  expect(otp).toEqual(['buyer@example.com'])
  expect(checked, 'a signed-out restore must not call check-subscription').toBe(false)
  await expect(page.getByRole('heading', { name: 'You have premium' })).toHaveCount(0)
})

test('closing the player goes back, and back from there leaves the session', async ({ page }) => {
  await skipOnboarding(page)
  await fakeAudio(page, 30)
  await page.goto('/')
  await page.goto('/sessions')
  await page.locator('.row:not(.row-locked)').first().click()
  await expect(page).toHaveURL(/\/sessions\/[^/]+$/)
  await page.getByRole('button', { name: /start session/i }).click()
  await expect(page).toHaveURL(/\/play$/)
  await page.getByRole('button', { name: 'Close player' }).click()
  await expect(page).toHaveURL(/\/sessions\/[^/]+$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/sessions$/)
})

test('a reloaded session page still has a way out, and the wordmark goes home', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/sessions')
  const href = await page.locator('.row:not(.row-locked)').first().click().then(() => page.url())
  await page.goto(href)   // fresh load, no history behind it
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/sessions$/)
  await page.goto(href)
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
})
