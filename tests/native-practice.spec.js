import { test, expect } from './fixtures.js'
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'
import { reset } from './reset-fixture.js'
import { ui } from '../src/content/reviewedCopy.js'
import { skipOnboarding, fakeAudio, noProductionWrites, storage } from './helpers.js'

const id = HARDCODED_SESSIONS.find(s => s.free && s.has_audio !== false).id
test('short natural completion stays local without awarding an unqualified practice day', async ({ page }) => {
  const writes = await noProductionWrites(page)
  await fakeAudio(page, 0.5)
  await skipOnboarding(page)
  await page.goto(`/sessions/${id}/play`)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByRole('heading', { name: ui.score_prompt.split('?')[0] + '?' })).toBeVisible()
  await page.getByRole('button', { name: 'Calmer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'That is done.' })).toBeVisible()
  const saved = await storage(page)
  expect(JSON.parse(saved.regulated_completed)).toContain(id)
  expect(saved.regulated_practice_days).toBeUndefined()
  expect(JSON.parse(saved['regulated_practice_preview_v1:guest']).events).toEqual([])
  expect(writes).toEqual([])
})
test('seeking to the end cannot qualify practice or masquerade as a natural completion', async ({ page }) => {
  await noProductionWrites(page)
  await fakeAudio(page, 100)
  await skipOnboarding(page)
  await page.goto(`/sessions/${id}/play`)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByText('1:40', { exact: true })).toBeVisible()
  await page.getByRole('slider', { name: 'Session progress' }).fill('100')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  expect((await page.getByRole('heading', { name: ui.score_prompt.split('?')[0] + '?' }).count())).toBe(0)
  const saved = await storage(page)
  const ledger = JSON.parse(saved['regulated_practice_preview_v1:guest'])
  expect(ledger.events).toEqual([])
  expect(ledger.attempts[id].heardSeconds).toBeLessThan(3)
})

test('genuine Quick Reset listening qualifies once and completion cannot award a second day', async ({ page }) => {
  test.setTimeout(100000)
  const writes = await noProductionWrites(page)
  await fakeAudio(page, 75)
  await page.route('**/rest/v1/sessions*', route => route.fulfill({ json: [reset] }))
  await skipOnboarding(page)
  await page.goto('/reset')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await expect.poll(async () => {
    const saved = await storage(page)
    return JSON.parse(saved['regulated_practice_preview_v1:guest'] || '{"events":[]}').events.length
  }, { timeout: 75000, intervals: [1000] }).toBe(1)
  const qualified = JSON.parse((await storage(page))['regulated_practice_preview_v1:guest'])
  expect(qualified.events[0].source).toBe('web-played')
  await expect(page.getByRole('heading', { name: ui.score_prompt.split('?')[0] + '?' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Calmer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'That is done.' })).toBeVisible()
  const saved = await storage(page)
  expect(JSON.parse(saved['regulated_practice_preview_v1:guest']).events).toEqual(qualified.events)
  expect(saved.regulated_practice_days).toBeUndefined()
  expect(writes).toEqual([])
})
