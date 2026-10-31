import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptPractice, checkpointAttempt, emptyLedger } from './practiceLedger.js'
const api = await import('./playbackPractice.js').catch(() => ({}))
const make = (native = true) => {
  assert.equal(typeof api.createPlaybackPractice, 'function', 'owner-scoped practice integration is missing')
  let ledger = emptyLedger(), currentScope = 'guest', awards = 0
  const owner = api.createPlaybackPractice({ native, mediaId: 'm', prior: { scope: 'guest', attemptId: 'a', heardSeconds: 0 },
    updatePractice(scope, attempt, event) {
      if (scope !== currentScope) return
      ledger = checkpointAttempt(event ? acceptPractice(ledger, event) : ledger, attempt)
    }, onQualified() { awards++ },
  })
  return { owner, get ledger() { return ledger }, get awards() { return awards }, changeScope() { currentScope = 'other' } }
}
const native = (revision, seconds, extra = {}) => ({ token: 'owner', sessionId: 'm', revision,
  duration: 100, atMs: seconds * 1000, evidenceSource: 'native-rendered', eligibleSeconds: seconds,
  lastRenderedAtMs: Date.now(), qualifiedAtMs: seconds >= 80 ? Date.now() : null, offsetMinutes: 0, ...extra })
test('final close preserves verified progress but rejects later and wrong-owner snapshots', () => {
  const f = make()
  f.owner.receive(native(1, 0))
  f.owner.receive(native(2, 20, { token: 'stale' }))
  f.owner.receive(native(3, 20, { sessionId: 'other' }))
  assert.equal(Object.keys(f.ledger.attempts).length, 1)
  f.owner.close(native(4, 20))
  assert.equal(f.ledger.attempts.m.heardSeconds, 20)
  f.owner.receive(native(5, 90))
  assert.equal(f.ledger.events.length, 0)
})
test('background qualification, repeat callbacks and natural close award only once', () => {
  const f = make()
  f.owner.receive(native(1, 0))
  f.owner.receive(native(2, 80))
  f.owner.receive(native(3, 90))
  f.owner.close(native(4, 100))
  assert.equal(f.ledger.events.length, 1)
  assert.equal(f.awards, 1)
  assert.deepEqual(f.ledger.attempts, {})
})
test('late cleanup cannot write the old attempt to the changed scope', () => {
  const f = make()
  f.owner.receive(native(1, 0))
  const before = f.ledger
  f.changeScope()
  f.owner.close(native(2, 80))
  assert.equal(f.ledger, before)
})
test('web seeks and muted intervals are distinct from rendered listening', () => {
  const f = make(false)
  const web = (revision, position, extra = {}) => ({ token: 'owner', sessionId: 'm', revision,
    position, duration: 100, atMs: revision * 1000, status: 'playing', played: [], volume: 1, rate: 1, ...extra })
  f.owner.receive(web(1, 0))
  f.owner.receive(web(2, 80, { seeking: true, played: [[80, 80]] }))
  f.owner.receive(web(3, 80))
  f.owner.receive(web(4, 80, { muted: true }))
  f.owner.close(web(5, 80, { muted: true }))
  assert.equal(f.ledger.attempts.m.heardSeconds, 0)
  assert.equal(f.ledger.events.length, 0)
})
