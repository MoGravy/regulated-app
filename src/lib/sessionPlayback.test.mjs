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
  assert.equal(updates[0].played, undefined, 'native snapshots must not invent browser playback evidence')
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
  seeking = false
  muted = false
  volume = 1
  playbackRate = 1
  ranges = []
  get played() {
    return { length: this.ranges.length, start: i => this.ranges[i][0], end: i => this.ranges[i][1] }
  }
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

test('pausing a pending play for seek-to-end does not turn normal cancellation into an error', async () => {
  class PendingAudio extends AudioFake {
    play() {
      this.paused = false
      this.dispatchEvent(new Event('play'))
      return new Promise((_resolve, reject) => { this.rejectPlay = reject })
    }
    pause() { super.pause(); this.rejectPlay?.(new DOMException('Cancelled play', 'AbortError')) }
  }
  const audio = new PendingAudio(), states = [], failures = []
  const owner = webAttempt(audio, source('pending'), s => states.push(s), () => failures.push(true), () => {})
  owner.command('play')
  owner.command('seek', 60)
  await Promise.resolve()
  assert.equal(failures.length, 0)
  assert.equal(states.at(-1).outcome, null)
  assert.equal(audio.paused, true)
  owner.close()
})

test('web evidence copies rendered ranges and publishes seek, mute and rate boundaries', () => {
  const audio = new AudioFake(), states = [], closed = []
  const owner = webAttempt(audio, source('evidence'), s => states.push(s), assert.fail, s => closed.push(s))
  owner.command('play')
  audio.currentTime = 5
  audio.ranges = [[0, 5]]
  audio.dispatchEvent(new Event('timeupdate'))
  const rendered = states.at(-1)
  assert.deepEqual(rendered.played, [[0, 5]])
  assert.equal(rendered.seeking, false)
  assert.equal(rendered.muted, false)
  assert.equal(rendered.volume, 1)
  assert.equal(rendered.rate, 1)
  assert.ok(Number.isFinite(rendered.atMs))
  audio.ranges[0][1] = 9
  assert.deepEqual(rendered.played, [[0, 5]], 'later media changes cannot rewrite earlier evidence')
  audio.seeking = true
  audio.currentTime = 40
  audio.dispatchEvent(new Event('seeking'))
  assert.equal(states.at(-1).seeking, true)
  audio.seeking = false
  audio.dispatchEvent(new Event('seeked'))
  assert.equal(states.at(-1).seeking, false)
  audio.muted = true
  audio.volume = 0
  audio.dispatchEvent(new Event('volumechange'))
  assert.equal(states.at(-1).muted, true)
  assert.equal(states.at(-1).volume, 0)
  assert.equal(states.at(-1).status, 'playing', 'muting does not change the playback controls')
  audio.playbackRate = 2
  audio.dispatchEvent(new Event('ratechange'))
  assert.equal(states.at(-1).rate, 2)
  assert.ok(states.at(-1).atMs >= rendered.atMs)
  audio.readyState = 2
  audio.dispatchEvent(new Event('waiting'))
  assert.equal(states.at(-1).status, 'buffering')
  owner.command('pause')
  assert.equal(states.at(-1).status, 'paused')
  owner.close()
  assert.deepEqual(closed[0].played, [[0, 9]])
  const count = states.length
  audio.dispatchEvent(new Event('volumechange'))
  audio.dispatchEvent(new Event('seeked'))
  assert.equal(states.length, count)
})

test('replacement initializes retry credit only after queued native final-close checkpoint', async () => {
  const fixture = bridgeFixture()
  let releaseClose, prior = { attemptId: 'retry', heardSeconds: 20 }, initialized = false, opened
  fixture.bridge.close = input => new Promise(resolve => { releaseClose = () => resolve({ token: input.token, heardSeconds: 32 }) })
  const first = nativeAttempt(fixture.bridge, source('first-retry'), () => {}, assert.fail,
    state => { prior = { ...prior, heardSeconds: state.heardSeconds } })
  await first.ready
  const closing = first.close()
  const secondSource = source('second-retry')
  const second = nativeAttempt(fixture.bridge, secondSource, () => {}, assert.fail, () => {}, () => {
    initialized = true
    opened = { ...prior }
    return { priorCreditSeconds: prior.heardSeconds }
  })
  await Promise.resolve()
  assert.equal(initialized, false)
  releaseClose()
  await closing
  await second.ready
  assert.deepEqual(opened, { attemptId: 'retry', heardSeconds: 32 })
  assert.equal(secondSource.priorCreditSeconds, 32)
  fixture.bridge.close = async () => ({})
  await second.close()
})
