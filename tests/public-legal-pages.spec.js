import { test, expect } from '@playwright/test'

// Public pages Google Play links to: they must load without sign-in, onboarding or the app.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { active: false } }))
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, route => route.fulfill({ json: [] }))
})

const native = page => page.addInitScript(() => {
  window.androidBridge = {}
  window.Capacitor = { PluginHeaders: [], nativePromise: async () => { throw new Error('Unexpected native fixture call') } }
})

for (const platform of ['web', 'android']) {
  for (const look of ['admiralty', 'night']) {
    test(`${platform} privacy policy is public and shows the approved text (${look})`, async ({ page }) => {
      if (platform === 'android') await native(page)
      await page.goto(`/privacy?look=${look}`)
      await expect(page).toHaveURL(/\/privacy/)
      await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
      await expect(page.getByText('Last updated: 31 October 2026')).toBeVisible()
      await expect(page.getByText('ABN: 65 154 479 213')).toBeVisible()
      await expect(page.getByText('Advanced Communication Techniques Pty Ltd').first()).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Deleting your account' })).toBeVisible()
      await expect(page.locator('.legal-table table')).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.getByText('[CONFIRM')).toHaveCount(0)
    })

    test(`${platform} deletion page is public, names the developer and keeps the request flow (${look})`, async ({ page }) => {
      if (platform === 'android') await native(page)
      await page.goto(`/delete-account?look=${look}`)
      await expect(page).toHaveURL(/\/delete-account/)
      await expect(page.getByRole('heading', { level: 1, name: 'Delete your Regulated account' })).toBeVisible()
      await expect(page.getByText('Advanced Communication Techniques Pty Ltd')).toBeVisible()
      await expect(page.getByText('We complete deletion requests within 30 days of receiving them.')).toBeVisible()
      await expect(page.getByText('open the You tab and tap Request account deletion')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Request account deletion' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/signin')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.getByText('[CONFIRM')).toHaveCount(0)
    })
  }
}
