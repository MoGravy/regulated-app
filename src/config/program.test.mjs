// Self-check for the sequential progress logic — the only non-trivial pure
// code in program mode. Every screen state (today, done, locked, complete)
// falls out of these three functions, so if they are right the UI is right.
//   node src/config/program.test.mjs
import assert from 'node:assert/strict'
import { PROGRAM_DAYS, programAt, programWeeks, dayState } from './program.js'

// The placeholder map reuses sessions across the six weeks, which is exactly
// why progress is a counter and not a set of finished session ids.
assert.ok(
  new Set(PROGRAM_DAYS.map(d => d.session_id)).size < PROGRAM_DAYS.length,
  'map no longer repeats sessions — re-check the counter rationale'
)

// Nothing done: day one is today.
{
  const s = programAt(0)
  assert.equal(s.doneCount, 0)
  assert.equal(s.today.week, 1)
  assert.equal(s.today.day, 1)
  assert.equal(s.finished, false)
}

// Two days done: the third is today.
assert.equal(programAt(2).today.day, 3)

// Day 8 is week 2 day 1, not week 1 again.
{
  const s = programAt(7)
  assert.equal(s.today.week, 2)
  assert.equal(s.today.day, 1)
}

// Everything done: no today, and the program reports finished.
{
  const s = programAt(PROGRAM_DAYS.length)
  assert.equal(s.today, null)
  assert.equal(s.finished, true)
}

// Junk and overshoot clamp rather than throw.
assert.equal(programAt(undefined).doneCount, 0)
assert.equal(programAt(-5).doneCount, 0)
assert.equal(programAt(9999).finished, true)

// Week states at a standing start: week 1 current, week 2 flat, rest sunk.
{
  const w = programWeeks(0)
  assert.deepEqual(w.map(x => x.status), ['current', 'next', 'locked', 'locked', 'locked', 'locked'])
  assert.equal(w[0].doneInWeek, 0)
  // Each day must know its own week, or the day labels read "Week undefined".
  assert.deepEqual(w[1].days.map(d => d.week), [2, 2, 2, 2, 2, 2, 2])
  assert.deepEqual(w[1].days.map(d => d.day), [1, 2, 3, 4, 5, 6, 7])
}

// Mid week two: week 1 complete, week 2 current, week 3 flat.
{
  const w = programWeeks(9)
  assert.deepEqual(w.map(x => x.status), ['complete', 'current', 'next', 'locked', 'locked', 'locked'])
  assert.equal(w[1].doneInWeek, 2)
  assert.equal(w[0].doneInWeek, 7)
}

// Finished: every week complete, none current.
{
  const w = programWeeks(PROGRAM_DAYS.length)
  assert.ok(w.every(x => x.status === 'complete'))
}

assert.equal(dayState(0, 2), 'done')
assert.equal(dayState(2, 2), 'today')
assert.equal(dayState(3, 2), 'upcoming')

console.log('program: ok')
