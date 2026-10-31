import { test, expect } from './fixtures.js'
import { readFileSync } from 'node:fs'
import { skipOnboarding, signedIn, FAKE_USER, SUPABASE_URL, silentWav } from './helpers.js'
const course = '10000000-0000-4000-8000-000000000001'
const lesson = '20000000-0000-4000-8000-000000000001'
const media = '40000000-0000-4000-8000-000000000001'
const handout = readFileSync(new URL('./fixtures/nonclinical-handout.pdf', import.meta.url))
const video = readFileSync(new URL('./fixtures/nonclinical-video.mp4', import.meta.url))
async function fixture(page, kind = 'audio') {
  await skipOnboarding(page)
  await page.addInitScript(() => {
    window.androidBridge = {}
    window.__courseNativeCalls = []
    window.Capacitor = { PluginHeaders: [{ name: 'CapacitorHttp', methods: [{ name: 'post', rtype: 'promise' }] }],
      nativePromise: async (plugin, method, options) => {
        if (plugin !== 'CapacitorHttp' || method !== 'post') throw new Error('Unexpected native fixture call')
        window.__courseNativeCalls.push({ url: options.url, responseType: options.responseType, disableRedirects: options.disableRedirects })
        const response = await fetch(options.url, { method: 'POST', headers: options.headers, body: JSON.stringify(options.data) })
        return { status: response.status, data: await response.json() }
      } }
  })
  await signedIn(page)
  await page.route('**/api/check-subscription', route => route.fulfill({ json: { active: false } }))
  await page.route('**/rest/v1/courses*', route => route.fulfill({ json: { id: course, title: 'Synthetic DAP' } }))
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({ json: [{ id: lesson, title: 'Synthetic lesson', position: 1 }] }))
  await page.route('**/rest/v1/course_media*', route => route.fulfill({ json: [{ id: media, lesson_id: lesson, kind, title: 'Synthetic media', position: 1 }] }))
}
test('Android course media uses the remote approved API with the current bearer', async ({ page }) => {
  await fixture(page)
  const requests = []
  await page.route('**/api/get-course-media-url', route => {
    requests.push({ url: route.request().url(), headers: route.request().headers(), body: route.request().postDataJSON() })
    return route.fulfill({ json: { url: '/synthetic.wav', isPdf: false } })
  })
  await page.goto(`/courses/${course}`)
  await page.getByRole('button', { name: 'Play audio: Synthetic media', exact: true }).click()
  await expect(page.getByLabel('Synthetic media', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0].url).toBe('https://regulatedapp.co/api/get-course-media-url')
  expect(requests[0].headers.authorization).toMatch(/^Bearer /)
  expect(requests[0].body).toEqual({ mediaId: media })
  expect(await page.evaluate(() => window.__courseNativeCalls)).toEqual([{ url: 'https://regulatedapp.co/api/get-course-media-url', responseType: 'json', disableRedirects: true }])
})

for (const kind of ['audio', 'video']) {
  test(`expired ${kind} resource shows the existing retry message`, async ({ page }) => {
    await fixture(page, kind)
    let requests = 0
    await page.route('**/api/get-course-media-url', route => route.fulfill({
      json: { url: ++requests === 1 ? '/expired-course-media' : '/fresh-course-audio.wav', isPdf: false },
    }))
    await page.route('**/expired-course-media', route => route.fulfill({ status: 403, body: 'Synthetic expired link' }))
    await page.route('**/fresh-course-audio.wav', route => route.fulfill({
      contentType: kind === 'audio' ? 'audio/wav' : 'video/mp4', body: kind === 'audio' ? silentWav(12) : video,
    }))
    await page.goto(`/courses/${course}`)
    const action = page.getByRole('button', { name: `${kind === 'audio' ? 'Play audio' : 'Watch video'}: Synthetic media`, exact: true })
    await action.click()
    if (kind === 'audio') await page.locator(kind).evaluate(element => element.load())
    await expect(page.getByRole('alert')).toHaveText("That didn't load. Please try again.")
    await expect(page.locator(kind)).toHaveCount(0)
    await action.click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.locator(kind).evaluate(element => { element.muted = true; return element.play() })
    await expect.poll(() => page.locator(kind).evaluate(element => element.currentTime)).toBeGreaterThan(0.2)
    expect(requests).toBe(2)
  })
}

test('Android handout uses the download action without an unsupported PDF iframe', async ({ page }) => {
  await fixture(page, 'file')
  const requests = []
  await page.route('**/api/get-course-media-url', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { url: '/synthetic-handout.pdf', isPdf: true } })
  })
  await page.route('**/synthetic-handout.pdf', route => route.fulfill({ contentType: 'application/pdf',
    headers: { 'Content-Disposition': 'attachment; filename=synthetic-handout.pdf' }, body: handout }))
  await page.goto(`/courses/${course}`)
  await expect(page.getByRole('heading', { name: 'Synthetic lesson', exact: true })).toBeVisible()
  await expect(page.locator('iframe.course-pdf')).toHaveCount(0)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file: Synthetic media', exact: true }).click()
  const download = await event
  expect(download.suggestedFilename()).toBe('synthetic-handout.pdf')
  expect(readFileSync(await download.path()).equals(handout)).toBe(true)
  expect(requests).toEqual([{ mediaId: media, download: true }])
})

