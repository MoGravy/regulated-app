import assert from 'node:assert/strict'
import handler, { canManageCare } from '../api/care-connect.js'

process.env.SUPABASE_URL = 'https://fake-project.example.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-test-service-key'
process.env.CARE_PRACTITIONER_EMAIL = 'owner@example.test'
let user = { id: 'owner-id', email: 'owner@example.test', email_confirmed_at: '2026-01-01' }
assert.equal(canManageCare({ ...user, email_confirmed_at: null }, 'owner@example.test'), false)
assert.equal(canManageCare({ ...user, email: 'other@example.test' }, 'owner@example.test'), false)
assert.equal(canManageCare(user, ''), false)
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ path: new URL(url).pathname, body: options.body && JSON.parse(options.body) })
  return new Response(JSON.stringify(String(url).includes('/auth/') ? user : true), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
async function call(req) {
  const res = { code: null, body: null, setHeader() {}, status(code) { this.code = code; return this },
    json(body) { this.body = body; return this }, end() { return this } }
  await handler(req, res)
  return res
}
assert.equal((await call({ method: 'POST', headers: {} })).code, 401)
user = { ...user, email: 'other@example.test' }
assert.equal((await call({ method: 'POST', headers: { authorization: 'Bearer fake-test-token' }, body: { email: 'client@example.test', label: 'Fake client' } })).code, 403)
assert.equal(calls.some(call => call.path.includes('/rpc/')), false)
user.email = 'owner@example.test'
const result = await call({ method: 'POST', headers: { authorization: 'Bearer fake-test-token' },
  body: { email: 'client@example.test', label: 'Fake client', practitioner: 'impostor' } })
assert.equal(result.code, 200)
assert.equal(calls.at(-1).body.practitioner, 'owner-id')
console.log('care connection authentication, owner-only access and forged identity checks passed')
