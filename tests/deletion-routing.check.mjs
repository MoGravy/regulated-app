import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import handler from '../api/care-connect.js'

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
    end() { return this },
  }
}

test('deployment fits the existing twelve-function plan', async () => {
  const files = await readdir(new URL('../api/', import.meta.url))
  assert.ok(files.filter(file => file.endsWith('.js') && !file.startsWith('_')).length <= 12)
})

test('public deletion routes reach their protected handlers without configured credentials', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const cases = [
    ['/api/request-account-deletion', 'GET', 405, 'Method not allowed'],
    ['/api/request-account-deletion', 'POST', 401, 'Sign in required'],
    ['/api/request-account-deletion', 'OPTIONS', 200, undefined],
    ['/api/deletion-alert', 'GET', 401, 'Unauthorized'],
    ['/api/deletion-alert', 'POST', 405, 'Method not allowed'],
  ]
  for (const [path, method, code, error] of cases) {
    const route = config.rewrites.find(rule => rule.source === path)
    assert.ok(route, `Missing route for ${path}`)
    const destination = new URL(route.destination, 'https://example.invalid')
    assert.equal(destination.pathname, '/api/care-connect')
    const res = response()
    await handler({ method, headers: { origin: 'capacitor://localhost' },
      query: Object.fromEntries(destination.searchParams) }, res)
    assert.equal(res.code, code)
    assert.equal(res.body?.error, error)
    assert.equal(res.headers['Cache-Control'], 'no-store')
  }
})
