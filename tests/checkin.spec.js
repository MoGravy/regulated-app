import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'
import { test, expect } from '@playwright/test'
import { skipOnboarding, noProductionWrites, storage } from './helpers.js'

test.use({ viewport: { width: 380, height: 820 } })

// Code handoff item 1. The Check-In matches a state to a session, keeps
// nothing, and never gets in the way of the library below it.
test('check-in surfaces a matched session and stores nothing', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  await page.route(/\/rest\/v1\/|\/rpc\/|\/auth\/v1\//, route => route.fulfill({ status: 200, json: HARDCODED_SESSIONS }))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /what does your system need/i })).toBeVisible()
  await expect(page.getByText('Where you are today')).toBeVisible()

  await page.getByRole('button', { name: 'Wired' }).click()
  await expect(page.getByText("For a system that won't switch off")).toBeVisible()
  await expect(page.getByRole('region', { name: 'Check-in' }).locator('.row', { hasText: HARDCODED_SESSIONS.find(row => row.id === 'a8e6ed56-e87c-4ef6-8b77-ee6ff25c4442').title })).toBeVisible()

  await page.getByRole('button', { name: 'Just checking in' }).click()
  await expect(page.getByText('Your daily reset')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Check-in' }).locator('.row', { hasText: HARDCODED_SESSIONS.find(row => row.id === '7a875d14-f77e-47e9-8ff3-16d5db08d2e6').title })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Check-in' }).locator('.row', { hasText: HARDCODED_SESSIONS.find(row => row.id === 'a8e6ed56-e87c-4ef6-8b77-ee6ff25c4442').title })).toHaveCount(0)

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
