import assert from 'node:assert/strict'
import { emailConfirmation, emailReturnUrl, signInDestination, signInError } from '../src/lib/signInFlow.js'

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

const dummyToken = 'test_confirmation_token_123456'
assert.deepEqual(emailConfirmation(`#token_hash=${dummyToken}&type=email`), { token_hash: dummyToken, type: 'email' })
for (const hash of ['', '#token_hash=short&type=email', `#token_hash=${dummyToken}&type=recovery`, '#access_token=not-a-confirmation']) {
  assert.equal(emailConfirmation(hash), null)
}
assert.equal(emailReturnUrl('https://regulatedapp.co', '/care'), 'https://regulatedapp.co/signin?next=%2Fcare')
assert.equal(emailReturnUrl('https://regulatedapp.co', 'https://evil.example'), 'https://regulatedapp.co/signin?next=%2Fpremium')
console.log('Email confirmation validation and return URLs PASS')
