import assert from 'node:assert/strict'
import { GoTrueClient } from '@supabase/auth-js'
import { emailConfirmation } from '../src/lib/signInFlow.js'

// Test-only values and mocked transport. No email or remote auth requests.
const hash = '#token_hash=test_confirmation_token_123456&type=email'
globalThis.window = { location: { href: `https://app.example/signin?next=%2Fcare${hash}` } }
globalThis.document = {}
const storage = new Map()
const requests = []
const client = new GoTrueClient({
  url: 'https://auth.example', storageKey: 'confirmation-check',
  autoRefreshToken: false, persistSession: true, detectSessionInUrl: true,
  storage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    return new Response(JSON.stringify({
      access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600,
      token_type: 'bearer', user: { id: 'test-user', email: 'owner@example.com' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
assert.equal((await client.initialize()).error, null)
assert.equal(requests.length, 0, 'Opening/scanning the link must not consume it')
assert.equal((await client.getSession()).data.session, null)
const result = await client.verifyOtp(emailConfirmation(hash))
assert.equal(result.error, null)
assert.equal(requests.length, 1)
assert.equal(requests[0].url, 'https://auth.example/verify')
assert.deepEqual(requests[0].body, { token_hash: 'test_confirmation_token_123456', type: 'email', gotrue_meta_security: {} })
assert.equal((await client.getSession()).data.session.user.id, 'test-user')
const codeResult = await client.verifyOtp({ email: 'owner@example.com', token: '123456', type: 'email' })
assert.equal(codeResult.error, null)
assert.equal(requests.length, 2)
assert.deepEqual(requests[1].body, { email: 'owner@example.com', token: '123456', type: 'email', gotrue_meta_security: {} })
assert.equal((await client.getSession()).data.session.user.email, 'owner@example.com')
await client.stopAutoRefresh()
client.broadcastChannel?.close()
console.log('Real Auth SDK: opening leaves token unused; explicit verification saves session PASS')
