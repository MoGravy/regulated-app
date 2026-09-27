import assert from 'node:assert/strict'
import catalogue from './fixtures/catalogue-20260928.json' with { type: 'json' }
import stateMap from '../src/config/state-map.json' with { type: 'json' }
import programMap from '../design/program-map.json' with { type: 'json' }
import { HARDCODED_SESSIONS } from '../src/lib/hardcodedSessions.js'
import { unreviewedSessionIds } from '../src/content/reviewedCopy.js'

for (const expected of catalogue) {
  const actual = HARDCODED_SESSIONS.find(row => row.id === expected.id)
  assert.ok(actual, `Missing authoritative catalogue ID ${expected.id}`)
  for (const field of ['category', 'duration', 'free', 'has_audio']) {
    assert.equal(actual[field], expected[field], `${expected.id} ${field}`)
  }
  assert.ok(!('audio_url' in actual), 'Fallback must not contain an audio URL')
}
assert.deepEqual(HARDCODED_SESSIONS.map(row => row.id).sort(), catalogue.map(row => row.id).sort())
assert.deepEqual(unreviewedSessionIds(catalogue), [])
assert.equal(HARDCODED_SESSIONS.filter(row => row.free).length, 4)
for (const day of programMap.weeks.flatMap(week => week.days)) assert.ok(catalogue.some(row => row.id === day.session_id))
assert.equal(catalogue.find(row => row.id === stateMap.sleep.sessions[0]).category, 'Sleep')
assert.equal(catalogue.find(row => row.id === stateMap.checkin.sessions[0]).category, 'Daily')
assert.equal(programMap.approved, false)
console.log('PASS: all14 authoritative identities, categories, durations and access/audio flags match fallback, with no invented sessions.')
