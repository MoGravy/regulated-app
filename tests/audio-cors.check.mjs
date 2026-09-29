import assert from 'node:assert/strict'
import test from 'node:test'

const base = new URL(process.argv[2])
assert(['https:', 'http:'].includes(base.protocol), 'Pass an HTTP(S) base URL')
assert(!base.username && !base.password && !base.search && !base.hash, 'Use a base URL without credentials, query or fragment')
const endpoint = new URL('/api/get-audio-url', base)
const website = 'https://regulatedapp.co'
const cases = [
  ['iOS', 'capacitor://localhost', 'capacitor://localhost'],
  ['Android HTTP', 'http://localhost', 'http://localhost'],
  ['Android HTTPS', 'https://localhost', 'https://localhost'],
  ['website', website, website],
  ['unknown', 'https://other.example', website],
  ['null', 'null', website],
  ['iOS suffix', 'capacitor://localhost.evil.example', website],
  ['HTTP suffix', 'http://localhost.evil.example', website],
  ['HTTPS suffix', 'https://localhost.evil.example', website],
  ['no origin', undefined, website],
]

for (const [label, origin, expectedOrigin] of cases) {
  for (const method of ['OPTIONS', 'POST']) {
    await test(`${label} ${method}`, async () => {
      const headers = origin ? { Origin: origin } : {}
      if (method === 'OPTIONS') {
        headers['Access-Control-Request-Method'] = 'POST'
        headers['Access-Control-Request-Headers'] = 'content-type,authorization'
      } else {
        headers['Content-Type'] = 'application/json'
      }
      const response = await fetch(endpoint, {
        method,
        headers,
        ...(method === 'POST' ? { body: '{}' } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      })
      await response.body?.cancel()
      assert.equal(response.status, method === 'OPTIONS' ? 200 : 400, 'Empty request status')
      assert.equal(response.headers.get('access-control-allow-origin'), expectedOrigin, 'Allowed origin')
      const methods = response.headers.get('access-control-allow-methods')?.split(/\s*,\s*/)
      assert(methods?.includes('POST') && methods.includes('OPTIONS'), 'POST and OPTIONS remain allowed')
      const allowedHeaders = response.headers.get('access-control-allow-headers')?.toLowerCase().split(/\s*,\s*/)
      assert(allowedHeaders?.includes('authorization') && allowedHeaders.includes('content-type'), 'JSON and bearer headers remain allowed')
      assert(response.headers.get('vary')?.toLowerCase().split(/\s*,\s*/).includes('origin'), 'Cache varies by origin')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
      assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
    })
  }
}
