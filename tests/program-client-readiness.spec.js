import { test, expect } from './fixtures.js'
import { skipOnboarding, signedIn, FAKE_USER, silentWav } from './helpers.js'

const PROGRAMMES = [
  { id: '0a02caf8-5050-571c-9a70-e2bcda2253a3', title: 'Dissolve Anxiety Program' },
  { id: '172990c4-fef9-527e-950b-f2d47f9f5446', title: 'Empowerment Education | One on one Client' },
]
const LESSON = '20000000-0000-4000-8000-000000000001'
const MEDIA = '30000000-0000-4000-8000-000000000001'

for (const programme of PROGRAMMES) for (const look of ['admiralty', 'night']) {
  test(`programme client delivery and saved progress: ${programme.title} ${look}`, async ({ page }) => {
    await skipOnboarding(page)
    await signedIn(page)
    let completed = false
    let allowed = true
    let mediaRequests = 0
    let checkoutWrites = 0
    await page.route('**/api/create-checkout*', route => {
      if (route.request().method() !== 'GET') checkoutWrites++
      return route.fulfill({ json: { enabled: false } })
    })
    await page.route('**/rest/v1/courses*', route => {
      const detail = new URL(route.request().url()).searchParams.has('id')
      return route.fulfill({ json: allowed ? (detail ? programme : [programme]) : (detail ? null : []) })
    })
    await page.route('**/rest/v1/course_lessons*', route => route.fulfill({ json: allowed ? [{ id: LESSON, course_id: programme.id, title: 'Synthetic programme lesson', body_text: 'Local client delivery fixture.', position: 1 }] : [] }))
    await page.route('**/rest/v1/course_grants*', route => route.fulfill({ json: allowed ? { source: 'program' } : null }))
    await page.route('**/rest/v1/course_media*', route => route.fulfill({ json: [{ id: MEDIA, lesson_id: LESSON, kind: 'audio', title: 'Synthetic practice', position: 1 }] }))
    await page.route('**/rest/v1/course_progress*', route => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ user_id: FAKE_USER.id, lesson_id: LESSON })
        completed = true
        return route.fulfill({ status: 201, json: {} })
      }
      return route.fulfill({ json: completed ? [{ lesson_id: LESSON }] : [] })
    })
    await page.route('**/api/get-course-media-url', route => {
      expect(route.request().headers().authorization).toMatch(/^Bearer /)
      expect(route.request().postDataJSON()).toEqual({ mediaId: MEDIA })
      mediaRequests++
      return route.fulfill({ json: { url: '/synthetic-programme.wav' } })
    })
    await page.route('**/synthetic-programme.wav', route => route.fulfill({ contentType: 'audio/wav', body: silentWav() }))
    await page.goto(`/courses?look=${look}`)
    await page.getByRole('button', { name: programme.title, exact: true }).click()
    await expect(page.getByRole('heading', { name: programme.title, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Play audio: Synthetic practice', exact: true }).click()
    await expect(page.locator('audio')).toHaveAttribute('src', '/synthetic-programme.wav')
    await page.getByRole('button', { name: 'Mark lesson as complete', exact: true }).click()
    await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
    expect(await page.locator('html').getAttribute('data-look')).toBe(look)
    expect(mediaRequests).toBe(1)
    expect(checkoutWrites).toBe(0)
    allowed = false
    await page.reload()
    await expect(page.getByText('This course is not available on your account.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play audio: Synthetic practice', exact: true })).toHaveCount(0)
    expect(mediaRequests).toBe(1)
  })
}
