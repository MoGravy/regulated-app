import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from '@playwright/test'
import AboutMatthew from '../.tmp/about-matthew/component.mjs'
import Navigation from '../.tmp/about-matthew/navigation.mjs'
import { MemoryRouter } from 'react-router-dom'
import { aboutMatthewProfile as profile } from '../src/config/aboutMatthew.js'

let css = (await Promise.all(['src/tokens.css', 'src/index.css', 'src/theme/night.css', 'src/theme/admiralty.css']
  .map(file => readFile(file, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '')
for (const icon of ['today', 'browse', 'courses', 'support', 'you']) {
  const svg = await readFile(`src/theme/tab-${icon}.svg`, 'utf8')
  css = css.replaceAll(`url('./tab-${icon}.svg')`, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
}
const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/about'] }, createElement(AboutMatthew, { profile })))
const nav = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/about'] }, createElement(Navigation)))
const youNav = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/premium'] }, createElement(Navigation)))
assert.match(youNav, /href="\/about"/)
await mkdir('.tmp/about-matthew/screenshots', { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.route('**/*', route => route.abort())
  for (const look of ['admiralty', 'night']) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await page.setContent(`<html data-look="${look}"><head><style>${css}</style></head><body><div id="root"><div class="app-shell app-shell-with-nav"><div class="screen">${markup}</div>${nav}</div></div></body></html>`)
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect.getTiming().iterations))
          .map(animation => animation.finished.catch(() => {})))
      })
      const cta = page.getByRole('link', { name: 'Email Matthew about working together', exact: true })
      await cta.scrollIntoViewIfNeeded()
      const bounds = await cta.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height >= 52)
      assert.equal(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth), true)
      assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= innerWidth), true)
      assert.equal(await page.getByRole('navigation', { name: 'Primary' }).getByRole('button').count(), 5)
      assert.equal(await page.getByRole('button', { name: 'You', exact: true }).getAttribute('aria-current'), 'page')
      await cta.focus()
      assert.equal(await cta.evaluate(element => element === document.activeElement), true)
      assert.notEqual(await cta.evaluate(element => getComputedStyle(element).boxShadow), 'none')
      const mailto = new URL(await cta.getAttribute('href'))
      assert.equal(mailto.pathname, profile.email)
      assert.equal(mailto.searchParams.get('subject'), 'One-to-one programme enquiry from Regulated')
      await page.screenshot({ path: `.tmp/about-matthew/screenshots/${look}-${width}.png` })
      console.log(`PASS: ${look} ${width}x844 source-fact page layout, existing five tabs, visible focus and enquiry destination`)
    }
  }
} finally { await browser.close() }
