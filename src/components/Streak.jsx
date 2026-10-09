import { useApp } from '../hooks/useApp'
import { streakCopy } from '../config/streakCopy'

// Night Sleeper look only; night.css hides both in the classic look.
// A run shows from two days. Before that the pill falls back to days of practice.

export function StreakPill() {
  const { practiceSummary } = useApp()
  const run = practiceSummary.currentRun
  const text = run >= 2
    ? streakCopy.inARow(run)
    : practiceSummary.days ? streakCopy.practiceDay(practiceSummary.days) : ''
  return text ? <div className="night-only streak-pill">{text}</div> : null
}

// Qualification has already recorded eligible listening, including background
// playback. Rendering the completion heading must never itself award a day.
export function StreakNote() {
  const { practiceSummary } = useApp()
  const run = practiceSummary.currentRun
  return run >= 2 ? <span className="night-only streak-note">{streakCopy.inARow(run)}</span> : null
}
