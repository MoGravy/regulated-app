import { dayState } from '../config/program'

// The seven circles under "This week" and inside the current week card. The
// design draws weekday letters on Home and numbers in the week view, but the
// program is sequential rather than calendar-scheduled, so letters would
// promise a schedule that does not exist. Numbers in both places.
//
// Done and today are reachable; upcoming days are not, which is the whole
// point of "the week waits for you".
export default function DayDots({ days, startIdx, doneCount, onPick }) {
  return (
    // Seven 44px circles plus gaps are wider than the 390px phone allows once
    // page and card padding are taken out — the design board overflows too. A
    // seven-column grid keeps the 44px height and the touch target, and lets
    // the width give.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {days.map((d, i) => {
        const state = dayState(startIdx + i, doneCount)
        const reachable = state !== 'upcoming' && !!onPick
        const label = `Week ${d.week}, day ${d.day}${state === 'done' ? ', done' : state === 'today' ? ', today' : ', not yet'}`

        return (
          <button
            key={d.day}
            type="button"
            className={`day${state === 'done' ? ' day-done' : state === 'today' ? ' day-today' : ''}`}
            disabled={!reachable}
            aria-label={label}
            aria-current={state === 'today' ? 'step' : undefined}
            onClick={reachable ? () => onPick(d) : undefined}
            style={{ width: '100%', minWidth: 0, cursor: reachable ? 'pointer' : 'default' }}
          >
            {d.day}
          </button>
        )
      })}
    </div>
  )
}
