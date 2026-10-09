import { test, expect } from '@playwright/test'
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'
import { ui } from '../src/content/reviewedCopy.js'
import { skipOnboarding, fakeAudio } from './helpers.js'

const session = HARDCODED_SESSIONS[0]
const oldRow = { ...session, title: 'Unreviewed remote title', description: 'Unreviewed remote description', created_at: '2025-01-01T00:00:00Z' }

async function fixture(page, { fallback = false, audio = true } = {}) {
  const reads = []
  await skipOnboarding(page)
  await page.route('**/*', route => {
    const req = route.request(), url = new URL(req.url())
    if (url.pathname.includes('/rest/v1/sessions')) {
      reads.push(req.url())
      const single = req.headers().accept?.includes('object')
      return route.fulfill({ status: fallback ? 400 : 200, json: fallback ? {} : single ? { ...oldRow, has_audio: audio } : [{ ...oldRow, has_audio: audio }] })
    }
    if (url.pathname.startsWith('/api/') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return route.fulfill({ status: 200, json: {} })
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await fakeAudio(page, 600, { fallbackCatalog: false })
  return reads
}

for (const fallback of [false, true]) {
  test(`${fallback ? 'fallback' : 'remote and cached'} catalogue keeps reviewed wording through library and player`, async ({ page }) => {
    const reads = await fixture(page, { fallback })
    await page.goto('/sessions')
    const row = page.locator('.session-list > .row', { hasText: session.title }).first()
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByRole('heading', { name: session.title })).toBeVisible()
    await expect(page.getByText(session.description, { exact: true })).toBeVisible()
    await expect(page.getByText(/Unreviewed remote/)).toHaveCount(0)
    if (!fallback) expect(reads.length).toBe(1)
    await page.getByRole('button', { name: 'Start session', exact: true }).click()
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByRole('heading', { name: session.title })).toBeVisible()
    await expect(page.getByText(ui.listening_safety, { exact: true })).toBeVisible()
    if (!fallback) expect(reads.length).toBe(1)
  })
}

test('direct detail and player reads use the same title and preserve the session identifier', async ({ page }) => {
  const reads = await fixture(page)
  await page.goto(`/sessions/${session.id}`)
  await expect(page.getByRole('heading', { name: session.title })).toBeVisible()
  await expect(page.getByText(/Added 2025/)).toBeVisible()
  expect(reads[0]).toContain(session.id)
  await page.goto(`/sessions/${session.id}/play`)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByRole('heading', { name: session.title })).toBeVisible()
  expect(reads.length).toBe(2)
  expect(reads[1]).toContain(session.id)
})

test('unavailable session records interest without promising a readiness email', async ({ page }) => {
  await fixture(page, { audio: false })
  const writes = []
  await page.route('**/api/waitlist', route => {
    writes.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, json: { ok: true } })
  })
  await page.goto(`/sessions/${session.id}`)
  await page.getByLabel(ui.waitlist_help).fill('fixture@example.test')
  await page.getByRole('button', { name: 'Register interest' }).click()
  await expect(page.getByRole('status')).toHaveText('You are on the list.')
  expect(writes).toEqual([{ session_id: session.id, email: 'fixture@example.test' }])
})
