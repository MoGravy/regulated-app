import assert from 'node:assert/strict'
import test from 'node:test'
import { setNativeCors } from './_native-cors.js'

test('native origins get API headers without reflecting other sites', () => {
  for (const origin of ['capacitor://localhost', 'http://localhost']) {
    const headers = {}
    setNativeCors({ headers: { origin } }, { setHeader: (key, value) => { headers[key] = value } })
    assert.equal(headers['Access-Control-Allow-Origin'], origin)
    assert.match(headers['Access-Control-Allow-Headers'], /Authorization/)
  }

  const headers = {}
  setNativeCors({ headers: { origin: 'https://other.example' } }, { setHeader: (key, value) => { headers[key] = value } })
  assert.equal(headers['Access-Control-Allow-Origin'], undefined)
})
