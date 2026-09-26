import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeAuthCode, NATIVE_AUTH_REDIRECT } from './nativeAuthUrl.js'

test('only the registered auth link supplies a code', () => {
  assert.equal(nativeAuthCode(`${NATIVE_AUTH_REDIRECT}?code=one-time-code`), 'one-time-code')
  assert.equal(nativeAuthCode('co.regulatedapp.app://other?code=one-time-code'), null)
  assert.equal(nativeAuthCode('https://regulatedapp.co/auth?code=one-time-code'), null)
  assert.equal(nativeAuthCode('bad url'), null)
})
