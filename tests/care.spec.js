import { test, expect } from './fixtures.js'
import { skipOnboarding, signedIn } from './helpers.js'

const CLIENT_ID = 'u1'
const PRACTITIONER_ID = 'p1'
const TASK_ID = '30000000-0000-4000-8000-000000000001'
const LINK = {
  client_id: CLIENT_ID, practitioner_id: PRACTITIONER_ID,
  client_label: 'Sam', practitioner_label: 'Matthew',
}

async function fakeCare(page, failInitial = false) {
  let offline = failInitial
  const tasks = [{ id: TASK_ID, title: 'Notice one calm moment', instructions: 'Write down what happened.', created_at: '2026-09-26T00:00:00Z' }]
  const entries = []
  const messages = [{ id: 'm1', sender_id: PRACTITIONER_ID, body: 'Welcome, Sam.', created_at: '2026-09-26T00:00:00Z' }]
  const respond = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  await page.route('**/api/check-subscription', route => respond(route, { active: false }))
  await page.route('**/rest/v1/care_links*', route => respond(route, [LINK]))
  await page.route('**/rest/v1/care_tasks*', route => {
    if (offline) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    if (route.request().method() === 'POST') {
      const row = route.request().postDataJSON()
      tasks.unshift({ id: `task-${tasks.length + 1}`, ...row, created_at: '2026-09-26T01:00:00Z' })
      return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
    }
    return respond(route, tasks)
  })
  await page.route('**/rest/v1/care_task_entries*', route => {
    if (route.request().method() === 'POST') {
      const row = route.request().postDataJSON()
      entries.push({ id: `entry-${entries.length + 1}`, ...row, created_at: '2026-09-26T01:00:00Z' })
      return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
    }
    return respond(route, entries)
  })
  await page.route('**/rest/v1/care_messages*', route => {
    if (route.request().method() === 'POST') {
      const row = route.request().postDataJSON()
      messages.push({ id: `message-${messages.length + 1}`, ...row, created_at: '2026-09-26T01:00:00Z' })
      return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
    }
    return respond(route, messages)
  })
  return { tasks, entries, messages, recover: () => { offline = false } }
}

test('signed-out visitors cannot fetch the support space', async ({ page }) => {
  await skipOnboarding(page)
  let fetched = false
  await page.route('**/rest/v1/care_links*', route => {
    fetched = true
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/care')
  await expect(page.getByText('Sign in to continue.')).toBeVisible()
  expect(fetched).toBe(false)
})

test('client logs homework and sends a message from a phone width', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  const data = await fakeCare(page)
  await page.goto('/care')
  await expect(page.getByRole('heading', { name: 'Your support page' })).toBeVisible()
  await expect(page.getByText('Notice one calm moment')).toBeVisible()
  await page.getByLabel('Task log note').fill('I paused before replying.')
  await page.getByRole('button', { name: 'Save to task log' }).click()
  await expect(page.getByText('I paused before replying.')).toBeVisible()
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(page.getByText('Completed')).toBeVisible()
  expect(data.entries.map(row => row.entry_type)).toEqual(['note', 'complete'])

  await page.getByRole('tab', { name: 'Messages' }).click()
  await expect(page.getByText('Welcome, Sam.')).toBeVisible()
  await expect(page.getByText(/not for urgent help/)).toBeVisible()
  await page.getByRole('textbox', { name: 'Message' }).fill('I finished the task.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.locator('.card').getByText('I finished the task.')).toBeVisible()
  expect(data.messages.at(-1).sender_id).toBe(CLIENT_ID)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.reload()
  await expect(page.getByText('I paused before replying.')).toBeVisible()
  await expect(page.getByText('Completed')).toBeVisible()
  await page.getByRole('tab', { name: 'Messages' }).click()
  await expect(page.locator('.card').getByText('I finished the task.')).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('practitioner assigns a task and replies only in the linked space', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page, {
    id: PRACTITIONER_ID, email: 'practitioner@example.com', aud: 'authenticated', role: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
  })
  const data = await fakeCare(page)
  await page.goto('/care')
  await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible()
  await expect(page.getByLabel('Task log note')).toHaveCount(0)
  await page.getByLabel('Task title').fill('Practice your breathing')
  await page.getByLabel('Instructions').fill('Try it once and make a note.')
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  await expect(page.getByText('Practice your breathing')).toBeVisible()
  expect(data.tasks[0].client_id).toBe(CLIENT_ID)
  expect(data.tasks[0].practitioner_id).toBe(PRACTITIONER_ID)

  await page.getByRole('tab', { name: 'Messages' }).click()
  await page.getByRole('textbox', { name: 'Message' }).fill('Thanks for checking in.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.locator('.card').getByText('Thanks for checking in.')).toBeVisible()
  expect(data.messages.at(-1).sender_id).toBe(PRACTITIONER_ID)
})


test('Refresh recovers after an initial task-load outage', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  const data = await fakeCare(page, true)
  await page.goto('/care')
  // The SDK retries transient 503 responses after 1, 2 and 4 seconds.
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.', { timeout: 15000 })
  await expect(page.getByText('Notice one calm moment')).toHaveCount(0)
  data.recover()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Notice one calm moment')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Refresh recovers when the linked support space fails to load', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  await fakeCare(page)
  let unavailable = true
  await page.route('**/rest/v1/care_links*', route => route.fulfill({
    status: unavailable ? 400 : 200, contentType: 'application/json',
    body: JSON.stringify(unavailable ? { message: 'Test outage' } : [LINK]),
  }))
  await page.goto('/care')
  await expect(page.getByRole('alert')).toBeVisible()
  unavailable = false
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'My task log' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
