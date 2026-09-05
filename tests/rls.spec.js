import { test, expect } from '@playwright/test'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config/credentials.js'

// Code handoff item 3. Straight to the database with the public key, the
// same way the browser reaches it: the library is readable, orders are not.
test('anon key reads sessions and sees no custom orders', async ({ request }) => {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  const s = await request.get(`${SUPABASE_URL}/rest/v1/sessions?select=id&limit=3`, { headers })
  expect(s.status()).toBe(200)
  expect((await s.json()).length).toBeGreaterThan(0)
  const o = await request.get(`${SUPABASE_URL}/rest/v1/custom_orders?select=id&limit=3`, { headers })
  expect(o.status()).toBe(200)
  expect(await o.json()).toEqual([])
})
