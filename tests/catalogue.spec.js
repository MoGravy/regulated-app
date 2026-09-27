import { test, expect } from '@playwright/test'
import catalogue from './fixtures/catalogue-20260928.json' with { type: 'json' }
import copy from '../src/content/reviewed-copy.json' with { type: 'json' }
import { asPremium, skipOnboarding, fakeAudio } from './helpers.js'

async function fixture(page, fallback) {
  await skipOnboarding(page)
  await asPremium(page)
  const reads = [], audioRequests = []
  await page.route('**/*', route => {
    const req = route.request(), url = new URL(req.url())
    if (url.pathname.includes('/rest/v1/sessions')) {
      reads.push(url.search)
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      const rows = catalogue.map(row => ({ ...row, title: `Source ${row.category}`, description: 'Source description' }))
      return route.fulfill({ status: fallback ? 400 : 200, json: fallback ? {} : id ? rows.find(row => row.id === id) : rows })
    }
    if (url.pathname === '/api/check-subscription') return route.fulfill({ status: 200, json: { active: true } })
    if (url.pathname.startsWith('/api/') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return route.fulfill({ status: 200, json: {} })
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await fakeAudio(page, 600)
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/get-audio-url') audioRequests.push(request.postDataJSON().sessionId)
  })
  return { reads, audioRequests }
}

for (const fallback of [false, true]) {
  test(`${fallback ? 'fallback' : 'remote'} library uses authoritative14 identities and matching metadata`, async ({ page }) => {
    await fixture(page, fallback)
    await page.goto('/sessions')
    await expect(page.locator('.session-list > .row')).toHaveCount(14)
    for (const expected of catalogue) {
      const row = page.locator('.session-list > .row', { hasText: copy.sessions[expected.id].title })
      await expect(row).toHaveCount(1)
      await expect(row.locator('.row-meta')).toContainText(`${expected.category} · ${expected.duration} min`)
    }
    await expect(page.getByText(/Unshakeable Confidence|Panic Attack Protocol|Source description/)).toHaveCount(0)
  })

  test(`${fallback ? 'fallback' : 'remote'} direct detail and player preserve topic, duration and audio ID`, async ({ page }) => {
    const { audioRequests } = await fixture(page, fallback)
    for (const expected of catalogue.slice(0, 5)) {
      await page.goto(`/sessions/${expected.id}`)
      await expect(page.getByRole('heading', { name: copy.sessions[expected.id].title, exact: true })).toBeVisible()
      await expect(page.locator('.detail-content')).toContainText(expected.category)
      await expect(page.locator('.detail-content')).toContainText(`${expected.duration} minutes`)
      await expect(page.getByText(copy.sessions[expected.id].description, { exact: true })).toBeVisible()
      await page.goto(`/sessions/${expected.id}/play`)
      await page.getByRole('button', { name: 'Skip', exact: true }).click()
      await expect(page.getByRole('heading', { name: copy.sessions[expected.id].title, exact: true })).toBeVisible()
      await expect(page.locator('.player-page')).toContainText(expected.category)
      await expect.poll(() => audioRequests.at(-1)).toBe(expected.id)
    }
  })
}

test('cached detail keeps the reviewed Daily identity from the loaded library', async ({ page }) => {
  const { reads } = await fixture(page, false)
  const expected = catalogue.find(row => row.category === 'Daily' && row.free)
  await page.goto('/sessions')
  await page.locator('.session-list > .row', { hasText: copy.sessions[expected.id].title }).click()
  await expect(page.getByRole('heading', { name: copy.sessions[expected.id].title, exact: true })).toBeVisible()
  await expect(page.locator('.detail-content')).toContainText('Daily')
  await expect(page.locator('.detail-content')).toContainText('11 minutes')
  expect(reads).toHaveLength(1)
})

test('sleep and daily check-ins route to the authoritative free recordings', async ({ page }) => {
  await fixture(page, true)
  await page.goto('/')
  const section = page.getByRole('region', { name: 'Check-in' })
  for (const [button, category] of [["Can't sleep", 'Sleep'], ['Just checking in', 'Daily']]) {
    await section.getByRole('button', { name: button, exact: true }).click()
    const expected = catalogue.find(row => row.free && row.category === category)
    const row = section.locator('.row', { hasText: copy.sessions[expected.id].title })
    await expect(row.locator('.row-meta')).toContainText(`${category} · ${expected.duration} min`)
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/sessions/${expected.id}$`))
    await page.goto('/')
  }
})
