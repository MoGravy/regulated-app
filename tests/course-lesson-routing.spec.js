import { test, expect } from './fixtures.js'
import { skipOnboarding, signedIn } from './helpers.js'

const course = '10000000-0000-4000-8000-000000000001'
const first = '20000000-0000-4000-8000-000000000001'
const second = '20000000-0000-4000-8000-000000000002'
const other = '20000000-0000-4000-8000-000000000003'
const media = '40000000-0000-4000-8000-000000000001'

async function courseFixture(page, allowed = true) {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route('**/rest/v1/courses*', route => route.fulfill({ status: 200,
    json: allowed ? { id: course, title: 'Course A' } : null }))
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({ status: 200,
    json: allowed ? [
      { id: first, title: 'Lesson A', body_text: 'First lesson.', position: 1 },
      { id: second, title: 'Lesson B', body_text: 'Linked lesson.', position: 2 },
    ] : [] }))
  await page.route('**/rest/v1/course_media*', route => route.fulfill({ status: 200,
    json: allowed ? [{ id: media, lesson_id: first, kind: 'audio', title: 'Practice audio', position: 1 }] : [] }))
}

for (const look of ['admiralty', 'night']) {
  test(`${look}: lesson route, reload, history and unavailable lesson fallback fit the phone`, async ({ page }, testInfo) => {
    await courseFixture(page)
    const completions = []
    await page.route('**/rest/v1/course_progress*', route => {
      if (route.request().method() === 'POST') {
        completions.push(route.request().postDataJSON())
        return route.fulfill({ status: 201, body: '' })
      }
      return route.fulfill({ status: 200, json: completions })
    })
    await page.goto(`/courses/${course}?lesson=${second}&look=${look}`)
    await expect(page.getByRole('heading', { name: 'Lesson B', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-look', look)
    await expect(page.getByRole('button', { name: 'Lesson B', exact: true })).toHaveAttribute('aria-current', 'step')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.screen').evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true })
        .filter(animation => Number.isFinite(animation.effect.getTiming().iterations))
        .map(animation => animation.finished.catch(() => {})))
    })
    await expect(page.locator('.screen')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath(`${look}-linked-lesson-390.png`), fullPage: true })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Lesson B', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Mark lesson as complete', exact: true }).click()
    await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
    expect(completions).toEqual([{ user_id: 'u1', lesson_id: second }])
    await page.reload()
    await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
    await page.getByRole('button', { name: 'Lesson A', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Lesson A', exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('look')).toBe(look)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Lesson B', exact: true })).toBeVisible()
    await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Lesson A', exact: true })).toBeVisible()
    for (const target of [other, 'malformed', '']) {
      await page.goto(`/courses/${course}?lesson=${target}&look=${look}`)
      await expect(page.getByRole('heading', { name: 'Lesson A', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Lesson B', exact: true })).toHaveCount(0)
    }
  })

  test(`${look}: history navigation discards interrupted play and download responses`, async ({ page }) => {
    await courseFixture(page)
    const releases = []
    let downloads = 0
    page.on('download', () => { downloads += 1 })
    await page.route('**/api/get-course-media-url', async route => {
      const body = route.request().postDataJSON()
      await new Promise(resolve => releases.push(resolve))
      await route.fulfill({ status: 200, json: { url: body.download ? '/stale-download.wav' : '/stale-audio.wav' } })
    })
    let staleRequests = 0
    await page.route('**/stale-*.wav', route => {
      staleRequests += 1
      return route.fulfill({ status: 200, body: '' })
    })
    await page.goto(`/courses/${course}?lesson=${second}&look=${look}`)
    await page.getByRole('button', { name: 'Lesson A', exact: true }).click()
    await page.getByRole('button', { name: 'Play audio: Practice audio' }).click()
    await page.getByRole('button', { name: 'Download file: Practice audio' }).click()
    await expect.poll(() => releases.length).toBe(2)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Lesson B', exact: true })).toBeVisible()
    const responses = [page.waitForResponse(response => response.url().endsWith('/api/get-course-media-url') && !response.request().postDataJSON().download),
      page.waitForResponse(response => response.url().endsWith('/api/get-course-media-url') && response.request().postDataJSON().download)]
    releases.forEach(release => release())
    await Promise.all((await Promise.all(responses)).map(response => response.finished()))
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Lesson A', exact: true })).toBeVisible()
    await expect(page.locator('audio')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download file: Practice audio' })).toBeEnabled()
    expect(staleRequests).toBe(0)
    expect(downloads).toBe(0)
  })

  test(`${look}: a lesson URL cannot render a refused course`, async ({ page }) => {
    await courseFixture(page, false)
    let requestedMedia = 0
    await page.route('**/api/get-course-media-url', route => {
      requestedMedia += 1
      return route.fulfill({ status: 404, json: {} })
    })
    await page.goto(`/courses/${course}?lesson=${second}&look=${look}`)
    await expect(page.getByText('This course is not available on your account.')).toBeVisible()
    await expect(page.locator('.course-active-lesson')).toHaveCount(0)
    expect(requestedMedia).toBe(0)
  })
}
