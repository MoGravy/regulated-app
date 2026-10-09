import { mkdir } from 'node:fs/promises'
import { test, expect } from './fixtures.js'
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'
import { fakeAudio, skipOnboarding, noProductionWrites } from './helpers.js'

const id = HARDCODED_SESSIONS.find(s => s.free && s.has_audio !== false).id
const views = [['welcome', '/welcome'], ['today', '/'], ['browse', '/sessions'], ['detail', `/sessions/${id}`], ['player', `/sessions/${id}/play`], ['premium', '/premium']]
for (const [width, height, look] of [[390, 844, 'admiralty'], [375, 667, 'admiralty'], [390, 844, 'night']]) {
  test(`native integration appearance ${look} at ${width}x${height}`, async ({ page }) => {
    const writes = await noProductionWrites(page)
    await skipOnboarding(page)
    await fakeAudio(page, 100)
    await page.setViewportSize({ width, height })
    await mkdir('../evidence/native-integration/web', { recursive: true })
    for (const [name, route] of views) {
      await page.goto(`${route}?look=${look}`)
      if (name === 'player') {
        await page.getByRole('button', { name: 'Skip', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Pause', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
      }
      await expect(page.locator('html')).toHaveAttribute('data-look', look)
      await expect(page.locator('h1').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (name === 'premium') await expect(page.getByRole('button', { name: /Continue at A\$/ })).toBeVisible()
      await page.screenshot({ path: `../evidence/native-integration/web/${look}-${width}x${height}-${name}.png` })
    }
    expect(writes).toEqual([])
  })
}
