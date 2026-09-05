import { test, expect } from '@playwright/test'
import { skipOnboarding, noProductionWrites, HAS_API } from './helpers.js'

test.use({ viewport: { width: 380, height: 820 } })

// Code handoff item 6. A check-in tap sends one anonymous event and nothing
// else; the route itself refuses names the app does not define.
test('a check-in tap posts one anonymous event', async ({ page }) => {
  await skipOnboarding(page)
  await noProductionWrites(page)
  const calls = []
  await page.route('**/api/track', route => {
    calls.push(route.request().postDataJSON())
    route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Wired' }).click()
  await expect.poll(() => calls.length).toBe(1)
  expect(calls[0]).toEqual({ name: 'checkin_tap', props: { state: 'wired' } })
  expect(JSON.stringify(calls[0])).not.toMatch(/@/)
})

test('deployed: track refuses an unknown event name', async ({ page }) => {
  test.skip(!HAS_API, 'needs a deployed API')
  const r = await page.request.post('/api/track', { data: { name: 'not_a_thing', props: {} } })
  expect(r.status()).toBe(400)
})
