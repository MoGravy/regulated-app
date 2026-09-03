import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { categoryOf, tint } from '../lib/categories'

// Glyphs are reproduced from design/Regulated.dc.html rather than swapped for
// library icons — the design draws its own chrome at these exact sizes.
function PlayGlyph({ fill, size = 1 }) {
  return (
    <svg width={12 * size} height={14 * size} viewBox="0 0 12 14" aria-hidden="true">
      <polygon points="1,1 11,7 1,13" fill={fill} />
    </svg>
  )
}

function LockGlyph() {
  return (
    <svg width="11" height="14" viewBox="0 0 11 14" aria-hidden="true">
      <rect x="0.5" y="6" width="10" height="7.5" rx="1.5" fill="var(--ink-faint)" />
      <path d="M2.8 6V3.6a2.7 2.7 0 0 1 5.4 0V6" stroke="var(--ink-faint)" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function StopGlyph() {
  return <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ink-faint)' }} />
}

// ponytail: module-level singleton — one preview plays at a time app-wide
let stopActivePreview = null

export default function SessionRow({ session }) {
  const navigate = useNavigate()
  const { completedSessions, isPremium, progress } = useApp()
  const [previewing, setPreviewing] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => () => audioRef.current?.pause(), [])

  const isCompleted = completedSessions.includes(session.id)
  const isLocked = !session.free && !isPremium
  const isComingSoon = !(session.has_audio ?? !!session.audio_url)
  const { ink, label } = categoryOf(session.category)

  const saved = progress[session.id]
  const inProgress = !!saved && !isLocked
  const pct = inProgress ? Math.round((saved.position / saved.duration) * 100) : 0
  const minsLeft = inProgress ? Math.max(1, Math.round((saved.duration - saved.position) / 60)) : 0

  function handleClick() {
    if (isComingSoon) return
    if (isLocked) return navigate('/premium')
    navigate(`/sessions/${session.id}`)
  }

  // Locked rows keep the 30-second preview: the design gives the locked row a
  // lock in place of the play control, so the control itself is the trigger.
  // The row still routes to /premium; this button stops that propagating.
  function togglePreview(e) {
    e.stopPropagation()
    if (previewing) {
      audioRef.current?.pause()
      audioRef.current = null
      stopActivePreview = null
      return setPreviewing(false)
    }
    stopActivePreview?.()
    const audio = new Audio(session.preview_url)
    audioRef.current = audio
    stopActivePreview = () => { audio.pause(); setPreviewing(false) }
    audio.onended = () => { audioRef.current = null; stopActivePreview = null; setPreviewing(false) }
    audio.play().catch(() => setPreviewing(false))
    setPreviewing(true)
  }

  const meta = [
    label,
    inProgress ? `${minsLeft} min left` : `${session.duration} min`,
    isComingSoon ? 'Coming soon' : isLocked ? 'Premium' : session.free ? 'Free' : null,
  ].filter(Boolean).join(' · ')

  const canPreview = isLocked && !!session.preview_url && !isComingSoon

  return (
    <div
      role="button"
      tabIndex={isComingSoon ? -1 : 0}
      aria-disabled={isComingSoon || undefined}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      className={`row ${isLocked || isComingSoon ? 'row-locked' : ''} ${inProgress ? 'row-progress' : ''}`}
      style={{ opacity: isComingSoon ? 0.65 : 1, cursor: isComingSoon ? 'default' : 'pointer' }}
    >
      {canPreview ? (
        <button
          type="button"
          className="row-icon row-icon-locked"
          onClick={togglePreview}
          aria-label={previewing ? `Stop preview of ${session.title}` : `Play 30 second preview of ${session.title}`}
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          {previewing ? <StopGlyph /> : <LockGlyph />}
        </button>
      ) : (
        <div
          className={`row-icon ${isLocked || isComingSoon ? 'row-icon-locked' : ''}`}
          style={{ background: isLocked || isComingSoon ? 'transparent' : inProgress ? 'var(--control)' : tint(ink, 0.1) }}
        >
          {isLocked || isComingSoon
            ? <LockGlyph />
            : <PlayGlyph fill={inProgress ? 'var(--on-control)' : ink} />}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-title">{session.title}</div>
        <div className="row-meta">
          {meta}{isCompleted && !inProgress ? ' · Done' : ''}
        </div>
        {inProgress && (
          <div className="track" style={{ marginTop: 7 }}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
