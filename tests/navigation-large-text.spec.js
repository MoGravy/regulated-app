import { test, expect } from './fixtures.js'
import { skipOnboarding } from './helpers.js'

for (const look of ['admiralty', 'night']) for (const width of [320, 390]) for (const size of ['standard', 'large']) {
  test(`${look}: all five tabs remain reachable with ${size} text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 711 : 844 })
    await skipOnboarding(page)
    await page.goto(`/care?look=${look}`)
    const nav = page.getByRole('navigation', { name: 'Primary', exact: true })
    await expect(nav.getByRole('button')).toHaveCount(5)
    // Reproduce the computed tab typography observed on the S21 at fontScale1.5.
    // This is a browser layout stress case, not Android device emulation.
    async function expectAllTabsFit() {
      if (size === 'large') {
        await nav.getByRole('button').evaluateAll(buttons => {
          for (const button of buttons) {
            button.style.setProperty('font-size', '22.5px', 'important')
            button.style.setProperty('line-height', '32.625px', 'important')
          }
        })
        await expect(nav.getByRole('button').first()).toHaveCSS('font-size', '22.5px')
      }
      const result = await nav.evaluate(element => {
        const navRect = element.getBoundingClientRect()
        return [...element.querySelectorAll(':scope > button')].map(button => {
          const rect = button.getBoundingClientRect()
          const label = button.firstElementChild
          const labelRect = label.getBoundingClientRect()
          const measure = document.createElement('canvas').getContext('2d')
          measure.font = getComputedStyle(label).font
          const longestWord = Math.max(...label.textContent.split(/\s+/).map(word => measure.measureText(word).width))
          return {
            label: label.textContent,
            targetFits: rect.x >= 0 && rect.right <= innerWidth + .5 && rect.y >= navRect.y && rect.bottom <= innerHeight + .5,
            touchTarget: rect.width >= 44 && rect.height >= 44,
            wholeWordsFit: longestWord <= label.clientWidth + 1,
            textFits: label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1
              && labelRect.x >= rect.x && labelRect.right <= rect.right + .5 && labelRect.bottom <= rect.bottom + .5,
          }
        })
      })
      expect(result.map(row => row.label)).toEqual(['Today', 'Browse', 'My courses', 'Support', 'You'])
      expect(result, 'All tab targets and complete labels must fit without changing the user text size')
        .toEqual(result.map(row => ({ ...row, targetFits: true, touchTarget: true, wholeWordsFit: true, textFits: true })))
    }

    await expectAllTabsFit()
    await page.screenshot({ path: test.info().outputPath(`${look}-${width}-${size}-support.png`) })
    await nav.getByRole('button', { name: 'You', exact: true }).click()
    await expect(page).toHaveURL(/\/premium(?:\?|$)/)
    await expect(nav.getByRole('button', { name: 'You', exact: true })).toHaveAttribute('aria-current', 'page')
    await expectAllTabsFit()
    await nav.getByRole('button', { name: 'Support', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/care(?:\?|$)/)
  })
}
