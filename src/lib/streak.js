// Day streaks. A day counts when a session is finished. A missed day simply
// starts the count again; nothing is said about it.
// Days are local dates kept on this device only. A night runs to 4am, so a
// session at 00:30 still counts for the evening before.
// ponytail: device-local list; move it onto the account when streaks need to follow people across devices.

const KEY = 'regulated_practice_days'
const KEEP = 400
const ROLLOVER_HOURS = 4

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The calendar day a moment belongs to, with the day ending at 4am.
export const nightKey = (now = new Date()) => dayKey(new Date(now.getTime() - ROLLOVER_HOURS * 3600e3))

function readDays() {
  try {
    const days = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(days) ? days : []
  } catch {
    return []
  }
}

export function recordPracticeDay(now = new Date()) {
  const days = readDays()
  const today = nightKey(now)
  if (days.includes(today)) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...days, today].slice(-KEEP)))
  } catch {}
}

// Days in a row ending today, or ending yesterday while today is still open.
export function streakFrom(days, now = new Date()) {
  const done = new Set(days)
  const night = new Date(now.getTime() - ROLLOVER_HOURS * 3600e3)
  const d = new Date(night.getFullYear(), night.getMonth(), night.getDate())
  if (!done.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let run = 0
  while (done.has(dayKey(d))) {
    run++
    d.setDate(d.getDate() - 1)
  }
  return run
}

export const currentStreak = (now = new Date()) => streakFrom(readDays(), now)

// On the completion screen today counts, whether or not it has been written yet.
export const streakWithToday = (now = new Date()) => streakFrom([...readDays(), nightKey(now)], now)