test('late course progress from the previous account cannot complete the new account lesson', async ({ page }) => {
  await fixture(page)
  let release
  const reads = []
  await page.route('**/rest/v1/course_progress*', async route => {
    if (route.request().method() === 'POST') {
      await new Promise(resolve => { release = resolve })
      return route.fulfill({ status: 201, body: '' })
    }
    reads.push(new URL(route.request().url()).searchParams.get('user_id'))
    return route.fulfill({ json: [] })
  })
  await page.goto(`/courses/${course}`)
  await page.getByRole('button', { name: 'Mark lesson as complete', exact: true }).click()
  await expect.poll(() => typeof release).toBe('function')
  const user = { ...FAKE_USER, id: 'u2', email: 'other@example.test' }
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const access_token = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: 4102444800 }), 'sig'].join('.')
  const key = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  await page.evaluate(([name, session]) => {
    localStorage.setItem(name, JSON.stringify(session))
    const channel = new BroadcastChannel(name)
    channel.postMessage({ event: 'SIGNED_IN', session })
    channel.close()
  }, [key, { access_token, refresh_token: 'synthetic-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }])
  await expect.poll(() => reads.includes('eq.u2')).toBe(true)
  const finished = page.waitForResponse(response => response.url().includes('/rest/v1/course_progress') && response.request().method() === 'POST')
  release()
  await (await finished).finished()
  await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark lesson as complete', exact: true })).toBeEnabled()
})

for (const outcome of ['failure', 'success']) {
  test(`lesson-specific completion ${outcome} cannot block or show an error on another lesson`, async ({ page }) => {
    await fixture(page)
    const second = '20000000-0000-4000-8000-000000000002'
    await page.route('**/rest/v1/course_lessons*', route => route.fulfill({ json: [
      { id: lesson, title: 'Synthetic lesson', position: 1 },
      { id: second, title: 'Second lesson', position: 2 },
    ] }))
    let release
    await page.route('**/rest/v1/course_progress*', async route => {
      if (route.request().method() === 'POST') {
        await new Promise(resolve => { release = resolve })
        return outcome === 'failure' ? route.fulfill({ status: 500, json: { code: 'fixture-error' } })
          : route.fulfill({ status: 201, body: '' })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/courses/${course}`)
    await page.getByRole('button', { name: 'Mark lesson as complete', exact: true }).click()
    await expect.poll(() => typeof release).toBe('function')
    await page.getByRole('button', { name: 'Second lesson', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Second lesson', exact: true })).toBeVisible()
    if (outcome === 'success') await expect(page.getByRole('button', { name: 'Mark lesson as complete', exact: true })).toBeEnabled()
    const response = page.waitForResponse(value => value.url().includes('/rest/v1/course_progress') && value.request().method() === 'POST')
    release()
    await (await response).finished()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark lesson as complete', exact: true })).toBeEnabled()
    await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toHaveCount(0)
    await page.getByRole('button', { name: 'Synthetic lesson', exact: true }).click()
    if (outcome === 'success') await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
    else await expect(page.getByRole('button', { name: 'Mark lesson as complete', exact: true })).toBeEnabled()
  })
}

for (const look of ['admiralty', 'night']) {
  test(`Android About screen never links to the commercial website (${look})`, async ({ page }) => {
    await skipOnboarding(page)
    await page.addInitScript(() => {
      window.androidBridge = {}
      window.Capacitor = { PluginHeaders: [], nativePromise: async () => { throw new Error('Unexpected native fixture call') } }
    })
    await page.goto(`/about?look=${look}`)
    await expect(page.getByRole('heading', { name: 'About Matthew', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Matthew’s full practitioner profile' })).toHaveCount(0)
    await expect(page.locator('a[href^="http"][href*="matthewtweediehypnosis.com.au"]')).toHaveCount(0)
  })

  test(`Android course list never links to purchases outside Play (${look})`, async ({ page }) => {
    await skipOnboarding(page)
    await page.addInitScript(() => {
      window.androidBridge = {}
      window.Capacitor = { PluginHeaders: [], nativePromise: async () => { throw new Error('Unexpected native fixture call') } }
    })
    await page.goto(`/courses?look=${look}`)
    await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible()
    await expect(page.getByText('Sign in to see your courses.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse courses & audio' })).toHaveCount(0)
    await expect(page.locator('a[href*="matthewtweediehypnosis.com.au"]')).toHaveCount(0)
    await expect(page.locator('a[href="/dap"]')).toHaveCount(0)
  })
}
