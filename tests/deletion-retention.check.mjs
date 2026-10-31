import assert from 'node:assert/strict'
import { assessClinicalRetention } from '../scripts/deletion-retention.mjs'

const adult = { lastContactDate: '2019-09-29', dateOfBirth: '1980-04-12', everSeenAsMinor: false }
const assess = (facts = adult, asOf = '2026-09-30') => assessClinicalRetention(facts, asOf)
assert.deepEqual(assess(), { status: 'eligible', holdThroughDate: '2026-09-29' })
assert.deepEqual(assess({ lastContactDate: adult.lastContactDate, everSeenAsMinor: false }), { status: 'eligible', holdThroughDate: '2026-09-29' })
assert.deepEqual(assess(adult, '2026-09-28'), { status: 'held', holdThroughDate: '2026-09-29' })
assert.deepEqual(assess(adult, '2026-09-29'), { status: 'held', holdThroughDate: '2026-09-29' })
assert.deepEqual(assess({ ...adult, lastContactDate: '2020-09-29' }), { status: 'held', holdThroughDate: '2027-09-29' })

const minor = { lastContactDate: '2019-09-29', dateOfBirth: '2010-04-12', everSeenAsMinor: true }
assert.deepEqual(assess(minor), { status: 'held', holdThroughDate: '2035-04-12' })
assert.equal(assess(minor, '2035-04-12').status, 'held')
assert.equal(assess(minor, '2035-04-13').status, 'eligible')
assert.deepEqual(assess({ ...minor, lastContactDate: '2034-01-01' }, '2035-04-13'), { status: 'held', holdThroughDate: '2041-01-01' })
assert.deepEqual(assess({ ...adult, lastContactDate: '2020-02-29' }, '2027-02-28'), { status: 'held', holdThroughDate: '2027-03-01' })
assert.equal(assess({ ...adult, lastContactDate: '2020-02-29' }, '2027-03-01').status, 'held')
assert.equal(assess({ ...adult, lastContactDate: '2020-02-29' }, '2027-03-02').status, 'eligible')
assert.deepEqual(assess({ ...minor, dateOfBirth: '2004-02-29' }, '2029-03-01'), { status: 'held', holdThroughDate: '2029-03-01' })
assert.equal(assess({ ...minor, dateOfBirth: '2004-02-29' }, '2029-03-02').status, 'eligible')

for (const field of ['lastContactDate', 'dateOfBirth']) {
  for (const value of [undefined, null, '', 123, '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01', '2026-9-01', ' 2020-01-01', '2020-01-01T00:00:00Z', '2030-01-01']) {
    if (field === 'dateOfBirth' && value === undefined) continue
    assert.equal(assess({ ...adult, [field]: value }).status, 'review_required', `${field} rejects ${String(value)}`)
  }
}
for (const value of [undefined, null, 0, 1, 'false', 'true']) {
  assert.equal(assess({ ...adult, everSeenAsMinor: value }).status, 'review_required')
}
for (const value of [undefined, null, '', '2026-02-29', '2026-09-30T00:00:00Z']) {
  assert.equal(assessClinicalRetention(adult, value).status, 'review_required')
}
for (const value of [undefined, null, [], {}, false]) {
  assert.equal(assessClinicalRetention(value, '2026-09-30').status, 'review_required')
}
assert.equal(assess({ ...minor, everSeenAsMinor: false }).status, 'review_required')
assert.equal(assess({ ...minor, dateOfBirth: undefined }).status, 'review_required')
assert.equal(assess({ ...adult, dateOfBirth: '2020-01-01' }).status, 'review_required')
assert.equal(assess({ ...adult, lastContactDate: '9999-01-01' }, '9999-12-31').status, 'review_required')
assert.deepEqual(adult, { lastContactDate: '2019-09-29', dateOfBirth: '1980-04-12', everSeenAsMinor: false })
console.log('PASS clinical retention calendar, strict facts, leap dates and inclusive hold boundaries')
