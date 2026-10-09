import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('./practiceLedger.js').catch(() => ({}))
const now = new Date('2026-10-03T12:00:00Z')
const event = (id, day) => ({ schemaVersion: 1, id, attemptId: id, mediaId: 'reset', heardSeconds: 80, durationSeconds: 100, qualifiedAt: `${day}T12:00:00Z`, localDate: day, offsetMinutes: 0, source: 'web-played' })
function memory() {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
}

test('unique practice dates bridge one missed day, end after two and retain earned history', () => {
  assert.equal(typeof api.emptyLedger, 'function', 'practice ledger is missing')
  let ledger = api.emptyLedger()
  for (const day of ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02']) {
    ledger = api.acceptPractice(ledger, event(day, day), new Date(`${day}T12:00:00Z`))
  }
  ledger = api.acceptPractice(ledger, event('other-track', '2026-10-02'), now)
  ledger = api.acceptPractice(ledger, event('other-track', '2026-10-02'), now)
  const p = api.projectPractice(ledger, now)
  assert.equal(p.days, 7)
  assert.equal(p.currentRun, 7)
  assert.equal(p.best, 7)
  assert.deepEqual(p.awards, [7])
  const later = api.projectPractice(ledger, new Date('2026-10-05T12:00:00Z'))
  assert.equal(later.currentRun, 0)
  assert.equal(later.best, 7)
  assert.deepEqual(later.awards, [7])
})

test('all milestone thresholds use unique cumulative dates', () => {
  let ledger = api.emptyLedger()
  const end = new Date('2026-10-03T12:00:00Z')
  for (let i = 99; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000)
    const day = d.toISOString().slice(0, 10)
    ledger = api.acceptPractice(ledger, event(day, day), d)
  }
  assert.deepEqual(api.projectPractice(ledger, now).awards, [7, 20, 50, 100])
})

test('legacy import retains four-am provenance, is idempotent and never claims another identity', () => {
  const store = memory()
  const legacy = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10))
  store.setItem('regulated_practice_days', JSON.stringify(legacy))
  const old = store.getItem('regulated_practice_days')
  const guest = api.loadPractice(store, 'guest').ledger
  assert.equal(guest.legacyDays.length, 400)
  assert.equal(guest.legacyRolloverHours, 4)
  assert.equal(api.projectPractice(guest, now).legacyMinimum, true)
  assert.equal(api.savePractice(store, 'guest', guest), true)
  assert.equal(api.loadPractice(store, 'guest').ledger.legacyDays.length, 400)
  assert.equal(api.loadPractice(store, 'user-a').ledger.legacyDays.length, 0)
  assert.equal(api.loadPractice(store, 'user-b').ledger.events.length, 0)
  assert.equal(store.getItem('regulated_practice_days'), old)
})

test('corrupt and quota-blocked storage recovers in memory without overwriting original data', () => {
  const store = memory()
  const key = api.practiceKey('user-a')
  store.setItem(key, 'broken-json')
  const loaded = api.loadPractice(store, 'user-a')
  assert.equal(loaded.storageOK, false)
  assert.equal(loaded.ledger.events.length, 0)
  assert.equal(api.savePractice(store, 'user-a', loaded.ledger), false)
  assert.equal(store.getItem(key), 'broken-json')
  assert.equal(api.savePractice({ getItem: () => null, setItem: () => { throw Error('quota') } }, 'guest', api.emptyLedger()), false)
})

test('unqualified/invalid events are rejected and late offline events cannot revive an ended run', () => {
  let ledger = api.emptyLedger()
  ledger = api.acceptPractice(ledger, { ...event('bad', '2026-10-03'), heardSeconds: 2 }, now)
  assert.equal(ledger.events.length, 0)
  ledger = api.acceptPractice(ledger, event('old', '2026-09-20'), now)
  assert.equal(api.projectPractice(ledger, now).days, 1)
  assert.equal(api.projectPractice(ledger, now).currentRun, 0)
  ledger = api.acceptPractice(ledger, event('fresh', '2026-10-03'), now)
  assert.equal(api.projectPractice(ledger, now).days, 2)
  assert.equal(api.projectPractice(ledger, now).currentRun, 1)
})

test('retry credit merges only same-track unqualified listening within ten minutes', () => {
  let ledger = api.emptyLedger()
  ledger = api.checkpointAttempt(ledger, { mediaId: 'reset', attemptId: 'a', heardSeconds: 50, durationSeconds: 100, updatedAt: now.getTime(), qualified: false })
  assert.equal(api.retryCredit(ledger, 'reset', now.getTime() + 600000).heardSeconds, 50)
  assert.equal(api.retryCredit(ledger, 'reset', now.getTime() + 600001), null)
  assert.equal(api.retryCredit(ledger, 'other', now.getTime()), null)
  assert.equal(api.retryCredit(ledger, 'reset', now.getTime() - 1), null)
  ledger = api.checkpointAttempt(ledger, { mediaId: 'reset', attemptId: 'a', heardSeconds: 80, durationSeconds: 100, updatedAt: now.getTime(), qualified: true })
  assert.equal(api.retryCredit(ledger, 'reset', now.getTime()), null)
})

test('invalid saved retry entries stay untouched and short media cannot enter the ledger', () => {
  const store = memory()
  const key = api.practiceKey('guest')
  for (const attempts of [{ reset: null }, [], { reset: { mediaId: 'reset', heardSeconds: -1 } }]) {
    const raw = JSON.stringify({ ...api.emptyLedger(), attempts })
    store.setItem(key, raw)
    assert.equal(api.loadPractice(store, 'guest').storageOK, false)
    assert.equal(api.savePractice(store, 'guest', api.emptyLedger()), false)
    assert.equal(store.getItem(key), raw)
  }
  const ledger = api.acceptPractice(api.emptyLedger(), { ...event('short', '2026-10-03'), durationSeconds: 30, heardSeconds: 60 }, now)
  assert.equal(ledger.events.length, 0)
})
