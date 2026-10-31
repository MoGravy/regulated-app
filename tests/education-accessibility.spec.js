import { test, expect } from './fixtures.js'
import { skipOnboarding, signedIn } from './helpers.js'

const courseId = '10000000-0000-4000-8000-000000000001'
const lessonId = number => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`

async function fixture(page) {
  await skipOnboarding(page)
  await signedIn(page)
  await page.route('**/rest/v1/courses*', route => route.fulfill({ status: 200,
    json: { id: courseId, title: 'Course A' } }))
  await page.route('**/rest/v1/course_lessons*', route => route.fulfill({ status: 200,
    json: Array.from({ length: 30 }, (_, index) => ({ id: lessonId(index + 1),
      title: `Lesson ${index + 1}`, body_text: 'Practice instructions.', position: index + 1 })) }))
}

for (const look of ['admiralty', 'night']) {
  test(`${look}: selecting a distant lesson by keyboard retains visible focus`, async ({ page }, testInfo) => {
    await fixture(page)
    await page.goto(`/courses/${courseId}?look=${look}`)
    const lastLesson = page.getByRole('button', { name: 'Lesson 30', exact: true })
    await lastLesson.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Lesson 30', exact: true })).toBeInViewport()
    await expect(page.locator(':focus')).toBeInViewport()
    await expect(page.getByRole('article', { name: 'Lesson 30', exact: true })).toBeFocused()
    await expect(page.getByRole('article', { name: 'Lesson 30', exact: true })).not.toHaveCSS('box-shadow', 'none')
    expect(new URL(page.url()).searchParams.get('lesson')).toBe(lessonId(30))
    await page.locator('.screen').evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true })
        .filter(animation => Number.isFinite(animation.effect.getTiming().iterations))
        .map(animation => animation.finished.catch(() => {})))
    })
    await page.screenshot({ path: testInfo.outputPath(`${look}-keyboard-lesson-390.png`) })
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Mark lesson as complete', exact: true })).toBeFocused()
  })

  test(`${look}: primary navigation works with the keyboard and retains the theme`, async ({ page }) => {
    await fixture(page)
    await page.goto(`/courses/${courseId}?lesson=${lessonId(2)}&look=${look}`)
    await expect(page.getByRole('button', { name: 'My courses', exact: true })).toHaveAttribute('aria-current', 'page')
    const support = page.getByRole('button', { name: 'Support', exact: true })
    await support.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Your support page', exact: true })).toBeVisible()
    await expect(support).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('html')).toHaveAttribute('data-look', look)
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'My courses', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-look', look)
  })
}
