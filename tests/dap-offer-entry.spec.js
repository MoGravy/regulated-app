import { test, expect } from './fixtures.js'
import { skipOnboarding, signedIn } from './helpers.js'

for (const look of ['admiralty', 'night']) {
  for (const width of [320, 390]) {
    test(`DAP offer opens account-bound purchase page: ${look} ${width}`, async ({ page }) => {
      await skipOnboarding(page)
      await page.setViewportSize({ width, height: 844 })
      let checkoutWrites = 0
      await page.route('**/api/create-checkout?product=dap', route => {
        if (route.request().method() !== 'GET') checkoutWrites++
        return route.fulfill({ json: { enabled: false } })
      })
      await page.goto(`/courses?look=${look}`)
      const offer = page.getByRole('link', { name: 'Dissolve Anxiety Program', exact: true })
      await expect(offer).toBeVisible()
      await expect(offer).toContainText('AUD 247, paid once.')
      await expect(offer).toHaveAttribute('href', '/dap')
      await offer.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Dissolve Anxiety Program' })).toBeVisible()
      await expect(page.getByText('AUD 247, paid once.')).toBeVisible()
      await expect(page.getByText('Sign in before buying so the course is added to your account.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Buy now' })).toHaveCount(0)
      expect(new URL(page.url()).pathname).toBe('/dap')
      expect(await page.locator('html').getAttribute('data-look')).toBe(look)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(checkoutWrites).toBe(0)
    })
  }
  test(`owned-course lookup never flashes a purchase offer: ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page)
    let release
    let observed
    const requested = new Promise(resolve => { observed = resolve })
    const held = new Promise(resolve => { release = resolve })
    await page.route('**/rest/v1/courses*', async route => {
      observed()
      await held
      await route.fulfill({ json: [{ id: '0a02caf8-5050-571c-9a70-e2bcda2253a3', title: 'Dissolve Anxiety Program' }] })
    })
    await page.goto(`/courses?look=${look}`)
    await requested
    await expect(page.getByRole('link', { name: 'Dissolve Anxiety Program', exact: true })).toHaveCount(0)
    release()
    await expect(page.getByRole('button', { name: 'Dissolve Anxiety Program', exact: true })).toBeVisible()
  })
  test(`granted DAP is shown as owned rather than offered again: ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page)
    await page.route('**/rest/v1/courses*', route => route.fulfill({ json: [{ id: '0a02caf8-5050-571c-9a70-e2bcda2253a3', title: 'Dissolve Anxiety Program' }] }))
    await page.goto(`/courses?look=${look}`)
    await expect(page.getByRole('button', { name: 'Dissolve Anxiety Program', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dissolve Anxiety Program', exact: true })).toHaveCount(0)
  })
  test(`native purchase restriction stays intact: ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await page.addInitScript(() => { window.androidBridge = {}; window.Capacitor = { isNativePlatform: () => true } })
    await page.goto(`/courses?look=${look}`)
    await expect(page.getByRole('link', { name: 'Dissolve Anxiety Program', exact: true })).toHaveCount(0)
    await page.goto(`/dap?look=${look}`)
    await expect(page).toHaveURL(/\/premium$/)
    await expect(page.getByRole('button', { name: 'Sign in to subscribe', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Buy now' })).toHaveCount(0)
  })
}
