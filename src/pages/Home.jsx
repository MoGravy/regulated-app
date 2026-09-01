import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { getAllSessions } from '../lib/supabase'
import { HARDCODED_SESSIONS } from '../lib/hardcodedSessions'
import { categoryOf, tint } from '../lib/categories'
import { PROGRAM_APPROVED } from '../config/program'
import SessionRow from '../components/SessionRow'
import Texture from '../components/Texture'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function whenLabel() {
  const d = new Date()
  const day = d.toLocaleDateString('en-AU', { weekday: 'long' })
  const h = d.getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `${day} ${part}`
}

export default function Home() {
  const navigate = useNavigate()
  const { onboardingDone, lastInProgress } = useApp()
  const [sessions, setSessions] = useState(HARDCODED_SESSIONS)
  const [loading, setLoading] = useState(true)
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (!onboardingDone && !hasRedirected.current) {
      hasRedirected.current = true
      navigate('/welcome', { replace: true })
      return
    }
    loadSessions()
  }, [onboardingDone])

  async function loadSessions() {
    try {
      const data = await getAllSessions()
      if (data.length) setSessions(data)
    } catch (err) {
      console.error('[Home] getAllSessions failed:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    } finally {
      setLoading(false)
    }
  }

  const resume = lastInProgress(sessions)

  // Category tiles, biggest families first — "Where you are today".
  const families = Object.entries(
    sessions.reduce((acc, s) => {
      const key = s.category || 'Other'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const newest = [...sessions]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]

  return (
    <div className="page">
      <div className="status-bar"><span /><span>Regulated</span></div>

      <div className="page-content" style={{ paddingTop: 8 }}>
        <div className="t-caption">{whenLabel()}</div>
        <h1 style={{ margin: '4px 0 20px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em' }}>
          {greeting()}
        </h1>

        <div className="segmented" role="tablist" aria-label="Mode" style={{ marginBottom: 24 }}>
          <button
            role="tab"
            className="segmented-item"
            aria-selected={false}
            disabled={!PROGRAM_APPROVED}
            onClick={() => PROGRAM_APPROVED && navigate('/program')}
            title={PROGRAM_APPROVED ? undefined : 'Coming soon'}
          >
            Program{PROGRAM_APPROVED ? '' : ' · soon'}
          </button>
          <button role="tab" className="segmented-item" aria-selected={true}>Browse</button>
        </div>

        {resume?.session && (
          <>
            <div className="t-section" style={{ marginBottom: 10 }}>Continue listening</div>
            <ResumeCard resume={resume} onPlay={() => navigate(`/sessions/${resume.session.id}`)} />
          </>
        )}

        {!!families.length && (
          <>
            <div className="t-section" style={{ margin: '26px 0 10px' }}>Where you are today</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {families.map(([name, count]) => (
                <CategoryTile
                  key={name}
                  name={name}
                  count={count}
                  onClick={() => navigate(`/sessions?category=${encodeURIComponent(name)}`)}
                />
              ))}
            </div>
          </>
        )}

        {newest && (
          <>
            <div className="t-section" style={{ margin: '26px 0 10px' }}>New this month</div>
            <SessionRow session={newest} />
          </>
        )}

        {loading && <div className="t-caption" style={{ marginTop: 20 }}>Loading your library…</div>}
      </div>
    </div>
  )
}

function ResumeCard({ resume, onPlay }) {
  const { session, position, duration } = resume
  const { ink, label } = categoryOf(session.category)
  const pct = Math.round((position / duration) * 100)
  const minsLeft = Math.max(1, Math.round((duration - position) / 60))
  const total = Math.round(duration / 60)

  return (
    <div className="card texture" style={{ padding: 18 }}>
      <Texture ink={ink} variant="card" />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          className="btn-play"
          style={{ width: 52, height: 52 }}
          onClick={onPlay}
          aria-label={`Resume ${session.title}`}
        >
          <svg width="15" height="18" viewBox="0 0 15 18" aria-hidden="true">
            <polygon points="2,1 14,9 2,17" fill="var(--on-control)" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '400 22px/28px var(--font-display)', color: 'var(--ink)' }}>{session.title}</div>
          <div className="t-caption">{label} · {minsLeft} min left of {total}</div>
          <div className="track" style={{ marginTop: 8 }}><span style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    </div>
  )
}

function CategoryTile({ name, count, onClick }) {
  const { ink, icon: Icon } = categoryOf(name)
  return (
    <button
      onClick={onClick}
      className="texture"
      style={{
        height: 96,
        borderRadius: 'var(--r-card)',
        background: tint(ink, 0.09),
        border: `1px solid ${tint(ink, 0.18)}`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Texture ink={ink} variant="tile" />
      {Icon && (
        <Icon
          size={18}
          weight="light"
          color={ink}
          aria-hidden="true"
          style={{ position: 'absolute', right: 12, top: 12, opacity: 0.5 }}
        />
      )}
      <span style={{ position: 'relative', font: '400 19px/24px var(--font-display)', color: 'var(--ink)' }}>{name}</span>
      <span style={{ position: 'relative', font: '400 12px/16px var(--font-ui)', color: 'var(--ink-muted)' }}>
        {count} session{count === 1 ? '' : 's'}
      </span>
    </button>
  )
}
