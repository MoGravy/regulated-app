import { expect } from '@playwright/test'

export const HAS_API = !!process.env.BASE_URL && !process.env.BASE_URL.includes('localhost')

// Puts the app past onboarding so tests land on the real screens.
export async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('regulated_onboarding', 'true')
  })
}

// Collects console errors for a test. Ignores the /api 404s that a local
// static preview cannot serve — those are asserted separately against a
// deployment that does have the functions.
export function watchConsole(page) {
  const errors = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Resource errors carry the failing URL in the message location, not the
    // text, so both have to be checked.
    const from = msg.location()?.url || ''
    if (!HAS_API && (/get-audio-url|\/api\//.test(text) || /\/api\//.test(from))) return
    errors.push(text)
  })
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  return errors
}

export async function expectNoConsoleErrors(errors) {
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
}
