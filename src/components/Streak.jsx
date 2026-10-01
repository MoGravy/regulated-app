import { useEffect } from 'react'
import { useApp } from '../hooks/useApp'
import { currentStreak, recordPracticeDay, streakWithToday } from '../lib/streak'
import { streakCopy } from '../config/streakCopy'

// Night Sleeper look only; night.css hides both in the classic look.
// A run shows from two days. Before that the pill falls back to days of practice.

export function StreakPill() {
  const { completedSessions } = useApp()
  const run = currentStreak()
  const text = run >= 2
    ? streakCopy.inARow(run)
    : completedSessions.length ? streakCopy.practiceDay(completedSessions.length) : ''
  return text ? <div className="night-only streak-pill">{text}</div> : null
}

// Sits in the completion heading, so it also saves the night there: the
// check-out that follows may never be answered by someone who fell asleep.
export function StreakNote() {
  useEffect(() => { recordPracticeDay() }, [])
  const run = streakWithToday()
  return run >= 2 ? <span className="night-only streak-note">{streakCopy.inARow(run)}</span> : null
}
