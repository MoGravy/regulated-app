import assert from 'node:assert/strict'
import { test } from 'node:test'

const api = await import('./qualifiedListening.js').catch(() => ({}))
test('practice requires rendered media, not elapsed time or a seek', () => {
  assert.equal(typeof api.createListeningAttempt, 'function', 'listening accumulator is missing')
  const a = api.createListeningAttempt({ attemptId: 'attempt-1', mediaId: 'reset', durationSeconds: 100 })
  const snap = (revision, position, status = 'playing', played = [], atMs = revision * 1000) =>
    a.consume({ attemptId: 'attempt-1', revision, position, status, played, atMs, durationSeconds: 100 }, new Date('2026-10-03T13:00:00Z'))
  snap(1, 0)
  snap(2, 90, 'seeking', [[90, 90]])
  snap(3, 90)
  snap(4, 90, 'paused', [], 300000)
  snap(5, 90, 'buffering', [], 600000)
  assert.equal(a.heardSeconds, 0)
  assert.equal(a.qualified, false)
})

test('verified background progress crosses the actual-duration threshold once', () => {
  const a = api.createListeningAttempt({ attemptId: 'attempt-2', mediaId: 'reset', durationSeconds: 100 })
  const time = new Date(2026, 9, 4, 0, 1)
  a.consume({ attemptId: 'attempt-2', revision: 1, position: 0, status: 'playing', played: [], atMs: 0, durationSeconds: 100 }, time)
  assert.equal(a.consume({ attemptId: 'attempt-2', revision: 2, position: 79, status: 'playing', played: [[0, 79]], atMs: 79000, durationSeconds: 100 }, time), null)
  const event = a.consume({ attemptId: 'attempt-2', revision: 3, position: 80, status: 'playing', played: [[0, 80]], atMs: 80000, durationSeconds: 100 }, time)
  assert.equal(event.heardSeconds, 80)
  assert.equal(event.localDate, '2026-10-04')
  assert.equal(event.offsetMinutes, -time.getTimezoneOffset())
  assert.equal(a.consume({ attemptId: 'attempt-2', revision: 4, position: 100, status: 'ended', played: [[0, 100]], atMs: 100000, durationSeconds: 100 }, time), null)
})

test('stale snapshots, implausible jumps and unverified ranges earn nothing', () => {
  const a = api.createListeningAttempt({ attemptId: 'a', mediaId: 'reset', durationSeconds: 100 })
  a.consume({ attemptId: 'a', revision: 1, position: 0, status: 'playing', played: [], atMs: 0 })
  a.consume({ attemptId: 'other', revision: 2, position: 80, status: 'playing', played: [[0, 80]], atMs: 80000 })
  a.consume({ attemptId: 'a', revision: 1, position: 80, status: 'playing', played: [[0, 80]], atMs: 80000 })
  a.consume({ attemptId: 'a', revision: 2, position: 80, status: 'playing', played: [[0, 80]], atMs: 1000 })
  a.consume({ attemptId: 'a', revision: 3, position: 90, status: 'playing', played: [], atMs: 11000 })
  assert.equal(a.heardSeconds, 0)
})

test('threshold has a sixty-second floor and ten-minute ceiling; retry and loops add only playback', () => {
  assert.equal(api.listeningThreshold(30), 60)
  assert.equal(api.listeningThreshold(100), 80)
  assert.equal(api.listeningThreshold(2000), 600)
  const a = api.createListeningAttempt({ attemptId: 'retry', mediaId: 'reset', durationSeconds: 100, heardSeconds: 50 })
  a.consume({ attemptId: 'retry', revision: 1, position: 0, status: 'playing', played: [], atMs: 0 })
  a.consume({ attemptId: 'retry', revision: 2, position: 20, status: 'playing', played: [[0, 20]], atMs: 20000 })
  a.consume({ attemptId: 'retry', revision: 3, position: 0, status: 'seeking', played: [[0, 20]], atMs: 20000 })
  a.consume({ attemptId: 'retry', revision: 4, position: 0, status: 'playing', played: [[0, 20]], atMs: 20000 })
  assert.equal(a.consume({ attemptId: 'retry', revision: 5, position: 10, status: 'playing', played: [[0, 20]], atMs: 30000 }).heardSeconds, 80)
})

test('tracks shorter than sixty seconds do not qualify even through repeated loops', () => {
  const a = api.createListeningAttempt({ attemptId: 'short', mediaId: 'tiny', durationSeconds: 30, heardSeconds: 60 })
  assert.equal(a.consume({ attemptId: 'short', revision: 1, position: 0, status: 'playing', played: [], atMs: 0 }), null)
})

test('an invalid duration never earns a day and midnight is captured when qualification occurs', () => {
  const a = api.createListeningAttempt({ attemptId: 'midnight', mediaId: 'reset', durationSeconds: NaN })
  const before = new Date(2026, 9, 3, 23, 59, 59)
  const after = new Date(2026, 9, 4, 0, 0, 1)
  a.consume({ attemptId: 'midnight', revision: 1, position: 0, status: 'playing', played: [], atMs: 0 }, before)
  assert.equal(a.consume({ attemptId: 'midnight', revision: 2, position: 79, status: 'playing', played: [[0, 79]], atMs: 79000 }, before), null)
  const e = a.consume({ attemptId: 'midnight', revision: 3, position: 80, status: 'playing', played: [[0, 80]], atMs: 80000, durationSeconds: 100 }, after)
  assert.equal(e.localDate, '2026-10-04')
})
