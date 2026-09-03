import { useState } from 'react'

// Rendered inside the player, so it is styled on the dark surface. The design
// file has no mood board; this follows the player's own type and colour rules.
const EMOJIS = [
  { val: 1, emoji: '😰', label: 'Very dysregulated' },
  { val: 2, emoji: '😟', label: '' },
  { val: 3, emoji: '😕', label: '' },
  { val: 4, emoji: '😐', label: '' },
  { val: 5, emoji: '🙂', label: 'Neutral' },
  { val: 6, emoji: '😌', label: '' },
  { val: 7, emoji: '😊', label: '' },
  { val: 8, emoji: '😎', label: '' },
  { val: 9, emoji: '🌟', label: '' },
  { val: 10, emoji: '✨', label: 'Fully regulated' },
]

function band(value) {
  if (value <= 3) return 'Dysregulated'
  if (value <= 5) return 'Somewhat regulated'
  if (value <= 7) return 'Moderately regulated'
  return 'Well regulated'
}

export default function MoodTracker({ label, onSubmit, optional = false }) {
  const [value, setValue] = useState(null)

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px' }}>
      <h1 style={{ font: '300 32px/38px var(--font-display)', color: 'var(--player-title)', letterSpacing: '-0.01em', textWrap: 'pretty' }}>
        {label}
      </h1>
      <p style={{ margin: '12px 0 32px', font: '400 15px/24px var(--font-ui)', color: 'var(--player-muted)' }}>
        Tap to rate your nervous system state, 1 to 10.
      </p>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', marginBottom: 24 }}>
        {EMOJIS.map(({ val, emoji, label: name }) => (
          <button
            key={val}
            aria-label={name || `${val} out of 10`}
            aria-pressed={value === val}
            title={name || `${val}/10`}
            onClick={() => setValue(val)}
            style={{
              width: 28,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: value === val ? 'var(--control)' : 'transparent',
              border: `1.5px solid ${value === val ? 'var(--control)' : 'transparent'}`,
              borderRadius: 'var(--r-row)',
              cursor: 'pointer',
              transition: 'background var(--t-press)',
              fontSize: value === val ? 20 : 17,
              padding: 0,
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 24, marginBottom: 24, font: '400 14px/20px var(--font-ui)', color: 'var(--player-muted)' }}>
        {value !== null && `${value}/10 · ${band(value)}`}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {optional && (
          <button
            onClick={() => onSubmit(null)}
            style={{ flex: 1, height: 52, borderRadius: 'var(--r-row)', border: '1px solid var(--player-track)', background: 'transparent', color: 'var(--player-muted)', font: '400 15px/20px var(--font-ui)', cursor: 'pointer' }}
          >
            Skip
          </button>
        )}
        <button
          onClick={() => onSubmit(value)}
          disabled={value === null}
          style={{
            flex: 2,
            height: 52,
            borderRadius: 'var(--r-row)',
            border: 'none',
            background: value === null ? 'var(--player-track)' : 'var(--control)',
            color: value === null ? 'var(--player-faint)' : 'var(--on-control)',
            font: '500 16px/22px var(--font-ui)',
            cursor: value === null ? 'not-allowed' : 'pointer',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
