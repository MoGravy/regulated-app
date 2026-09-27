import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { skipOnboarding, noProductionWrites, fakeAudio, asPremium } from './helpers.js'
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'

const free = HARDCODED_SESSIONS.find(session => session.free)
const sizes = [[390, 844], [540, 720], [768, 1024], [1024, 768], [1280, 800], [1024, 500]]

async function localData(page) {
  await noProductionWrites(page)
  await page.route(/\/rest\/v1\/|\/rpc\/|\/auth\/v1\//, route => {
    const request = route.request()
    const single = request.headers().accept?.includes('object')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? free : HARDCODED_SESSIONS) })
  })
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"active":false}' }))
  await fakeAudio(page, 600)
}

async function contentFits(page) {
  const clipped = await page.locator('h1, input, textarea, .card, .row, .chip-row, .category-grid > button, .btn-primary').evaluateAll(elements => {
    return elements.flatMap(element => {
      const box = element.getBoundingClientRect()
      if (!box.width || !box.height) return []
      let left = 0, right = innerWidth
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
          const bounds = parent.getBoundingClientRect()
          left = Math.max(left, bounds.left)
          right = Math.min(right, bounds.right)
        }
      }
      return box.left < left - 1 || box.right > right + 1 ? [element.tagName + ':' + element.textContent.slice(0, 60)] : []
    })
  })
  expect(clipped).toEqual([])
}

async function reachable(page, action) {
  await action.scrollIntoViewIfNeeded()
  await expect(action).toBeInViewport({ ratio: 1 })
  const clear = await action.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return target === element || element.contains(target)
  })
  expect(clear, 'action is covered or clipped').toBe(true)
}

for (const [width, height] of sizes) {
  test(`responsive content and actions at ${width}x${height}`, async ({ page }, testInfo) => {
    const shots = join(testInfo.project.outputDir, 'ipad', `${width}x${height}`)
    mkdirSync(shots, { recursive: true })
    await page.setViewportSize({ width, height })
    await skipOnboarding(page)
    await localData(page)
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Check-in' })).toBeVisible()
    await contentFits(page)
    const categories = await page.locator('.category-grid > button').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top))
    expect(categories[0] === categories[2]).toBe(width >= 768)
    const checkin = await page.getByRole('region', { name: 'Check-in' }).boundingBox()
    const grid = await page.locator('.category-grid').boundingBox()
    expect(grid.y).toBeGreaterThanOrEqual(checkin.y + checkin.height)
    await page.screenshot({ path: join(shots, 'home.png'), fullPage: true })

    await page.goto('/sessions')
    await expect(page.locator('.session-list > .row').first()).toBeVisible()
    await contentFits(page)
    const rows = await page.locator('.session-list > .row').evaluateAll(elements => elements.slice(0, 2).map(el => el.getBoundingClientRect().top))
    expect(rows[0] === rows[1]).toBe(width >= 768)
    await page.screenshot({ path: join(shots, 'library.png'), fullPage: true })
    await reachable(page, page.locator('.session-list > .row').last())

    for (const [path, name] of [['/welcome', 'Skip for now'], ['/signin', 'Email me a sign-in link'], ['/premium', 'Restore a purchase'], ['/custom', /^Start a custom session/], [`/sessions/${free.id}`, 'Start session']]) {
      await page.goto(path)
      await contentFits(page)
      const action = page.getByRole('button', { name, exact: typeof name === 'string' })
      await expect(action).toBeVisible()
      await page.screenshot({ path: join(shots, path.split('/')[1] + '.png'), fullPage: true })
      await reachable(page, action)
    }
    await page.goto(`/sessions/${free.id}/play`)
    await reachable(page, page.getByRole('button', { name: 'Skip', exact: true }))
    await contentFits(page)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await contentFits(page)
    await page.screenshot({ path: join(shots, 'player.png'), fullPage: true })
  })
}

test('tablet premium account stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 500 })
  await asPremium(page)
  await localData(page)
  await page.route('**/api/check-subscription', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"active":true}' }))
  await page.goto('/premium')
  await expect(page.getByRole('heading', { name: 'You have premium' })).toBeVisible()
  await contentFits(page)
  await reachable(page, page.getByRole('button', { name: /^Custom audio/ }))
})

test('short tablet forms, errors and safe bottom remain reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 500 })
  await localData(page)
  await page.goto('/welcome')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('layout@example.test')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await reachable(page, page.getByRole('button', { name: 'Skip', exact: true }))
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await contentFits(page)
  await reachable(page, page.getByRole('button', { name: 'Go to the library', exact: true }))

  await page.goto('/signin')
  await page.getByRole('button', { name: 'Use a password instead' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await contentFits(page)
  await reachable(page, page.getByRole('button', { name: 'Sign in', exact: true }))

  await page.goto('/custom')
  await page.getByRole('button', { name: /^Start a custom session/ }).click()
  await contentFits(page)
  const formWidth = await page.locator('.page-content').evaluate(element => element.getBoundingClientRect().width)
  expect(formWidth).toBeLessThanOrEqual(640)
  await reachable(page, page.locator('button[type="submit"]'))
  await page.locator('button[type="submit"]').click()
  await contentFits(page)

  await skipOnboarding(page)
  await page.goto('/sessions')
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-bottom', '34px')
    document.documentElement.style.setProperty('--safe-top', '24px')
  })
  const status = await page.locator('.status-bar').boundingBox()
  expect(status.height).toBe(68)
  const brand = await page.locator('.status-bar a').boundingBox()
  expect(brand.y).toBeGreaterThanOrEqual(24)
  await reachable(page, page.locator('.session-list > .row').last())
  const last = await page.locator('.session-list > .row').last().boundingBox()
  const nav = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
  expect(last.y + last.height).toBeLessThanOrEqual(nav.y)
})
