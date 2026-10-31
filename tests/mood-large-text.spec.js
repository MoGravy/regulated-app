import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

let script, css

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import MoodTracker from './src/components/MoodTracker.jsx'
      function Fixture() {
        const [answer, setAnswer] = useState('pending')
        return <><div className="app-shell app-shell-player app-shell-native"><div className="screen">
          <div className="page-frame player-page" style={{ background:'var(--player-bg)', position:'relative', color:'var(--player-body)', overflowX:'hidden' }}>
            <div className="status-bar" aria-hidden="true" />
            <div className="player-content" style={{height:56,flex:'none'}} />
            <MoodTracker label="Before we start, where are you now?" optional onSubmit={setAnswer} />
          </div></div></div>
          <output hidden data-testid="decision">{answer === null ? 'skipped' : answer === 'pending' ? answer : 'rating:' + answer}</output></>
      }
      createRoot(document.getElementById('root')).render(<Fixture />)
    ` }, bundle:true, write:false, format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"test"'},
  })
  script = result.outputFiles[0].text
  css = (await Promise.all(['tokens.css','index.css','theme/night.css','theme/admiralty.css']
    .map(file => readFile(`src/${file}`, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '')
})

for (const look of ['admiralty','night']) for (const width of [320,390]) for (const size of ['standard','large']) {
  test(`all ten rating targets fit and Skip remains reachable: ${look} ${width} ${size}`, async ({ page }) => {
    await page.setViewportSize({width,height:width===320?711:844})
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.route('**/*', route => route.request().isNavigationRequest()
      ? route.fulfill({contentType:'text/html',body:`<!doctype html><html data-look="${look}"><head><style>${css}\n:root{--safe-top:24px;--safe-bottom:48px}</style></head><body><div id="root"></div></body></html>`})
      : route.abort('blockedbyclient'))
    await page.goto('/synthetic-rating-layout')
    await page.addScriptTag({content:script})
    const ratings = page.locator('button[aria-pressed="false"]')
    await expect(ratings).toHaveCount(10)
    if (size === 'large') {
      // Layout stress reflecting 150% text; no Android setting or native test claim.
      await page.addStyleTag({content:`button[aria-pressed]{font-size:25.5px!important}
        button[aria-pressed=true]{font-size:30px!important}`})
      for (const [selector,font,line] of [['.player-content h1','48px','57px'],['.player-content>p','22.5px','36px'],['.player-content button:not([aria-pressed])','24px','33px']]) {
        await page.locator(selector).evaluateAll((elements, sizes) => {
          for (const element of elements) {
            element.style.setProperty('font-size',sizes[0],'important')
            element.style.setProperty('line-height',sizes[1],'important')
          }
        },[font,line])
        await expect(page.locator(selector).first()).toHaveCSS('font-size',font)
      }
      await expect(ratings.first()).toHaveCSS('font-size','25.5px')
    }
    const allRatings = page.locator('button[aria-pressed]')
    async function expectTargetsFit() {
      const geometry = await allRatings.evaluateAll(buttons => buttons.map(button => {
        const box=button.getBoundingClientRect(), row=button.parentElement.getBoundingClientRect()
        const range=document.createRange();range.selectNodeContents(button);const glyph=range.getBoundingClientRect()
        return {insideRow:box.left>=row.left-.5&&box.right<=row.right+.5&&box.left>=0&&box.right<=innerWidth+.5,
          touchTarget:box.width>=44&&box.height>=44,
          glyphFits:glyph.left>=box.left-.5&&glyph.right<=box.right+.5&&glyph.top>=box.top-.5&&glyph.bottom<=box.bottom+.5}
      }))
      expect(geometry,'Every complete rating option must fit a distinct usable target').toEqual(
        Array.from({length:10},()=>({insideRow:true,touchTarget:true,glyphFits:true})))
    }
    await expectTargetsFit()
    const skip=page.getByRole('button',{name:'Skip',exact:true})
    await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled()
    await skip.scrollIntoViewIfNeeded()
    const box=await skip.boundingBox()
    expect(box.y).toBeGreaterThanOrEqual(24)
    expect(box.y+box.height).toBeLessThanOrEqual((width===320?711:844)-48+.5)
    await page.screenshot({path:test.info().outputPath(`${look}-${width}-${size}-rating.png`)})
    await skip.click()
    await expect(page.getByTestId('decision')).toHaveText('skipped')
    await expect(page.locator('button[aria-pressed="false"]')).toHaveCount(10)
    await allRatings.last().focus()
    await page.keyboard.press('Enter')
    await expect(allRatings.last()).toHaveAttribute('aria-pressed','true')
    if (size === 'large') await expect(allRatings.last()).toHaveCSS('font-size','30px')
    await expectTargetsFit()
    await page.getByRole('button',{name:'Continue',exact:true}).click()
    await expect(page.getByTestId('decision')).toHaveText('rating:10')
  })
}
