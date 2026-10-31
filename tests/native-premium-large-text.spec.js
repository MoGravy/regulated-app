import { test, expect } from './fixtures.js'
import { skipOnboarding } from './helpers.js'

for (const look of ['admiralty', 'night']) for (const width of [320, 390]) for (const size of ['standard', 'large']) {
  test(`native Premium keeps complete ${size} sign-in controls separate: ${look} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 711 : 844 })
    await skipOnboarding(page)
    await page.addInitScript(() => { window.androidBridge = {}; window.Capacitor = { isNativePlatform: () => true } })
    await page.goto(`/premium?look=${look}`)
    const subscribe = page.getByRole('button', { name: 'Sign in to subscribe', exact: true })
    const account = page.getByRole('button', { name: 'Sign in to use your subscription on another device. Listening progress is not synced between devices.', exact: true })
    await expect(subscribe).toBeVisible()
    await expect(account).toBeVisible()
    await expect(page.locator('.screen')).toHaveCSS('opacity', '1')
    if (size === 'large') {
      // Browser layout stress for the S21's enlarged controls, not OS emulation.
      for (const button of [subscribe, account]) {
        await button.evaluate(element => {
          element.style.setProperty('font-size', '24px', 'important')
          element.style.setProperty('line-height', '33px', 'important')
        })
        await expect(button).toHaveCSS('font-size', '24px')
      }
    }
    const controls = await Promise.all([subscribe, account].map(button => button.evaluate(element => {
      const box = element.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      return {
        top: box.top, bottom: box.bottom,
        completeTextInside: text.top >= box.top - .5 && text.bottom <= box.bottom + .5
          && text.left >= box.left - .5 && text.right <= box.right + .5,
        sufficientTarget: box.height >= 44,
      }
    })))
    await page.screenshot({ path: test.info().outputPath(`${look}-${width}-${size}-premium.png`) })
    expect(controls.every(control => control.completeTextInside && control.sufficientTarget), 'Complete sign-in text must fit its own touch target').toBe(true)
    expect(controls[0].bottom, 'The two sign-in controls must not overlap').toBeLessThanOrEqual(controls[1].top)
    await subscribe.click()
    await expect(page).toHaveURL(/\/signin$/)
    await page.goBack()
    await expect(account).toBeVisible()
    await account.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/signin$/)
  })
}
