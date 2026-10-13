import assert from 'node:assert/strict'
import { matthewEnquiryHref } from '../src/lib/matthewEnquiry.js'

const href = matthewEnquiryHref('practitioner@example.com')
const url = new URL(href)
assert.equal(url.protocol, 'mailto:')
assert.equal(url.pathname, 'practitioner@example.com')
assert.equal(url.searchParams.get('subject'), 'One-to-one programme enquiry from Regulated')
assert.equal(url.searchParams.has('body'), false)
for (const invalid of ['', null, 'bad', 'x@example.com\nBcc:other@example.com', 'x@example.com?bcc=other@example.com']) {
  assert.equal(matthewEnquiryHref(invalid), null)
}
console.log('PASS: enquiry destination, subject, no personal-data body and header-injection refusal')
