import { test, expect } from './fixtures.js'
import { skipOnboarding, noProductionWrites, fakeAudio } from './helpers.js'

const sessionId = '7a875d14-f77e-47e9-8ff3-16d5db08d2e6'

for (const look of ['admiralty', 'night']) {
  for (const screen of ['detail', 'player']) {
    test(`${look} ${screen} falls back when the catalogue never replies`, async ({ page }, testInfo) => {
      await skipOnboarding(page)
      const writes = await noProductionWrites(page)
      await fakeAudio(page)
      let requested = false
      await page.route('**/rest/v1/sessions*', () => { requested = true })
      const path = `/sessions/${sessionId}${screen === 'player' ? '/play' : ''}`
      await page.goto(`${path}?look=${look}`)
      await expect.poll(() => requested).toBe(true)
      if (screen === 'detail') {
        await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeVisible({ timeout: 12_000 })
      } else {
        await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible({ timeout: 12_000 })
      }
      expect(writes).toEqual([])
      await expect(page.locator('.screen')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: testInfo.outputPath('loaded.png') })
    })
  }

  test(`${look} library finishes a stalled read and retries without caching the fallback`, async ({ page }, testInfo) => {
    await skipOnboarding(page)
    const writes = await noProductionWrites(page)
    let requested = false
    await page.route('**/rest/v1/sessions*', () => { requested = true })
    await page.goto(`/sessions?category=missing&look=${look}`)
    await expect.poll(() => requested).toBe(true)
    await expect(page.getByText('Nothing here yet', { exact: true })).toBeVisible({ timeout: 12_000 })
    await page.unroute('**/rest/v1/sessions*')
    await page.route('**/rest/v1/sessions*', route => route.fulfill({ json: [{
      id: sessionId, category: 'Daily', duration: 11, free: true, has_audio: true,
    }] }))
    await page.getByRole('button', { name: 'You', exact: true }).click()
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByRole('button', { name: 'All 1', exact: true })).toBeVisible()
    expect(writes).toEqual([])
    await expect(page.locator('.screen')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('recovered.png') })
  })
}
