import { test as base, expect } from '@playwright/test'
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'
import { IS_LOCAL, SUPABASE_URL } from './runtime.js'
import { reset } from './reset-fixture.js'
import program from '../design/program-map.json' with { type: 'json' }

export const CATALOG = HARDCODED_SESSIONS.map(row => ({ ...row, has_audio: true,
  ...(row.id === reset.id ? reset : row.category === 'Daily' ? { title: 'Deep Sleep Reset', category: 'Sleep' } : {}),
}))
for (const day of program.weeks.flatMap(week => week.days)) {
  if (!CATALOG.some(row => row.id === day.session_id)) {
    CATALOG.push({ id: day.session_id, title: day.session_title, category: 'Daily', duration: 20, free: false, has_audio: true })
  }
}

export const test = base.extend({
  context: async ({ context, baseURL }, run) => {
    if (IS_LOCAL) {
      const origin = new URL(baseURL).origin
      await context.route('**/*', async route => {
        const url = new URL(route.request().url())
        const json = body => route.fulfill({ status: 200, json: body })
        if (url.origin === SUPABASE_URL) {
          if (url.pathname === '/rest/v1/sessions') {
            const id = url.searchParams.get('id')?.replace(/^eq\./, '')
            return json(id ? CATALOG.find(row => row.id === id) || null : CATALOG)
          }
          if (url.pathname.startsWith('/rest/v1/')) return json([])
          return route.fulfill({ status: 401, json: { error: 'Local test only' } })
        }
        if (url.origin === 'https://js.stripe.com') {
          return route.fulfill({ contentType: 'application/javascript', body: 'window.Stripe = () => ({})' })
        }
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
        if (url.origin !== origin) return route.abort('blockedbyclient')
        if (url.pathname === '/api/check-subscription') return json({ active: false })
        if (url.pathname === '/api/track') return route.fulfill({ status: 204 })
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: 'No local API fixture' } })
        return route.continue()
      })
    }
    await run(context)
  },
})
export { expect }
