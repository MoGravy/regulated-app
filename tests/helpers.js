import { expect } from '@playwright/test'

export const HAS_API = !!process.env.BASE_URL && !process.env.BASE_URL.includes('localhost')

// Puts the app past onboarding so tests land on the real screens.
export async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('regulated_onboarding', 'true')
  })
}

// Program mode with `daysDone` days already finished. The program ships gated
// behind the content approval, so the preview flag is what makes its screens
// reachable at all — the gated path is asserted separately.
export async function enterProgram(page, daysDone = 0) {
  await page.addInitScript(days => {
    localStorage.setItem('regulated_onboarding', 'true')
    localStorage.setItem('regulated_mode', JSON.stringify('program'))
    localStorage.setItem('regulated_program_day', JSON.stringify(days))
    sessionStorage.setItem('regulated_program_preview', '1')
  }, daysDone)
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
