import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeAttempt, webAttempt } from './sessionPlayback.js'

const source = token => ({ token, sessionId: token, title: 'Test', url: 'https://example.test/audio' })
function bridgeFixture() {
  const listeners = new Set()
  let state
  let removed = 0
  const calls = []
  const bridge = {
    async addListener(name, fn) { listeners.add(fn); return { remove: async () => { removed++; listeners.delete(fn) } } },
    async open(input) { calls.push(['open', input.token]); return state = { token: input.token, revision: 1, status: 'paused', position: 0 } },
    async command(input) { calls.push([input.action, input.token]); return { ...state, revision: ++state.revision } },
    async snapshot() { return { ...state, revision: ++state.revision } },
    async close(input) { calls.push(['close', input.token]); return input.token === state?.token ? { ...state, position: 27 } : {} },
  }
  return { bridge, calls, emit: data => listeners.forEach(fn => fn(data)), end: () => { state.outcome = { kind: 'ended', serial: 1 }; state.status = 'ended' }, get removed() { return removed } }
}

test('StrictMode cleanup cannot open or stop its replacement and saves native position', async () => {
  const fixture = bridgeFixture()
  const updates = [], closed = []
  const first = nativeAttempt(fixture.bridge, source('first'), s => updates.push(s), assert.fail, s => closed.push(s))
  const disposal = first.close()
  const second = nativeAttempt(fixture.bridge, source('second'), s => updates.push(s), assert.fail, s => closed.push(s))
  await disposal
  await second.ready
  await first.command('pause')
  assert.deepEqual(fixture.calls, [['close', 'first'], ['open', 'second']])
  await second.close()
  assert.equal(closed[0].position, 27)
  assert.equal(fixture.removed, 1)
})

test('old token and revision are ignored; foreground snapshot recovers retained natural end', async () => {
  const fixture = bridgeFixture()
  const updates = []
  const owner = nativeAttempt(fixture.bridge, source('current'), s => updates.push(s), assert.fail, () => {})
  await owner.ready
  fixture.emit({ token: 'old', revision: 500, outcome: { kind: 'ended' } })
  fixture.emit({ token: 'current', revision: 0, outcome: { kind: 'ended' } })
  assert.equal(updates.length, 1)
  fixture.end()
  await owner.refresh()
  assert.equal(updates.at(-1).outcome.kind, 'ended')
  await owner.close()
  fixture.emit({ token: 'current', revision: 1000 })
  assert.equal(updates.length, 2)
})

test('cleanup while listener registration waits never opens audio and removes the listener', async () => {
  let release
  const fixture = bridgeFixture()
  const original = fixture.bridge.addListener
  fixture.bridge.addListener = async (...args) => { await new Promise(resolve => { release = resolve }); return original(...args) }
  const owner = nativeAttempt(fixture.bridge, source('a'), assert.fail, assert.fail, () => {})
  await Promise.resolve()
  const closed = owner.close()
  release()
  await closed
  assert.deepEqual(fixture.calls, [['close', 'a']])
  assert.equal(fixture.removed, 1)
})

class AudioFake extends EventTarget {
  currentTime = 0
  duration = 60
  paused = true
  readyState = 4
  play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  removeAttribute() {}
  load() {}
}

test('web pause, seek to end, failure and teardown cannot complete; natural end can', () => {
  const audio = new AudioFake(), states = [], failures = [], closed = []
  const owner = webAttempt(audio, source('web'), s => states.push(s), () => failures.push(true), s => closed.push(s))
  owner.command('play')
  owner.command('seek', 60)
  audio.dispatchEvent(new Event('ended'))
  assert.equal(states.at(-1).outcome, null)
  assert.equal(audio.paused, true)
  owner.command('seek', 10)
  owner.command('play')
  owner.command('pause')
  assert.equal(states.at(-1).outcome, null)
  audio.dispatchEvent(new Event('error'))
  assert.equal(failures.length, 1)
  audio.currentTime = 60
  audio.dispatchEvent(new Event('ended'))
  assert.equal(states.at(-1).outcome.kind, 'error')
  owner.close()
  assert.equal(closed[0].position, 60)
  const count = states.length
  audio.dispatchEvent(new Event('ended'))
  assert.equal(states.length, count)
})

test('web natural end retains completion', () => {
  const audio = new AudioFake(), states = []
  const owner = webAttempt(audio, source('natural'), s => states.push(s), assert.fail, () => {})
  owner.command('play')
  audio.currentTime = 60
  audio.dispatchEvent(new Event('ended'))
  assert.equal(states.at(-1).outcome.kind, 'ended')
  owner.command('play')
  assert.equal(states.at(-1).outcome.serial, 1)
  owner.close()
})
