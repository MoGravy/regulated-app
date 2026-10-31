import test from 'node:test'
import assert from 'node:assert/strict'
import { createListeningAttempt } from './qualifiedListening.js'
import * as api from './qualifiedListening.js'
import { acceptPractice, emptyLedger, loadPractice } from './practiceLedger.js'

const make = (options = {}) => {
  assert.equal(typeof api.createNativeListeningAttempt, 'function', 'native listening accumulator is missing')
  return api.createNativeListeningAttempt({ attemptId: 'a', mediaId: 'm', durationSeconds: 100, ...options })
}
const snapshot = (revision, eligibleSeconds, atMs, extra = {}) => ({
  attemptId: 'a', revision, evidenceSource: 'native-rendered', eligibleSeconds, atMs,
  durationSeconds: 100, qualifiedAtMs: null, offsetMinutes: null, ...extra,
})
test('native seeks and repeated foreground snapshots cannot invent credit', () => {
  const a = make()
  a.consume(snapshot(1, 0, 0))
  a.consume(snapshot(2, 0, 1000, { position: 90, status: 'playing' }))
  a.consume(snapshot(3, 0, 100000, { position: 100, status: 'ended' }))
  assert.equal(a.heardSeconds, 0)
  assert.equal(a.qualified, false)
})
test('background evidence qualifies once at retained native time and timezone', () => {
  const a = make(), time = Date.parse('2026-10-04T00:01:00Z')
  a.consume(snapshot(1, 0, 0))
  const e = a.consume(snapshot(2, 85, 85000, { qualifiedAtMs: time, offsetMinutes: -420 }))
  assert.equal(e.source, 'native-rendered')
  assert.equal(e.localDate, '2026-10-03')
  assert.equal(e.qualifiedAt, new Date(time).toISOString())
  assert.equal(e.heardSeconds, 85)
  assert.equal(a.consume(snapshot(3, 90, 90000, { qualifiedAtMs: time, offsetMinutes: -420 })), null)
  const ledger = acceptPractice(emptyLedger(), e, new Date(time + 1000))
  assert.equal(ledger.events.length, 1)
  assert.equal(acceptPractice(ledger, { ...e, id: 'duplicate' }, new Date(time + 1000)).events.length, 1)
})
test('stale, mismatched, decreasing and implausible native totals earn no additional credit', () => {
  const a = make()
  a.consume(snapshot(1, 0, 0))
  for (const bad of [snapshot(1, 80, 80000), snapshot(2, 80, 80000, { attemptId: 'other' }),
    snapshot(2, 80, 80000, { evidenceSource: 'web-played' }), snapshot(2, 80, 1000),
    snapshot(2, -1, 1000), snapshot(2, 1, -1000)]) assert.equal(a.consume(bad), null)
  assert.equal(a.heardSeconds, 0)
  a.consume(snapshot(3, 20, 20000))
  a.consume(snapshot(4, 10, 30000))
  assert.equal(a.heardSeconds, 20)
})
test('retry keeps prior credit without counting the same native cumulative evidence twice', () => {
  const a = make({ heardSeconds: 50 })
  a.consume(snapshot(1, 0, 0))
  const time = Date.parse('2026-10-04T01:00:00Z')
  const e = a.consume(snapshot(2, 30, 30000, { qualifiedAtMs: time, offsetMinutes: 0 }))
  assert.equal(e.heardSeconds, 80)
  assert.equal(a.consume(snapshot(3, 30, 30000)), null)
  assert.equal(a.heardSeconds, 80)
})
test('short tracks and native evidence without a valid qualification clock do not award a day', () => {
  const a = make({ durationSeconds: 30 })
  a.consume(snapshot(1, 0, 0, { durationSeconds: 30 }))
  assert.equal(a.consume(snapshot(2, 90, 90000, { durationSeconds: 30 })), null)
  const b = make()
  b.consume(snapshot(1, 0, 0))
  assert.equal(b.consume(snapshot(2, 80, 80000)), null)
  assert.equal(b.qualified, false)
})
test('web ledger validates local date using the timezone offset sign', () => {
  const a = createListeningAttempt({ attemptId: 'a', mediaId: 'm', durationSeconds: 100 })
  a.consume({ attemptId: 'a', revision: 1, position: 0, status: 'playing', played: [], atMs: 0 })
  const event = a.consume({ attemptId: 'a', revision: 2, position: 80, status: 'playing', played: [[0, 80]], atMs: 80000 }, new Date('2026-02-28T23:59:00Z'))
  const e = { ...event, qualifiedAt: '2026-03-01T06:59:00.000Z', offsetMinutes: -420, localDate: '2026-02-28' }
  assert.equal(acceptPractice(emptyLedger(), e, new Date('2026-03-01T07:00:00Z')).events.length, 1)
  const storage = { getItem: key => key === 'regulated_practice_days' ? '["2026-02-28"]' : null }
  assert.deepEqual(loadPractice(storage, 'guest').ledger.legacyDays, ['2026-02-28'])
})
