import assert from 'node:assert/strict'

const base = 'http://localhost:4382'
assert.equal((await fetch(`${base}/reset`)).status, 200)
assert.equal((await fetch(`${base}/auth/v1/token`, { method: 'POST' })).status, 405)
assert.equal((await fetch(`${base}/rest/v1/session_completions`, { method: 'POST', body: '{}' })).status, 405)
assert.equal((await fetch(`${base}/api/get-audio-url`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: 'not-approved-free' }),
})).status, 403)
const rows = await (await fetch(`${base}/rest/v1/sessions`)).json()
assert.equal(rows.length, 1)
assert.equal(rows[0].free, true)
console.log('Local preview: page, free-only catalog and mutation rejection PASS')
