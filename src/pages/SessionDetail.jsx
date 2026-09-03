import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { supabase, SESSION_COLUMNS, getCachedSession } from '../lib/supabase'
import { HARDCODED_SESSIONS_BY_ID } from '../lib/hardcodedSessions'
import { categoryOf, tint } from '../lib/categories'
import Texture from '../components/Texture'

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isPremium } = useApp()
  const [session, setSession] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    const trimmed = decodeURIComponent(String(id || '')).trim()
    if (!trimmed) return setNotFound(true)

    const cached = getCachedSession(trimmed)
    if (cached) return setSession(cached)

    supabase.from('sessions').select(SESSION_COLUMNS).eq('id', trimmed).single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (data && !error) return setSession(data)
        console.warn('[SessionDetail] DB fetch failed:', JSON.stringify(error), '— trying fallback')
        const fallback = HARDCODED_SESSIONS_BY_ID[trimmed]
        if (fallback) setSession(fallback)
        else setNotFound(true)
      })
    return () => { cancelled = true }
  }, [id])

  if (notFound) {
    return (
      <div className="page-plain" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="t-title">Session not found</div>
          <button className="btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/sessions')}>
            Back to the library
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return <div className="page-plain" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  const { ink, label, icon: Icon } = categoryOf(session.category)
  const isLocked = !session.free && !isPremium
  const comingSoon = !(session.has_audio ?? !!session.audio_url)
  const year = session.created_at ? new Date(session.created_at).getFullYear() : null

  // ponytail: the design's Position / Best time / Ends with block is not built.
  // The sessions table has no column for any of the three and inventing clinical
  // guidance is not ours to do. Add three nullable columns and fill them, then
  // render the block here.

  function start() {
    if (comingSoon) return
    if (isLocked) return navigate('/premium')
    navigate(`/sessions/${session.id}/play`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div className="status-bar"><span /><span>Regulated</span></div>

      <div className="texture" style={{ flex: 'none', height: 240, background: tint(ink, 0.1) }}>
        <Texture ink={ink} variant="header" />
        <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Back" style={{ position: 'absolute', left: 12, top: 8 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3l-5 5 5 5" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        {Icon && (
          <Icon
            size={40}
            weight="light"
            color={ink}
            aria-hidden="true"
            style={{ position: 'absolute', right: 24, bottom: 20, opacity: 0.35 }}
          />
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 0' }}>
        <div style={{ display: 'inline-flex', height: 26, padding: '0 10px', alignItems: 'center', borderRadius: 'var(--r-pill)', font: '400 12px/16px var(--font-ui)', ...{ background: tint(ink, 0.1), color: ink } }}>
          {label}
        </div>
        <h1 style={{ margin: '14px 0 6px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em' }}>
          {session.title}
        </h1>
        <div className="t-caption">
          {session.duration} minutes · Matthew Tweedie{year ? ` · recorded ${year}` : ''}
        </div>

        {session.description && (
          <p style={{ margin: '18px 0 0', font: '400 16px/25px var(--font-ui)', color: 'var(--ink)', textWrap: 'pretty' }}>
            {session.description}
          </p>
        )}

        <div style={{ height: 24 }} />
      </div>

      <div className="footer-cta footer-cta-lifted">
        <button className="btn-primary btn-lg" onClick={start} disabled={comingSoon}>
          {comingSoon ? 'Coming soon' : isLocked ? 'Unlock with premium' : 'Start session'}
        </button>
        <div style={{ marginTop: 12, textAlign: 'center' }} className="t-caption">
          {session.free ? 'Free' : 'Included in premium'} · {session.duration} min
        </div>
      </div>
    </div>
  )
}
