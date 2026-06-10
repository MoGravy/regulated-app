import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'

const categoryColors = {
  sleep: { bg: '#1A2E4A', accent: '#6EA8C8', icon: '🌙' },
  stress: { bg: '#2A1A3A', accent: '#A87EC8', icon: '🌊' },
  ibs: { bg: '#1A3A2A', accent: '#7EC8A8', icon: '🌿' },
  reset: { bg: '#3A2A1A', accent: '#C8A87E', icon: '☀️' },
  anxiety: { bg: '#2A1A3A', accent: '#C87EA8', icon: '🕊️' },
  focus: { bg: '#1A3A3A', accent: '#7EC8C8', icon: '🎯' },
  confidence: { bg: '#3A3A1A', accent: '#C8C87E', icon: '✨' },
  grief: { bg: '#2A2A3A', accent: '#8E8EC8', icon: '💙' },
  'weight loss': { bg: '#1A3A28', accent: '#7EC8A0', icon: '🎯' },
  default: { bg: 'var(--bg-card)', accent: 'var(--accent)', icon: '🎵' },
}

export default function SessionCard({ session, compact = false }) {
  const navigate = useNavigate()
  const { completedSessions, isPremium } = useApp()

  const isCompleted = completedSessions.includes(session.id)
  const isLocked = !session.free && !isPremium
  const isComingSoon = !session.audio_url
  const colors = categoryColors[session.category?.toLowerCase()] || categoryColors.default

  function handleClick() {
    if (isComingSoon) return   // unclickable — no audio yet
    if (isLocked) {
      navigate('/premium')
      return
    }
    navigate(`/sessions/${session.id}`)
  }

  // ── Compact view ────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <button
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          padding: '14px 16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          cursor: isComingSoon ? 'default' : 'pointer',
          textAlign: 'left',
          transition: 'all 0.2s ease',
          opacity: isComingSoon ? 0.45 : 1,
        }}
        onMouseEnter={e => { if (!isComingSoon) e.currentTarget.style.borderColor = 'var(--border-solid)' }}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: colors.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0,
        }}>
          {colors.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              {session.title}
            </span>
            {isCompleted && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓</span>}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {session.duration} min
          </span>
        </div>
        {isComingSoon ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            SOON
          </span>
        ) : isLocked ? (
          <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>🔒</span>
        ) : (
          <div style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--accent-glow)',
            border: '1px solid var(--border-solid)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent)" style={{ marginLeft: 2 }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        )}
      </button>
    )
  }

  // ── Full card view ──────────────────────────────────────────────────────────
  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        background: isComingSoon ? 'rgba(20, 40, 50, 0.5)' : isLocked ? 'rgba(26, 58, 74, 0.4)' : 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        cursor: isComingSoon ? 'default' : 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.2s ease',
        opacity: isComingSoon ? 0.5 : isLocked ? 0.75 : 1,
      }}
      onMouseEnter={e => { if (!isComingSoon && !isLocked) e.currentTarget.style.borderColor = 'var(--border-solid)' }}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: colors.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
        }}>
          {colors.icon}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isComingSoon ? (
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: '3px 10px',
              letterSpacing: '0.08em',
            }}>
              COMING SOON
            </span>
          ) : (
            <>
              {session.free ? (
                <span className="badge badge-free">Free</span>
              ) : (
                <span className="badge badge-premium">Premium</span>
              )}
              {isLocked && <span style={{ fontSize: 16 }}>🔒</span>}
              {isCompleted && <span style={{ fontSize: 16 }}>✓</span>}
            </>
          )}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
          {session.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {session.description}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {session.duration} min · {session.category}
        </span>
        {isComingSoon ? null : !isLocked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.accent, fontSize: 13, fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Play
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Unlock →</span>
        )}
      </div>
    </button>
  )
}
