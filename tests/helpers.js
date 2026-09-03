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

// Safety net for the regression suite: every non-GET call to Supabase REST or
// RPC is answered locally and recorded, so no test can ever write a row to the
// production database. Returns the list of blocked writes for assertions.
export async function noProductionWrites(page) {
  const attempted = []
  await page.route(/\/rest\/v1\/|\/rpc\//, route => {
    const req = route.request()
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.continue()
    attempted.push(`${req.method()} ${new URL(req.url()).pathname}`)
    route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
  })
  return attempted
}

// A premium customer, as the app sees one: an email in localStorage and an
// active row coming back from the subscriptions check. Nothing touches Stripe.
export async function asPremium(page, email = 'premium@example.com') {
  await page.addInitScript(e => {
    localStorage.setItem('regulated_onboarding', 'true')
    localStorage.setItem('regulated_email', JSON.stringify(e))
  }, email)
  await page.route(/\/api\/check-subscription/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ active: true }),
  }))
}

// Silence as a WAV, so the player can run without a signed URL. 8 kHz, 8-bit,
// mono. Half a second reaches "ended" straight away; a longer one leaves room
// to stop partway through.
export function silentWav(seconds = 0.5) {
  const samples = Math.round(8000 * seconds)
  const buf = Buffer.alloc(44 + samples, 128)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(8000, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34)
  buf.write('data', 36); buf.writeUInt32LE(samples, 40)
  return buf
}

// Points the player at the silent WAV instead of /api/get-audio-url.
export async function fakeAudio(page, seconds = 0.5) {
  await page.route('**/fake-audio.wav', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(seconds) }))
  await page.route('**/api/get-audio-url', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/fake-audio.wav' }),
  }))
}

export const KNOWN_KEYS = [
  'regulated_completed', 'regulated_email', 'regulated_onboarding',
  'regulated_mode', 'regulated_program_day', 'regulated_progress',
]

export function storage(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
}
