import { test, expect } from './fixtures.js'
import { skipOnboarding, signedIn } from './helpers.js'

const client = '30000000-0000-4000-8000-000000000001'
const otherClient = '30000000-0000-4000-8000-000000000002'
const practitioner = '30000000-0000-4000-8000-000000000003'
const taskId = '40000000-0000-4000-8000-000000000001'
const noteId = '50000000-0000-4000-8000-000000000001'
const messageId = '60000000-0000-4000-8000-000000000001'

async function supportFixture(page) {
  await skipOnboarding(page)
  await signedIn(page, { id: practitioner, email: 'practitioner@example.test',
    aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
  await page.route('**/rest/v1/care_links*', route => route.fulfill({ status: 200, json: [
    { client_id: otherClient, practitioner_id: practitioner, client_label: 'Other client', practitioner_label: 'Matthew' },
    { client_id: client, practitioner_id: practitioner, client_label: 'Sam', practitioner_label: 'Matthew' },
  ] }))
  const own = route => new URL(route.request().url()).searchParams.get('client_id') === `eq.${client}`
  await page.route('**/rest/v1/care_tasks*', route => route.fulfill({ status: 200,
    json: own(route) ? [{ id: taskId, title: 'Notice a calm moment', instructions: 'Write what happened.', created_at: '2026-09-26T00:00:00Z' }] : [] }))
  await page.route('**/rest/v1/care_task_entries*', route => route.fulfill({ status: 200,
    json: [{ id: noteId, task_id: taskId, entry_type: 'note', body: 'I paused before replying.', created_at: '2026-09-26T01:00:00Z' }] }))
  await page.route('**/rest/v1/care_messages*', route => route.fulfill({ status: 200,
    json: own(route) ? [{ id: messageId, sender_id: client, body: 'I finished the task.', created_at: '2026-09-26T02:00:00Z' }] : [] }))
}

async function settled(page) {
  await page.locator('.screen').evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter(animation => Number.isFinite(animation.effect.getTiming().iterations))
      .map(animation => animation.finished.catch(() => {})))
  })
  await page.locator('.care-alert-target').evaluate(async element => {
    let previous = element.getBoundingClientRect().top
    let stable = 0
    for (let frame = 0; frame < 120 && stable < 6; frame += 1) {
      await new Promise(requestAnimationFrame)
      const position = element.getBoundingClientRect().top
      stable = Math.abs(position - previous) < 0.1 ? stable + 1 : 0
      previous = position
    }
    if (stable < 6) throw new Error('Alert target scroll did not settle')
  })
}

for (const look of ['admiralty', 'night']) {
  test(`${look}: task-note alert opens the matching support pair and exact note`, async ({ page }, testInfo) => {
    await supportFixture(page)
    await page.goto(`/care?tab=tasks&item=${noteId}&client=${client}&practitioner=${practitioner}&look=${look}`)
    await expect(page.getByRole('heading', { name: 'Sam', exact: true })).toBeVisible()
    await expect(page.locator(`#care-entry-${noteId}`)).toBeFocused()
    await expect(page.locator(`#care-tasks-${taskId}`)).toHaveClass(/care-alert-target/)
    await expect(page.getByRole('tab', { name: 'Assigned tasks' })).toHaveAttribute('aria-selected', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(`${look}-support-note-390.png`), fullPage: true })
  })

  test(`${look}: a warm synthetic notification routes from Today to the exact message`, async ({ page }, testInfo) => {
    await supportFixture(page)
    await page.goto(`/?look=${look}`)
    await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeVisible()
    const url = `/care?tab=messages&item=${messageId}&client=${client}&practitioner=${practitioner}`
    await page.evaluate(({ recipientId, url }) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
      data: { type: 'care-notification', recipientId, url },
    })), { recipientId: otherClient, url })
    expect(new URL(page.url()).pathname).toBe('/')
    await page.evaluate(({ recipientId, url }) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
      data: { type: 'care-notification', recipientId, url },
    })), { recipientId: practitioner, url })
    await expect(page).toHaveURL(new RegExp(`/care\\?tab=messages`))
    await expect(page.locator(`#care-messages-${messageId}`)).toBeFocused()
    await expect(page.locator(`#care-messages-${messageId}`)).toHaveClass(/care-alert-target/)
    await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-look', look)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await settled(page)
    await page.screenshot({ path: testInfo.outputPath(`${look}-support-message-390.png`), fullPage: true })
  })

  test(`${look}: an unavailable item never highlights a different message`, async ({ page }) => {
    await supportFixture(page)
    const unavailable = '60000000-0000-4000-8000-000000000002'
    await page.goto(`/care?tab=messages&item=${unavailable}&client=${client}&practitioner=${practitioner}&look=${look}`)
    await expect(page.locator(`#care-messages-${messageId}`)).toBeVisible()
    await expect(page.locator('.care-alert-target')).toHaveCount(0)
    await expect(page.locator(`#care-messages-${messageId}`)).not.toBeFocused()
  })

  test(`${look}: a revoked support pair cannot be opened by an alert URL`, async ({ page }) => {
    await supportFixture(page)
    await page.route('**/rest/v1/care_links*', route => route.fulfill({ status: 200, json: [] }))
    let privateReads = 0
    await page.route(/\/rest\/v1\/care_(tasks|messages)/, route => {
      privateReads += 1
      return route.fulfill({ status: 200, json: [] })
    })
    await page.goto(`/care?tab=messages&item=${messageId}&client=${client}&practitioner=${practitioner}&look=${look}`)
    await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toHaveCount(0)
    await expect(page.getByText('I finished the task.')).toHaveCount(0)
    await expect(page.locator('.care-alert-target')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0)
    await expect(page.getByText('Nothing here yet.')).toBeVisible()
    expect(privateReads).toBe(0)
  })
}
