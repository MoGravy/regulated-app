import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'

const slides = [
  {
    emoji: '🌊',
    title: 'Your nervous system\nruns everything.',
    body: 'Anxiety. Poor sleep. Gut issues. Chronic stress. They\'re not separate problems — they\'re all signals from an dysregulated nervous system.',
  },
  {
    emoji: '🎧',
    title: 'Audio that reprograms\nat the root.',
    body: 'Each session uses targeted language patterns to speak directly to your subconscious — shifting your body out of survival mode and into regulation.',
  },
  {
    emoji: '✨',
    title: 'Built specifically\nfor your patterns.',
    body: 'Start with free foundational sessions, or order a custom audio built around your exact triggers, patterns, and goals.',
  },
  {
    emoji: '🔓',
    title: 'No account needed\nto start.',
    body: 'Four free sessions available immediately. No email, no signup. Just press play.',
  },
]

export default function Onboarding() {
  const [slide, setSlide] = useState(0)
  const navigate = useNavigate()
  const { setOnboardingDone } = useApp()

  function handleNext() {
    if (slide < slides.length - 1) {
      setSlide(slide + 1)
    } else {
      finish()
    }
  }

  function finish() {
    setOnboardingDone(true)
    trackEvent(Events.ONBOARDING_COMPLETED)
    navigate('/')
  }

  const current = slides[slide]

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      padding: '40px 28px',
    }}>
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-ghost"
          onClick={finish}
          style={{ color: 'var(--text-muted)' }}
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div
        key={slide}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          animation: 'fadeIn 0.4s ease',
        }}
      >
        <div style={{
          width: 90,
          height: 90,
          borderRadius: 24,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 44,
          marginBottom: 36,
        }}>
          {current.emoji}
        </div>

        <h1 style={{
          fontSize: 32,
          fontWeight: 800,
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          marginBottom: 20,
          whiteSpace: 'pre-line',
        }}>
          {current.title}
        </h1>

        <p style={{
          fontSize: 17,
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
        }}>
          {current.body}
        </p>
      </div>

      {/* Progress + CTA */}
      <div style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, justifyContent: 'center' }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                borderRadius: 2,
                background: i <= slide ? 'var(--accent)' : 'var(--border-solid)',
                width: i === slide ? 24 : 8,
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        <button className="btn-primary" onClick={handleNext}>
          {slide === slides.length - 1 ? 'Start Listening — It\'s Free' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
