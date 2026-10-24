import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Exercise the real request function with disposable auth and HTTP fixtures.
const source = readFileSync(new URL('../src/lib/carePush.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './supabase'", 'const supabase = globalThis.careAuthFixture')
let refreshes = 0
let refreshedUser = 'client-a'
globalThis.careAuthFixture = { auth: {
  getSession: async () => ({ data: { session: { access_token: 'old', user: { id: 'client-a' } } } }),
  refreshSession: async () => {
    refreshes++
    return { data: { session: { access_token: 'new', user: { id: refreshedUser } } } }
  },
} }
const { carePushRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
let requests = []
let statuses = []
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options })
  const status = statuses.shift()
  return { status, ok: status === 200, json: async () => ({ configured: true }) }
}
function reset(next) { requests = []; refreshes = 0; refreshedUser = 'client-a'; statuses = [...next] }

reset([401, 200])
assert.deepEqual(await carePushRequest(), { configured: true })
assert.equal(refreshes, 1)
assert.deepEqual(requests.map(r => r.headers.Authorization), ['Bearer old', 'Bearer new'])

reset([401, 200])
await carePushRequest('dispatch')
assert.equal(requests[1].method, 'POST')
assert.equal(requests[1].body, requests[0].body)

reset([401, 401])
await assert.rejects(carePushRequest())
assert.equal(requests.length, 2)
assert.equal(refreshes, 1)

reset([500])
await assert.rejects(carePushRequest())
assert.equal(refreshes, 0)
assert.equal(requests.length, 1)

reset([401])
refreshedUser = 'client-b'
await assert.rejects(carePushRequest('dispatch'))
assert.equal(requests.length, 1, 'Never replay an action under another account')

reset([401])
refreshedUser = null
await assert.rejects(carePushRequest())
assert.equal(requests.length, 1)
console.log('care push session: six recovery and isolation checks passed')
