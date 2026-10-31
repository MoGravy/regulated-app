import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { setNativeCors } from './_native-cors.js'

test('native origins get API headers without reflecting other sites', () => {
  for (const origin of ['capacitor://localhost', 'http://localhost', 'https://localhost']) {
    const headers = {}
    setNativeCors({ headers: { origin } }, { setHeader: (key, value) => { headers[key] = value } })
    assert.equal(headers['Access-Control-Allow-Origin'], origin)
    assert.match(headers['Access-Control-Allow-Headers'], /Authorization/)
  }

  const headers = {}
  setNativeCors({ headers: { origin: 'https://other.example' } }, { setHeader: (key, value) => { headers[key] = value } })
  assert.equal(headers['Access-Control-Allow-Origin'], undefined)
})

test('deployment headers preserve native access only on the six native API routes', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const routes = ['get-audio-url', 'check-subscription', 'validate-coupon', 'request-account-deletion', 'waitlist', 'track']
  for (const path of [...routes, 'deliver-audio', 'create-checkout', 'get-audio-url/other']) {
    for (const origin of ['capacitor://localhost', 'http://localhost', 'https://localhost', 'https://other.example', 'capacitor://localhost.evil.example']) {
      const headers = {}
      for (const rule of config.headers) {
        if (!new RegExp(`^${rule.source}$`).test(`/api/${path}`)) continue
        if (rule.has && !rule.has.every(condition => condition.type === 'header' && condition.key === 'origin' && new RegExp(condition.value).test(origin))) continue
        Object.assign(headers, Object.fromEntries(rule.headers.map(header => [header.key, header.value])))
      }
      const native = ['capacitor://localhost', 'http://localhost', 'https://localhost'].includes(origin)
      assert.equal(headers['Access-Control-Allow-Origin'], routes.includes(path) && native ? origin : 'https://regulatedapp.co', `${path} ${origin}`)
      assert.equal(headers['Vary'], 'Origin')
      assert.equal(headers['X-Frame-Options'], 'DENY')
      assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    }
  }
})
