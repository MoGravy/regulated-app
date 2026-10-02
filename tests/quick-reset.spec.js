import { test, expect } from '@playwright/test'

import { reset, setup } from './reset-fixture'

for (const look of ['classic', 'night']) {
  test(`Quick Reset stays paused until Play and fits the ${look} phone layout`, async ({ page }) => {
    await setup(page)
    await page.goto(`/?look=${look}`)
    await page.getByRole('button', { name: 'Open session', exact: true }).click()
    await expect(page).toHaveURL(/\/reset/)
    await expect(page.getByRole('heading', { name: reset.title })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    expect(await page.locator('audio').evaluate(a => a.paused)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const choice = await page.getByLabel('Choose your reset').boundingBox()
    const play = await page.getByRole('button', { name: 'Play', exact: true }).boundingBox()
    expect(choice.y + choice.height).toBeLessThan(play.y)
    expect(play.y + play.height).toBeLessThan(844)
    if (look === 'night') expect(await page.locator('.player-glow').evaluate(el => getComputedStyle(el).display)).toBe('none')
    await page.screenshot({ path: `/tmp/reset-${look}.png` })
    await expect(page.getByRole('slider', { name: 'Session progress' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('slider', { name: 'Session progress' }).press('End')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('regulated_practice_preview_v1:guest')).events.length)).toBe(0)
  })
}

test('failed free media recovers to another free track and never requests premium', async ({ page }) => {
  await setup(page)
  const other = { ...reset, id: 'other-free', title: 'Other free reset' }
  await page.route('**/rest/v1/sessions?*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([reset, other, { ...reset, id: 'paid', free: false }]) }))
  const seen = []
  await page.route('**/api/get-audio-url', r => {
    const id = r.request().postDataJSON().sessionId
    seen.push(id)
    return r.fulfill({ status: id === reset.id ? 403 : 200, contentType: 'application/json', body: JSON.stringify(id === reset.id ? {} : { url: '/fake-audio.wav' }) })
  })
  await page.goto('/reset')
  await expect(page.getByRole('heading', { name: other.title })).toBeVisible()
  expect(seen).toEqual([reset.id, other.id])
})

test('real audio playback earns one unique local day and survives reload', async ({ page }) => {
  test.setTimeout(90000)
  await setup(page)
  await page.goto('/reset')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.locator('audio').evaluate(a => { a.playbackRate = 4 })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('A practice day was recorded on this device.', { timeout: 35000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const event = await page.evaluate(() => JSON.parse(localStorage.getItem('regulated_practice_preview_v1:guest')).events[0])
  expect(event.heardSeconds).toBeGreaterThanOrEqual(80)
  expect(event.durationSeconds).toBe(100)
  expect(event.source).toBe('web-played')
  await page.goto('/')
  await expect(page.locator('.practice-stats dd')).toHaveText(['1', '1', '1'])
  await page.reload()
  await expect(page.locator('.practice-stats dd')).toHaveText(['1', '1', '1'])
})

test('broken decoded audio automatically recovers to another free session', async ({ page }) => {
  await setup(page)
  const other = { ...reset, id: 'decoded-fallback', title: 'Working free reset' }
  await page.route('**/rest/v1/sessions?*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([reset, other]) }))
  await page.route('**/bad-audio.wav', r => r.fulfill({ contentType: 'audio/wav', body: 'this is not audio' }))
  await page.route('**/api/get-audio-url', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: r.request().postDataJSON().sessionId === reset.id ? '/bad-audio.wav' : '/fake-audio.wav' }) }))
  await page.goto('/reset')
  await expect(page.getByRole('heading', { name: other.title })).toBeVisible()
  expect(await page.locator('audio').evaluate(a => a.paused)).toBe(true)
})

for (const look of ['classic', 'night']) {
  test(`retained legacy days and milestones are readable in the ${look} look`, async ({ page }) => {
    await setup(page)
    const dates = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']
    await page.addInitScript(days => localStorage.setItem('regulated_practice_days', JSON.stringify(days)), dates)
    await page.goto(`/?look=${look}`)
    await expect(page.locator('.practice-stats dd')).toHaveText(['7', '0', '7'])
    await page.getByText('Milestones', { exact: true }).click()
    await expect(page.locator('.practice-milestones li').first()).toHaveText('7 daysEarned')
    await expect(page.getByText(/Those dates used a 4am day boundary/)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.practice-summary').screenshot({ path: `/tmp/practice-${look}.png` })
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('regulated_practice_days')))).toEqual(dates)
  })
}

test('changing verified account and signing out keeps each local history separate', async ({ page }) => {
  await setup(page)
  const authKey = 'sb-local-preview-auth-token'
  const session = id => ({ access_token: 'synthetic-test-only', refresh_token: 'synthetic-test-only', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email: `${id}@example.invalid`, aud: 'authenticated' } })
  await page.addInitScript(({ authKey, session }) => {
    localStorage.setItem(authKey, JSON.stringify(session))
    localStorage.setItem('regulated_practice_days', '["2026-09-30"]')
    localStorage.setItem('regulated_practice_preview_v1:user-a', JSON.stringify({ schemaVersion: 1, events: [], legacyDays: ['2026-09-24', '2026-09-25'], legacyImported: true, legacyRolloverHours: 4, best: 2, awards: [], attempts: {} }))
  }, { authKey, session: session('user-a') })
  await page.goto('/')
  await expect(page.locator('.practice-stats dd').first()).toHaveText('2')
  await page.evaluate(({ authKey, session }) => {
    localStorage.setItem(authKey, JSON.stringify(session))
    const channel = new BroadcastChannel(authKey)
    channel.postMessage({ event: 'SIGNED_IN', session })
    channel.close()
  }, { authKey, session: session('user-b') })
  await expect(page.locator('.practice-stats dd').first()).toHaveText('0')
  await page.evaluate(authKey => {
    localStorage.removeItem(authKey)
    const channel = new BroadcastChannel(authKey)
    channel.postMessage({ event: 'SIGNED_OUT', session: null })
    channel.close()
  }, authKey)
  await expect(page.locator('.practice-stats dd').first()).toHaveText('1')
})

test('storage access refusal leaves the reset player usable', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('storage blocked', 'SecurityError') } }))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/reset')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  // External services are deliberately blocked by this local fixture.
  expect(errors.filter(message => !/^(Error: )?Failed to load Stripe\.js$/.test(message))).toEqual([])
})

test('closing after a long pause cannot renew expired listening credit', async ({ page }) => {
  await setup(page)
  await page.goto('/reset')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('regulated_practice_preview_v1:guest')).attempts['7a875d14-f77e-47e9-8ff3-16d5db08d2e6']?.heardSeconds || 0)).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('regulated_practice_preview_v1:guest')).attempts['7a875d14-f77e-47e9-8ff3-16d5db08d2e6'])
  await page.clock.setSystemTime(before.updatedAt + 660000)
  await page.getByRole('button', { name: 'Close player' }).click()
  await page.goto('/reset')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('regulated_practice_preview_v1:guest')).attempts['7a875d14-f77e-47e9-8ff3-16d5db08d2e6'])
  expect(after.attemptId).not.toBe(before.attemptId)
  expect(after.heardSeconds).toBeLessThan(before.heardSeconds)
})

test('no verified free audio offers recovery without a paywall or fallback metadata', async ({ page }) => {
  await setup(page)
  await page.route('**/rest/v1/sessions?*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }))
  await page.goto('/reset')
  await expect(page.getByRole('button', { name: 'Browse free sessions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})
