import programMap from '../../design/program-map.json' with { type: 'json' }

// The program stays behind a content gate until Matthew has reviewed the
// day-to-session sequencing. While this is false the mode switch shows Program
// as coming soon and Browse is the default experience — brief phase 4.
export const PROGRAM_APPROVED = programMap.approved === true

// Approving the sequencing means reviewing it rendered, which the gate itself
// prevents. ?program=preview unlocks the UI for this tab only, and sticks for
// the rest of the visit so the week view and Today both work. It changes
// nothing about what ships and hides nothing paid: the same placeholder content
// is sitting in design/program-map.json in the repo.
const PREVIEW_KEY = 'regulated_program_preview'

export function programUnlocked() {
  if (PROGRAM_APPROVED) return true
  try {
    if (new URLSearchParams(window.location.search).get('program') === 'preview') {
      sessionStorage.setItem(PREVIEW_KEY, '1')
    }
    return sessionStorage.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export const PROGRAM_MAP = programMap
export const PROGRAM_WEEKS = programMap.weeks

// Every day in order, each carrying the week it belongs to.
export const PROGRAM_DAYS = programMap.weeks.flatMap(w =>
  w.days.map(d => ({ ...d, week: w.week }))
)

// ponytail: progress is one integer — how many program days are done. It is not
// derived from the library's completed list, because the six weeks reuse the
// same sessions (42 days over 13 sessions), so finishing week 1 would silently
// mark most of week 2 done as well.
//
// The design's own copy — "Miss a day and the week waits for you" — describes a
// sequential program, not a calendar-scheduled one, so today is simply the next
// day after the ones already finished. Nothing to schedule, nothing to drift.
//
// The ceiling: this counter is per device. Cross-device needs the user_progress
// table, which the migration and seed already provide; wiring it means fetching
// the program_days row ids from Supabase instead of reading the bundled map.
export function programAt(doneCount) {
  const n = Math.min(Math.max(Number(doneCount) || 0, 0), PROGRAM_DAYS.length)
  return {
    today: n < PROGRAM_DAYS.length ? PROGRAM_DAYS[n] : null,
    doneCount: n,
    total: PROGRAM_DAYS.length,
    finished: n >= PROGRAM_DAYS.length,
  }
}

// Each week with its absolute day range, how many of its days are done, and the
// four states the design draws: complete, current (raised), next (flat) and
// locked (sunk, padlocked).
export function programWeeks(doneCount) {
  let n = 0
  const weeks = programMap.weeks.map(w => {
    const start = n
    n += w.days.length
    return {
      ...w,
      start,
      end: n,
      // PROGRAM_DAYS carries the week number on each day; the raw map does not.
      days: PROGRAM_DAYS.slice(start, n),
      doneInWeek: Math.min(Math.max(doneCount - start, 0), w.days.length),
    }
  })

  const currentIdx = weeks.findIndex(w => doneCount < w.end)
  return weeks.map((w, i) => ({
    ...w,
    status:
      currentIdx === -1 || i < currentIdx ? 'complete'
        : i === currentIdx ? 'current'
          : i === currentIdx + 1 ? 'next'
            : 'locked',
  }))
}

// done | today | upcoming, for one day at absolute index `i`.
export function dayState(i, doneCount) {
  return i < doneCount ? 'done' : i === doneCount ? 'today' : 'upcoming'
}
