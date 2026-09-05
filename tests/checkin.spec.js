import { test, expect } from '@playwright/test'
import { skipOnboarding, noProductionWrites, storage } from './helpers.js'

test.use({ viewport: { width: 380, height: 820 } })

// Code handoff item 1. The Check-In matches a state to a session, keeps
// nothing, and never gets in the way of the library below it.
test('check-in surfaces a matched session and stores nothing', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /what does your system need/i })).toBeVisible()
  await expect(page.getByText('Where you are today')).toBeVisible()

  await page.getByRole('button', { name: 'Wired' }).click()
  await expect(page.getByText("For a system that won't switch off")).toBeVisible()
  await expect(page.locator('.row', { hasText: 'Stress Off Switch' })).toBeVisible()

  await page.getByRole('button', { name: 'Just checking in' }).click()
  await expect(page.getByText('Your daily reset')).toBeVisible()
  await expect(page.locator('.row', { hasText: 'Daily Nervous System Reset' })).toBeVisible()
  await expect(page.locator('.row', { hasText: 'Stress Off Switch' })).toHaveCount(0)

  // Tapping the pressed pill clears it; the library was there the whole time.
  await page.getByRole('button', { name: 'Just checking in' }).click()
  await expect(page.getByText('Your daily reset')).toHaveCount(0)
  await expect(page.getByText('Where you are today')).toBeVisible()

  // Compliance: no state kept against the person.
  const keys = Object.keys(await storage(page)).join(' ')
  expect(keys).not.toMatch(/check|state|mood/i)

  await page.getByRole('button', { name: 'Tense' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'shots/after/checkin.png', fullPage: true })
})
