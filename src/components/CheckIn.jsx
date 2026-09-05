import { useState } from 'react'
import { Lightning, CloudFog, Wind, MoonStars, HandWaving } from '@phosphor-icons/react'
import STATES from '../config/state-map.json'
import SessionRow from './SessionRow'
import { trackEvent, Events } from '../lib/analytics'
import { haptic } from '../lib/haptic'

const ICONS = { Lightning, CloudFog, Wind, MoonStars, HandWaving }

// The Check-In. Preference language only: no score, no interpretation, and the
// pick lives in component state, so nothing is ever kept against the person.
// Skippable by doing nothing; the library sits below it either way.
export default function CheckIn({ sessions }) {
  const [picked, setPicked] = useState(null)
  const state = picked ? STATES[picked] : null
  const matched = state
    ? state.sessions.map(id => sessions.find(s => String(s.id) === id)).filter(Boolean)
    : []

  function pick(key) {
    haptic()
    const next = key === picked ? null : key
    setPicked(next)
    // Anonymous by construction: the state name and nothing else.
    if (next) trackEvent(Events.CHECKIN_TAP, { state: next })
  }

  return (
    <section aria-label="Check-in" style={{ marginBottom: 26, position: 'relative' }}>
      <h2 style={{ margin: '0 0 12px', font: '400 22px/28px var(--font-display)', textWrap: 'pretty' }}>
        What does your system need right now?
      </h2>
      <div className="chip-row" role="group" aria-label="How you are">
        {Object.entries(STATES).map(([key, s]) => {
          const Icon = ICONS[s.icon]
          return (
            <button
              key={key}
              className="chip chip-all"
              aria-pressed={picked === key}
              onClick={() => pick(key)}
              style={{ gap: 6, border: '1px solid var(--line)' }}
            >
              {Icon && <Icon size={15} weight="light" aria-hidden="true" />}
              {s.label}
            </button>
          )
        })}
      </div>
      {state && (
        <div key={picked} className="rise" style={{ marginTop: 14 }}>
          <div className="t-caption" style={{ marginBottom: 8 }}>{state.reason}</div>
          {matched.map(s => <SessionRow key={s.id} session={s} />)}
          {!matched.length && (
            <div className="t-caption">Nothing matched yet. Everything else is below.</div>
          )}
        </div>
      )}
    </section>
  )
}
