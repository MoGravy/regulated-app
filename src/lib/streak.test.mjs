// Self-check for the streak count.
//   node src/lib/streak.test.mjs
import assert from 'node:assert/strict'
import { dayKey, streakFrom } from './streak.js'

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h)
const keys = (...dates) => dates.map(d => dayKey(d))

// Nothing yet.
assert.equal(streakFrom([], at(2026, 10, 1)), 0)

// Three days ending today.
assert.equal(streakFrom(keys(at(2026, 9, 29), at(2026, 9, 30), at(2026, 10, 1)), at(2026, 10, 1, 21)), 3)

// Today not done yet: yesterday's run still stands.
assert.equal(streakFrom(keys(at(2026, 9, 29), at(2026, 9, 30)), at(2026, 10, 1, 8)), 2)

// A missed day starts the count again.
assert.equal(streakFrom(keys(at(2026, 9, 27), at(2026, 9, 28), at(2026, 9, 30), at(2026, 10, 1)), at(2026, 10, 1)), 2)
assert.equal(streakFrom(keys(at(2026, 9, 27), at(2026, 9, 28)), at(2026, 10, 1)), 0)

// Across a month end and the start of daylight saving in Adelaide (4 October 2026).
assert.equal(streakFrom(keys(at(2026, 9, 30), at(2026, 10, 1), at(2026, 10, 2), at(2026, 10, 3), at(2026, 10, 4), at(2026, 10, 5)), at(2026, 10, 5, 23)), 6)

// Just after midnight belongs to the new day.
assert.equal(dayKey(at(2026, 10, 2, 0)), '2026-10-02')

console.log('streak: ok')
