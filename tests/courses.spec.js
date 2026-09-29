import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { skipOnboarding, signedIn, silentWav } from './helpers.js'

const COURSE_ID = '10000000-0000-4000-8000-000000000001'
const LESSON_ID = '20000000-0000-4000-8000-000000000001'
const MEDIA_ID = '40000000-0000-4000-8000-000000000001'
const DAP_GUIDE_ID = '3a7b109c-4760-5697-aa3f-019ecffd7cc9'

test('signed-out visitors see a sign-in prompt without fetching courses', async ({ page }) => {
  await skipOnboarding(page)
  let fetched = false
  await page.route('**/rest/v1/courses*', route => {
    fetched = true
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible()
  await expect(page.getByText('Sign in to see your courses.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Browse courses & audio' }))
    .toHaveAttribute('href', 'https://www.matthewtweediehypnosis.com.au/hypnosis-audio/')
  expect(fetched).toBe(false)
})

test('a signed-in client reads a granted course and saves lesson progress', async ({ page }, testInfo) => {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route('**/api/check-subscription', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))
  await page.route('**/rest/v1/courses*', route => {
    const detail = new URL(route.request().url()).searchParams.has('id')
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(detail
        ? { id: COURSE_ID, title: 'Course A' }
        : [{ id: COURSE_ID, title: 'Course A' }]),
    })
  })
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: LESSON_ID, title: 'Lesson A', body_text: 'Fake lesson text.', position: 1 }]),
  }))
  await page.route('**/rest/v1/course_media*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: MEDIA_ID, lesson_id: LESSON_ID, kind: 'audio', title: 'Practice audio', position: 1 }]),
  }))
  let mediaRequests = 0
  let refuseDownload = false
  let releaseDownload
  let holdDownload = false
  const audioBytes = silentWav()
  await page.route('**/api/get-course-media-url', async route => {
    mediaRequests += 1
    expect(route.request().headers().authorization).toMatch(/^Bearer /)
    const body = route.request().postDataJSON()
    if (body.download) {
      if (holdDownload) await new Promise(resolve => { releaseDownload = resolve })
      expect(body).toEqual({ mediaId: MEDIA_ID, download: true })
      return route.fulfill({ status: refuseDownload ? 404 : 200, contentType: 'application/json',
        body: JSON.stringify(refuseDownload ? { error: 'Media unavailable' } : { url: '/fake-download.wav' }) })
    }
    expect(body).toEqual({ mediaId: MEDIA_ID })
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: '/fake-course-audio.wav' }) })
  })
  await page.route('**/fake-course-audio.wav', route => route.fulfill({
    status: 200, contentType: 'audio/wav', body: '',
  }))
  await page.route('**/fake-download.wav', route => route.fulfill({
    status: 200, contentType: 'audio/wav',
    headers: { 'Content-Disposition': 'attachment; filename=practice.wav' }, body: audioBytes,
  }))
  let completions = 0
  await page.route('**/rest/v1/course_progress*', route => {
    if (route.request().method() === 'POST') {
      completions += 1
      return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(completions ? [{ lesson_id: LESSON_ID }] : []),
    })
  })

  await page.goto('/courses')
  await page.getByRole('button', { name: 'Course A' }).click()
  await expect(page.getByRole('heading', { name: 'Course A' })).toBeVisible()
  await expect(page.getByText('Fake lesson text.')).toBeVisible()
  expect(mediaRequests).toBe(0)
  await page.getByRole('button', { name: 'Play audio: Practice audio' }).click()
  await expect(page.getByLabel('Practice audio', { exact: true })).toBeVisible()
  expect(mediaRequests).toBe(1)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file: Practice audio' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('practice.wav')
  expect(await readFile(await download.path())).toEqual(audioBytes)
  expect(mediaRequests).toBe(2)
  await expect(page.getByLabel('Practice audio', { exact: true })).toHaveAttribute('src', '/fake-course-audio.wav')
  holdDownload = true
  await page.getByRole('button', { name: 'Download file: Practice audio' }).click()
  await expect(page.getByRole('button', { name: 'Download file: Practice audio' })).toBeDisabled()
  await page.getByRole('button', { name: 'Play audio: Practice audio' }).click()
  await expect(page.getByLabel('Practice audio', { exact: true })).toBeVisible()
  const parallelDownload = page.waitForEvent('download')
  await expect.poll(() => typeof releaseDownload).toBe('function')
  releaseDownload()
  await parallelDownload
  await expect(page.getByRole('button', { name: 'Download file: Practice audio' })).toBeEnabled()
  holdDownload = false
  await page.screenshot({ path: testInfo.outputPath('audio-download-mobile.png'), fullPage: true })
  refuseDownload = true
  await page.getByRole('button', { name: 'Download file: Practice audio' }).click()
  await expect(page.getByRole('alert')).toHaveText("That didn't load. Please try again.")
  await expect(page.getByLabel('Practice audio', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download file: Practice audio' })).toBeEnabled()
  await page.getByRole('button', { name: 'Mark lesson as complete' }).click()
  await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()
  expect(completions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.reload()
  await expect(page.getByText('Lesson complete. Your progress is saved across your devices.')).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('heading', { name: 'Course A' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a long course shows chapter headings and brings the chosen lesson into view', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route('**/api/check-subscription', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))
  await page.route('**/rest/v1/courses*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: COURSE_ID, title: 'Course A' }),
  }))
  const lessons = Array.from({ length: 30 }, (_, i) => ({
    id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    section: i < 15 ? 'Chapter one' : 'Chapter two',
    title: `Lesson ${i + 1}`,
    body_text: i === 1 ? '## What to do\n\nText of lesson 2.\n\n- Start here\n- Keep going' : `Text of lesson ${i + 1}.`,
    position: i + 1,
  }))
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(lessons),
  }))
  await page.route('**/rest/v1/course_media*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }))
  await page.route('**/rest/v1/course_progress*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }))

  await page.goto(`/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { name: 'Chapter one' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Chapter two' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Lesson 2', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lesson 2', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Lesson 2', exact: true })).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('button', { name: 'Lesson 1', exact: true })).not.toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('button', { name: 'Lesson 2', exact: true })).toHaveCSS('border-color', 'rgb(36, 52, 77)')
  await expect(page.getByRole('heading', { name: 'What to do' })).toBeVisible()
  await expect(page.getByText('Start here', { exact: true })).toBeVisible()
  await expect(page.getByText('Text of lesson 2.')).toBeVisible()
})

test('course PDFs appear in the lesson and remain downloadable', async ({ page }) => {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route('**/api/check-subscription', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))
  await page.route('**/rest/v1/courses*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: COURSE_ID, title: 'Dissolve Anxiety Program' }),
  }))
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: LESSON_ID, title: 'The Anxiety Zapper', body_text: '', position: 1 }]),
  }))
  const secondId = '40000000-0000-4000-8000-000000000002'
  await page.route('**/rest/v1/course_media*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: MEDIA_ID, lesson_id: LESSON_ID, kind: 'file', title: 'Anxiety Zapper sheet', position: 1 },
      { id: secondId, lesson_id: LESSON_ID, kind: 'file', title: 'Practice worksheet', position: 2 },
    ]),
  }))
  await page.route('**/rest/v1/course_progress*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }))
  const requests = []
  await page.route('**/api/get-course-media-url', route => {
    const body = route.request().postDataJSON()
    requests.push(body)
    expect(route.request().headers().authorization).toMatch(/^Bearer /)
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      url: body.download ? '/save-sheet.pdf' : `/view-${body.mediaId}.pdf`, isPdf: true,
    }) })
  })
  await page.route('**/view-*.pdf', route => route.fulfill({
    status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF',
  }))
  await page.route('**/save-sheet.pdf', route => route.fulfill({
    status: 200, contentType: 'application/pdf',
    headers: { 'Content-Disposition': 'attachment; filename=zapper-sheet.pdf' },
    body: '%PDF-1.4\n%%EOF',
  }))

  await page.goto(`/courses/${COURSE_ID}`)
  await expect(page.getByTitle('Anxiety Zapper sheet')).toHaveAttribute('src', `/view-${MEDIA_ID}.pdf`)
  await expect(page.getByTitle('Practice worksheet')).toHaveAttribute('src', `/view-${secondId}.pdf`)
  expect(requests).toEqual(expect.arrayContaining([{ mediaId: MEDIA_ID }, { mediaId: secondId }]))
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file: Anxiety Zapper sheet' }).click()
  expect((await downloadEvent).suggestedFilename()).toBe('zapper-sheet.pdf')
  expect(requests).toContainEqual({ mediaId: MEDIA_ID, download: true })
})

test('DAP shows a short guide and a clear video action', async ({ page }, testInfo) => {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route('**/api/check-subscription', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"active":false}',
  }))
  await page.route('**/rest/v1/courses*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: COURSE_ID, title: 'Dissolve Anxiety Program' }),
  }))
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: LESSON_ID, title: 'Why DAP?', body_text: '', position: 1 },
      { id: DAP_GUIDE_ID, title: 'How to use the DAP Program', body_text: 'Currently 35?', position: 2 },
    ]),
  }))
  await page.route('**/rest/v1/course_media*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: MEDIA_ID, lesson_id: LESSON_ID, kind: 'video', title: 'Why DAP?', position: 1 }]),
  }))
  await page.route('**/rest/v1/course_progress*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }))
  await page.route('**/api/get-course-media-url', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"url":"/sample-video.mp4"}',
  }))

  await page.goto(`/courses/${COURSE_ID}`)
  const watch = page.getByRole('button', { name: 'Watch video: Why DAP?' })
  await expect(watch).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('dap-video-action-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'How to use the DAP Program' }).click()
  await expect(page.getByText('DAP runs for 12 weeks:')).toBeVisible()
  await expect(page.getByText('Start your journal')).toBeVisible()
  await expect(page.getByText('Currently 35?')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('dap-guide-mobile.png'), fullPage: true })
  await expect(page.getByText('Build your audio')).toHaveCount(0)
  await page.getByText('Move to Chapter 5').scrollIntoViewIfNeeded()
  await expect(page.getByText('Move to Chapter 5')).toBeInViewport()
  await page.getByRole('button', { name: 'Why DAP?', exact: true }).click()
  await expect(watch).toBeVisible()
  await watch.click()
  await expect(page.getByLabel('Why DAP?', { exact: true })).toBeVisible()
})
