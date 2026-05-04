import { useState } from 'react'

export default function MoodTracker({ label, onSubmit, optional = false }) {
  const [value, setValue] = useState(null)

  const emojis = [
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

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, textAlign: 'center' }}>
        Tap to rate your nervous system state (1–10)
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
        {emojis.map(({ val, emoji }) => (
          <button
            key={val}
            onClick={() => setValue(val)}
            style={{
              width: 36,
              height: 42,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: value === val ? 'var(--accent-glow)' : 'transparent',
              border: `1.5px solid ${value === val ? 'var(--accent)' : 'transparent'}`,
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontSize: value === val ? 22 : 18,
              padding: 0,
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {value !== null && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 28, display: 'block', marginBottom: 4 }}>
            {emojis[value - 1].emoji}
          </span>
          <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>
            {value}/10 — {
              value <= 3 ? 'Dysregulated' :
              value <= 5 ? 'Somewhat regulated' :
              value <= 7 ? 'Moderately regulated' :
              'Well regulated'
            }
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {optional && (
          <button className="btn-ghost" style={{ flex: 1 }} onClick={() => onSubmit(null)}>
            Skip
          </button>
        )}
        <button
          className="btn-primary"
          style={{ flex: 2 }}
          disabled={value === null}
          onClick={() => onSubmit(value)}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
