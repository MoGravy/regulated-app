import { test, expect } from '@playwright/test'
import { skipOnboarding, signedIn, asPremium, fakeAudio, noProductionWrites } from './helpers.js'
import path from 'node:path'

// Screenshot set for the design polish pass. SHOT_TAG=before|after picks the
// folder, so the two runs sit side by side. Never asserts pixels: the point is
// a human comparing pairs, plus one hard check that reduced motion is static.
const DIR = process.env.SHOT_DIR || path.join('shots', process.env.SHOT_TAG || 'after')
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true })

// Candidate D, deep aubergine with dusty rose, from design/Regulated.dc.html 1c.
// Rose cannot carry a play glyph, so the glyph goes aubergine on rose here.
const ACCENT_D = `:root{--accent:#503A5C;--accent-hover:#3F2D49;--accent-soft:rgba(80,58,92,.06);
--accent-ring:rgba(80,58,92,.12);--accent-tint:rgba(80,58,92,.10);--control:#D9A6A0;--on-control:#2B1F33;
--player-bg:#2B1F33;--player-blob-a:#3A2B44;--player-blob-b:#33263D;--player-title:#F7EFEE;--player-body:#EFE5E4;
--player-muted:#BFB0C4;--player-faint:#A18FA8;--player-track:#3E3049}`
const accentD = page => page.addInitScript(css => {
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = css; document.head.append(s)
  })
}, ACCENT_D)

test.use({ viewport: { width: 380, height: 820 } })

async function openPlayer(page, seconds) {
  await fakeAudio(page, seconds)
  await page.goto('/sessions')
  await page.locator('.row:not(.row-locked)').first().click()
  await page.getByRole('button', { name: /start session/i }).click()
  await expect(page).toHaveURL(/\/play$/)
}

for (const [tag, prep] of [['B', async () => {}], ['D', accentD]]) {
  test.describe(`accent ${tag}`, () => {
    test('home, library, detail, pricing', async ({ page }) => {
      await skipOnboarding(page); await prep(page)
      await page.goto('/'); await page.waitForLoadState('networkidle'); await shot(page, `${tag}-home`)
      await page.goto('/sessions'); await page.waitForLoadState('networkidle'); await shot(page, `${tag}-library`)
      await page.locator('.row:not(.row-locked)').first().click()
      await expect(page.getByRole('button', { name: /start session/i })).toBeVisible()
      await shot(page, `${tag}-detail`)
      await page.goto('/premium'); await page.waitForLoadState('networkidle'); await shot(page, `${tag}-pricing`)
    })

    test('player playing, then the completion moment', async ({ page }) => {
      await skipOnboarding(page); await noProductionWrites(page); await prep(page)
      // A four second clip: long enough to catch playing, short enough to end.
      await openPlayer(page, 4)
      await shot(page, `${tag}-player-premood`)
      await page.getByRole('button', { name: 'Skip' }).click()
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
      await page.waitForTimeout(600)
      await shot(page, `${tag}-player-playing`)
      await expect(page.getByRole('heading', { name: /of your practice/ })).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(700)
      await shot(page, `${tag}-player-ended`)
      await expect(page.getByRole('heading', { name: 'How does your system feel now?' })).toBeVisible({ timeout: 10_000 })
      await shot(page, `${tag}-player-checkout`)
    })
  })
}

test('premium library and a signed-in You tab', async ({ page }) => {
  await asPremium(page)
  await page.goto('/sessions'); await page.waitForLoadState('networkidle'); await shot(page, 'B-library-premium')
  await page.goto('/premium'); await page.waitForLoadState('networkidle'); await shot(page, 'B-you-premium')
})

test('empty filter and audio failure', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/sessions?category=Nothing'); await page.waitForLoadState('networkidle'); await shot(page, 'B-library-empty')
  await page.route('**/api/get-audio-url', r => r.fulfill({ status: 500, body: '{}' }))
  await page.goto('/sessions')
  await page.locator('.row:not(.row-locked)').first().click()
  await page.getByRole('button', { name: /start session/i }).click()
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'B-player-audio-failed')
})

test('reduced motion is static everywhere', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await skipOnboarding(page)
  await page.goto('/'); await page.waitForLoadState('networkidle')
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter(el => getComputedStyle(el).animationName !== 'none').length)
  expect(animated).toBe(0)
  await shot(page, 'B-home-reduced-motion')
})
