import assert from 'node:assert/strict'
import { signInDestination, signInError } from '../src/lib/signInFlow.js'

for (const path of ['/care', '/courses', '/dap', '/courses/0a02caf8-5050-571c-9a70-e2bcda2253a3']) {
  assert.equal(signInDestination(path), path)
}
for (const path of ['https://evil.example', '//evil.example', '/courses/../../admin', '/care?redirect=https://evil.example', '', null]) {
  assert.equal(signInDestination(path), '/premium')
}
assert.match(signInError({ code: 'otp_expired' }, true), /expired or was already used/)
assert.match(signInError({ details: { code: 'otp_expired' } }, true), /newest link once/)
assert.equal(signInError({ code: 'over_email_send_rate_limit' }), 'We cannot send another email right now.')
assert.equal(signInError({ status: 429 }), 'We cannot send another email right now.')
const untrusted = { message: 'Private token or provider detail', code: 'unknown' }
assert.equal(signInError(untrusted, true), 'This sign-in link did not work. Please try signing in again.')
assert.equal(signInError(untrusted), 'We could not complete your request. Please try again.')
console.log('Sign-in destinations and safe failure messages PASS')
