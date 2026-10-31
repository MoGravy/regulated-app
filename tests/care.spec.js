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

for (const look of ['admiralty', 'night']) {
  test.describe(`${look}: Support journeys`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(look => localStorage.setItem('regulated_look', look), look)
    })

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
      await page.getByRole('button', { name: 'Sam', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible()
      await expect(page.getByLabel('Task log note')).toHaveCount(0)
      await page.getByText('Assign a task', { exact: true }).click()
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
  })
}

for (const look of ['admiralty', 'night']) {
  test(`readable practitioner task logs survive a Messages outage: ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page, {
      id: PRACTITIONER_ID, email: 'practitioner@example.com', aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    })
    const data = await fakeCare(page)
    data.entries.push({ id: 'entry-fixture', task_id: TASK_ID, entry_type: 'note', body: 'Synthetic saved practice note.', created_at: '2026-09-26T01:00:00Z' })
    await page.route('**/rest/v1/care_messages*', route => route.fulfill({ status: 403, json: { message: 'Synthetic message outage' } }))
    await page.goto(`/care?look=${look}`)
    await page.getByRole('button', { name: 'Sam', exact: true }).click()
    await expect(page.getByText('Synthetic saved practice note.')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Messages', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.')
    await expect(page.getByText('No messages yet.', { exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Assigned tasks', exact: true }).click()
    await expect(page.getByText('Synthetic saved practice note.')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByText('Synthetic saved practice note.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByText('Synthetic saved practice note.').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `../tasking-diagnosis-29oct/green-tasks-${look}.png`, fullPage: true })
  })

  test(`readable messages survive a task-log outage: ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page)
    await fakeCare(page)
    await page.route('**/rest/v1/care_tasks*', route => route.fulfill({ status: 403, json: { message: 'Synthetic task outage' } }))
    await page.goto(`/care?look=${look}`)
    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.')
    await expect(page.getByText('No tasks yet.', { exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Messages', exact: true }).click()
    await expect(page.locator('.card').getByText('Welcome, Sam.')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.locator('.card').getByText('Welcome, Sam.')).toBeVisible()
    await page.getByRole('tab', { name: 'My task log', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.')
    await page.getByRole('tab', { name: 'Messages', exact: true }).click()
    await expect(page.locator('.card').getByText('Welcome, Sam.')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `../tasking-diagnosis-29oct/green-messages-${look}.png`, fullPage: true })
  })
}

test('a late successful Tasks refresh cannot erase a Messages load error', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  const data = await fakeCare(page)
  await page.goto('/care')
  await expect(page.getByText('Notice one calm moment')).toBeVisible()
  let release
  let intercepted = false
  const held = new Promise(resolve => { release = resolve })
  await page.route('**/rest/v1/care_tasks*', async route => {
    intercepted = true
    await held
    await route.fulfill({ json: data.tasks })
  })
  await page.route('**/rest/v1/care_messages*', route => route.fulfill({ status: 403, json: { message: 'Synthetic message outage' } }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(() => intercepted).toBe(true)
  await page.getByRole('tab', { name: 'Messages', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.')
  const response = page.waitForResponse('**/rest/v1/care_tasks*')
  release()
  await response
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.')
  await expect(page.getByText('No messages yet.', { exact: true })).toHaveCount(0)
})

test('a late failed Messages refresh cannot contaminate readable Tasks', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  await fakeCare(page)
  await page.goto('/care')
  await page.getByRole('tab', { name: 'Messages', exact: true }).click()
  await expect(page.locator('.card').getByText('Welcome, Sam.')).toBeVisible()
  let release
  let intercepted = false
  const held = new Promise(resolve => { release = resolve })
  await page.route('**/rest/v1/care_messages*', async route => {
    intercepted = true
    await held
    await route.fulfill({ status: 403, json: { message: 'Synthetic delayed outage' } })
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(() => intercepted).toBe(true)
  await page.getByRole('tab', { name: 'My task log', exact: true }).click()
  await expect(page.getByText('Notice one calm moment')).toBeVisible()
  const response = page.waitForResponse('**/rest/v1/care_messages*')
  release()
  await response
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Notice one calm moment')).toBeVisible()
})

for (const section of ['tasks', 'messages']) {
  test(`an older ${section} refresh cannot overwrite a newer return to the tab`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page)
    const data = await fakeCare(page)
    await page.goto('/care')
    await expect(page.getByText('Notice one calm moment')).toBeVisible()
    if (section === 'messages') {
      await page.getByRole('tab', { name: 'Messages', exact: true }).click()
      await expect(page.locator('.card').getByText('Welcome, Sam.')).toBeVisible()
    }
    const rows = section === 'tasks' ? data.tasks : data.messages
    const oldRows = rows.map(row => ({ ...row }))
    const field = section === 'tasks' ? 'title' : 'body'
    const latest = `Newer synthetic ${section} result`
    let release
    let intercepted = false
    const held = new Promise(resolve => { release = resolve })
    const pattern = `**/rest/v1/care_${section}*`
    await page.route(pattern, async route => {
      if (!intercepted) {
        intercepted = true
        await held
        return route.fulfill({ json: oldRows })
      }
      return route.fulfill({ json: rows })
    })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect.poll(() => intercepted).toBe(true)
    rows[0][field] = latest
    await page.getByRole('tab', { name: section === 'tasks' ? 'Messages' : 'My task log', exact: true }).click()
    await expect(page.locator('.card').getByText(section === 'tasks' ? 'Welcome, Sam.' : 'Notice one calm moment')).toBeVisible()
    await page.getByRole('tab', { name: section === 'tasks' ? 'My task log' : 'Messages', exact: true }).click()
    await expect(page.getByText(latest)).toBeVisible()
    const response = page.waitForResponse(pattern)
    release()
    await response
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(page.getByText(latest)).toBeVisible()
  })
}



for (const look of ['admiralty', 'night']) {
  test(`Connected clients lists an existing client without setup fields: ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page, { id: PRACTITIONER_ID, email: 'practitioner@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
    const data = await fakeCare(page)
    data.entries.push({ id: 'saved-note', task_id: TASK_ID, entry_type: 'note', body: 'Synthetic saved practice note.', created_at: '2026-09-26T01:00:00Z' })
    await page.route('**/api/care-connect', route => route.fulfill({ json: { canConnect: true } }))
    await page.goto(`/care?look=${look}`)
    await expect(page.getByRole('heading', { name: 'Connected clients', exact: true })).toBeVisible()
    await expect(page.getByLabel('Client email')).not.toBeVisible()
    await expect(page.getByLabel('Display name')).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'Assigned tasks' })).toHaveCount(0)
    await page.screenshot({ animations: 'disabled', path: `../tasking-diagnosis-29oct/list-first-${look}.png` })
    await page.getByRole('button', { name: 'Sam', exact: true }).click()
    await expect(page.getByText('Synthetic saved practice note.')).toBeVisible()
    await expect(page.getByLabel('Task title')).not.toBeVisible()
    await page.screenshot({ animations: 'disabled', path: `../tasking-diagnosis-29oct/list-first-selected-${look}.png` })
    await page.getByRole('button', { name: 'Connected clients', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sam', exact: true })).toBeVisible()
    await page.getByText('Connect a client', { exact: true }).click()
    await expect(page.getByLabel('Client email')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

async function practitionerSession(page) {
  await skipOnboarding(page)
  await signedIn(page, { id: PRACTITIONER_ID, email: 'practitioner@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
}

test('client selection reads only that relationship and returning restores the list', async ({ page }) => {
  await practitionerSession(page)
  await fakeCare(page)
  await page.route('**/rest/v1/care_links*', route => route.fulfill({ json: [LINK, { ...LINK, client_id: 'u2', client_label: 'Alex' }] }))
  const reads = []
  await page.route('**/rest/v1/care_tasks*', route => {
    const url = new URL(route.request().url())
    reads.push([url.searchParams.get('client_id'), url.searchParams.get('practitioner_id')])
    return route.fulfill({ json: [{ id: TASK_ID, title: url.searchParams.get('client_id') === 'eq.u2' ? 'Alex task fixture' : 'Sam task fixture', instructions: '', created_at: '2026-09-26T00:00:00Z' }] })
  })
  await page.goto('/care')
  await expect(page.getByRole('button', { name: 'Alex', exact: true })).toBeVisible()
  expect(reads).toEqual([])
  await page.getByRole('button', { name: 'Alex', exact: true }).click()
  await expect(page.getByText('Alex task fixture')).toBeVisible()
  await page.getByRole('button', { name: 'Connected clients', exact: true }).click()
  await page.getByRole('button', { name: 'Sam', exact: true }).click()
  await expect(page.getByText('Sam task fixture')).toBeVisible()
  await expect(page.getByText('Alex task fixture')).toHaveCount(0)
  expect(reads).toEqual([['eq.u2', 'eq.p1'], ['eq.u1', 'eq.p1']])
})

test('an authorised manager with no connections sees an empty list rather than a client directory', async ({ page }) => {
  await practitionerSession(page)
  await fakeCare(page)
  await page.route('**/api/care-connect', route => route.fulfill({ json: { canConnect: true } }))
  await page.route('**/rest/v1/care_links*', route => route.fulfill({ json: [] }))
  await page.goto('/care')
  await expect(page.getByRole('heading', { name: 'Connected clients', exact: true })).toBeVisible()
  await expect(page.getByText('No connected clients yet.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sam', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Client email')).not.toBeVisible()
})

test('failed connection loading is not labelled as an empty client list', async ({ page }) => {
  await practitionerSession(page)
  await fakeCare(page)
  await page.route('**/rest/v1/care_links*', route => route.fulfill({ status: 403, json: {} }))
  await page.goto('/care')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('No connected clients yet.', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Client email')).toHaveCount(0)
})

test('a valid practitioner alert still opens its connected client and target directly', async ({ page }) => {
  await practitionerSession(page)
  await fakeCare(page)
  const client = '10000000-0000-4000-8000-000000000001'
  const practitioner = '20000000-0000-4000-8000-000000000001'
  await signedIn(page, { id: practitioner, email: 'practitioner@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
  await page.route('**/rest/v1/care_links*', route => route.fulfill({ json: [{ ...LINK, client_id: client, practitioner_id: practitioner }] }))
  await page.goto(`/care?client=${client}&practitioner=${practitioner}&tab=tasks&item=${TASK_ID}`)
  await expect(page.getByRole('heading', { name: 'Sam', exact: true })).toBeVisible()
  await expect(page.locator(`#care-tasks-${TASK_ID}`)).toBeFocused()
  await page.getByRole('button', { name: 'Connected clients', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sam', exact: true })).toBeVisible()
})

test('a connection manager with a client-side relationship can still open Connected clients', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  await fakeCare(page)
  await page.route('**/api/care-connect', route => route.fulfill({ json: { canConnect: true } }))
  await page.goto('/care')
  await expect(page.getByRole('heading', { name: 'Connected clients', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Matthew', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Matthew', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'My task log', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Connected clients', exact: true }).click()
  await page.getByText('Connect a client', { exact: true }).click()
  await expect(page.getByLabel('Client email')).toBeVisible()
})
