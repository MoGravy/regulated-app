import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { supabase, trackSessionCompletion, SESSION_COLUMNS, getCachedSession, authHeaders } from '../lib/supabase'
import { trackEvent, Events } from '../lib/analytics'
import { HARDCODED_SESSIONS_BY_ID } from '../lib/hardcodedSessions'
import { categoryOf } from '../lib/categories'
import MoodTracker from '../components/MoodTracker'
import { CUSTOM_AUDIO_PRICE } from '../config/pricing'
import { haptic } from '../lib/haptic'

const STEP = { PRE_MOOD: 'pre_mood', PLAYING: 'playing', COMPLETE: 'complete', POST_MOOD: 'post_mood', DONE: 'done' }

export default function SessionPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userEmail, markSessionComplete, saveProgress, completedSessions } = useApp()

  const [session, setSession] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [loadError, setLoadError] = useState(false)   // session row missing
  const [audioError, setAudioError] = useState(null)  // session fine, audio would not resolve
  const [retry, setRetry] = useState(0)
  const [step, setStep] = useState(STEP.PRE_MOOD)
  const [moodBefore, setMoodBefore] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)

  const audioRef = useRef(null)
  const startRef = useRef(null)
  const timerRef = useRef(null)
  const wakeLockRef = useRef(null)
  const progressRef = useRef({ id: null, position: 0, duration: 0 })

  // ---------------------------------------------------------------------------
  // Load session: cache, then Supabase, then hardcoded fallback
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const trimmed = decodeURIComponent(String(id || '')).trim()
    if (!trimmed) { setLoadError(true); return }

    async function fetchSession() {
      const cached = getCachedSession(trimmed)
      if (cached) {
        setSession(cached)
        trackEvent(Events.SESSION_STARTED, { session_title: cached.title })
        return
      }

      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('id', trimmed)
        .single()

      if (cancelled) return

      if (data && !error) {
        setSession(data)
        trackEvent(Events.SESSION_STARTED, { session_title: data.title })
        return
      }

      console.warn('[SessionPlayer] DB fetch failed:', JSON.stringify(error), '— trying hardcoded fallback')
      const fallback = HARDCODED_SESSIONS_BY_ID[trimmed]
      if (fallback) {
        setSession(fallback)
        trackEvent(Events.SESSION_STARTED, { session_title: fallback.title })
      } else {
        console.error('[SessionPlayer] No session found for id:', trimmed)
        setLoadError(true)
      }
    }

    fetchSession()
    return () => { cancelled = true }
  }, [id])

  // Resolve the playable URL once the session is loaded. ALL audio goes through
  // /api/get-audio-url for a freshly signed short-lived URL — no baked tokens on
  // the client. Endpoint itself is untouched.
  useEffect(() => {
    if (!session) return
    const hasAudio = session.has_audio ?? !!session.audio_url
    if (!hasAudio) return

    let cancelled = false
    setAudioError(null)
    async function resolveUrl() {
      try {
        const res = await fetch('/api/get-audio-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ sessionId: session.id, email: userEmail }),
        })
        if (cancelled) return
        if (res.status === 401 || res.status === 403) {
          navigate('/premium')
          return
        }
        if (!res.ok) throw new Error(`get-audio-url responded ${res.status}`)
        const data = await res.json()
        if (!data?.url) throw new Error('get-audio-url returned no url')
        setAudioUrl(data.url)
      } catch (err) {
        if (cancelled) return
        console.error('[SessionPlayer] get-audio-url failed:', err?.message || err)
        setAudioError(err?.message || 'Audio could not be loaded')
      }
    }
    resolveUrl()
    return () => { cancelled = true }
  }, [session, retry])

  // Seed the duration from the row until the audio reports its real length.
  // The pre-mood step used to auto-advance after 1200ms, which made the question
  // a 1.2s flash and left mood_before permanently null. It now waits for an
  // answer; "Skip" is still one tap.
  useEffect(() => {
    if (!session) return
    setDuration(d => d || (session.duration || 20) * 60)
  }, [session])

  useEffect(() => {
    if (step !== STEP.PLAYING || !audioUrl || !audioRef.current) return
    audioRef.current.play().catch(() => {})
  }, [step, audioUrl])

  useEffect(() => {
    if (!isPlaying || step !== STEP.PLAYING) return
    startRef.current = Date.now() - currentTime * 1000
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setCurrentTime(elapsed)
      if (elapsed >= (duration || 1200)) {
        clearInterval(timerRef.current)
        setIsPlaying(false)
        setStep(STEP.COMPLETE)
      }
    }, 500)
    return () => clearInterval(timerRef.current)
  }, [isPlaying, step, duration])

  // The completion moment holds for two seconds, then the check-out.
  useEffect(() => {
    if (step !== STEP.COMPLETE) return
    const t = setTimeout(() => setStep(STEP.POST_MOOD), 2600)
    return () => clearTimeout(t)
  }, [step])

  // Wake lock — request when playing, release on pause/end/unmount
  useEffect(() => {
    if (isPlaying) {
      navigator.wakeLock?.request('screen').then(lock => { wakeLockRef.current = lock }).catch(() => {})
    } else {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
    return () => {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isPlaying])

  // Keep the latest position in a ref so the unmount save does not need to be
  // re-registered on every tick.
  useEffect(() => {
    progressRef.current = { id: session?.id, position: currentTime, duration }
  }, [session, currentTime, duration])

  useEffect(() => () => {
    const { id: sid, position, duration: d } = progressRef.current
    if (sid) saveProgress(sid, position, d)
  }, [])

  function handlePreMood(mood) {
    setMoodBefore(mood)
    setStep(STEP.PLAYING)
    trackEvent(Events.MOOD_TRACKED, { type: 'before', value: mood, session_title: session?.title })
  }

  function handlePostMood(mood) {
    markSessionComplete(session?.id)
    trackSessionCompletion(null, userEmail, moodBefore, mood)
    trackEvent(Events.MOOD_TRACKED, { type: 'after', value: mood, session_title: session?.title })
    setStep(STEP.DONE)
    setTimeout(() => setShowCustomPrompt(true), 800)
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    haptic()
    if (isPlaying) { a.pause(); setIsPlaying(false) }
    else { a.play().catch(() => {}); setIsPlaying(true) }
  }

  function skip(secs) {
    const a = audioRef.current
    if (!a) return
    const next = Math.max(0, Math.min(a.currentTime + secs, duration))
    a.currentTime = next
    setCurrentTime(next)
    startRef.current = Date.now() - next * 1000
  }

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const t = ratio * (duration || 0)
    if (!Number.isFinite(t)) return
    setCurrentTime(t)
    if (audioRef.current) audioRef.current.currentTime = t
    startRef.current = Date.now() - t * 1000
  }

  function fmt(seconds) {
    const s = Number.isFinite(seconds) ? Math.floor(seconds) : 0
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function close() {
    navigate(session ? `/sessions/${session.id}` : '/sessions')
  }

  // ---------------------------------------------------------------------------
  if (loadError) {
    return (
      <Shell>
        <div style={{ position: 'relative', margin: 'auto', textAlign: 'center', padding: 32 }}>
          <div style={{ font: '400 21px/28px var(--font-display)', color: 'var(--player-title)' }}>Session not found</div>
          <button
            onClick={() => navigate('/sessions')}
            style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--player-muted)', font: '400 14px/20px var(--font-ui)', cursor: 'pointer' }}
          >
            Back to the library
          </button>
        </div>
      </Shell>
    )
  }

  if (!session) {
    return (
      <Shell>
        <div aria-busy="true" style={{ position: 'relative', margin: 'auto 0', padding: '0 32px' }}>
          <div className="skeleton skeleton-dark" style={{ width: 60, height: 14 }} />
          <div className="skeleton skeleton-dark" style={{ width: '80%', height: 40, marginTop: 14 }} />
          <div className="skeleton skeleton-dark" style={{ width: '60%', height: 40, marginTop: 6 }} />
          <div className="skeleton skeleton-dark" style={{ width: '70%', height: 16, marginTop: 20 }} />
        </div>
      </Shell>
    )
  }

  if (audioError) {
    return (
      <Shell>
        <div style={{ position: 'relative', margin: 'auto', textAlign: 'center', padding: 32 }}>
          <div style={{ font: '400 21px/28px var(--font-display)', color: 'var(--player-title)' }}>
            Take a breath. The audio is not here yet.
          </div>
          <p style={{ margin: '12px 0 24px', font: '400 15px/24px var(--font-ui)', color: 'var(--player-muted)', textWrap: 'pretty' }}>
            Your session is safe. This is usually the connection. When you are ready, try again.
          </p>
          <button
            onClick={() => { setAudioError(null); setRetry(n => n + 1) }}
            style={{ height: 48, padding: '0 24px', borderRadius: 'var(--r-row)', border: 'none', background: 'var(--control)', color: 'var(--on-control)', font: '500 15px/20px var(--font-ui)', cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            onClick={close}
            style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--player-muted)', font: '400 14px/20px var(--font-ui)', cursor: 'pointer' }}
          >
            Back
          </button>
        </div>
      </Shell>
    )
  }

  const { label } = categoryOf(session.category)
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <Shell>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={e => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
          onEnded={() => { setIsPlaying(false); setStep(STEP.COMPLETE) }}
        />
      )}

      <div className="status-bar" style={{ position: 'relative', color: 'var(--player-faint)' }}><span /><span /></div>

      <div style={{ position: 'relative', height: 56, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
        <button className="btn-icon" onClick={close} aria-label="Close player">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 6l5 5 5-5" stroke="var(--player-faint)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {step === STEP.PRE_MOOD && (
        <MoodTracker label="Before we start, where are you now?" onSubmit={handlePreMood} optional />
      )}

      {step === STEP.COMPLETE && (
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
          <div className="bloom" aria-hidden="true" />
          <h1 className="fade-in" style={{ position: 'relative', font: '300 32px/38px var(--font-display)', color: 'var(--player-title)', animationDelay: '600ms' }}>
            Day {completedSessions.includes(session.id) ? completedSessions.length : completedSessions.length + 1} of your practice
          </h1>
        </div>
      )}

      {step === STEP.POST_MOOD && (
        <MoodTracker label="And now?" onSubmit={handlePostMood} />
      )}

      {step === STEP.DONE && (
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
          <h1 style={{ font: '300 32px/38px var(--font-display)', color: 'var(--player-title)' }}>That is done.</h1>
          <p style={{ margin: '16px 0 0', font: '400 15px/24px var(--font-ui)', color: 'var(--player-muted)' }}>
            Stay lying down for a minute if you can.
          </p>
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => navigate('/sessions')}
              style={{ height: 52, borderRadius: 'var(--r-row)', border: 'none', background: 'var(--control)', color: 'var(--on-control)', font: '500 16px/22px var(--font-ui)', cursor: 'pointer' }}
            >
              Back to the library
            </button>
            {showCustomPrompt && (
              <button
                onClick={() => navigate('/custom')}
                style={{ height: 48, borderRadius: 'var(--r-row)', border: '1px solid var(--player-track)', background: 'transparent', color: 'var(--player-muted)', font: '400 14px/20px var(--font-ui)', cursor: 'pointer' }}
              >
                A session made for you · ${CUSTOM_AUDIO_PRICE}
              </button>
            )}
          </div>
        </div>
      )}

      {step === STEP.PLAYING && (
        <>
          <div className="player-glow" data-playing={isPlaying} aria-hidden="true" />
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px' }}>
            <div style={{ font: '400 13px/18px var(--font-ui)', color: 'var(--player-faint)' }}>{label}</div>
            <h1 style={{ margin: '10px 0 0', font: '300 36px/43px var(--font-display)', color: 'var(--player-title)', letterSpacing: '-0.01em', textWrap: 'pretty' }}>
              {session.title}
            </h1>
            <p style={{ margin: '16px 0 0', font: '400 15px/24px var(--font-ui)', color: 'var(--player-muted)', maxWidth: 300, textWrap: 'pretty' }}>
              Lie down. Let the audio do the work. If you fall asleep, that is fine.
            </p>
          </div>

          <div style={{ position: 'relative', flex: 'none', padding: '0 32px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, marginBottom: 44 }}>
              <SkipButton dir="back" onClick={() => skip(-15)} />
              <button
                className="btn-play"
                style={{ width: 96, height: 96 }}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <span style={{ display: 'flex', gap: 8 }}>
                    <span style={{ width: 6, height: 32, borderRadius: 2, background: 'var(--player-bg)' }} />
                    <span style={{ width: 6, height: 32, borderRadius: 2, background: 'var(--player-bg)' }} />
                  </span>
                ) : (
                  <svg width="28" height="34" viewBox="0 0 28 34" aria-hidden="true">
                    <polygon points="4,2 26,17 4,32" fill="var(--player-bg)" />
                  </svg>
                )}
              </button>
              <SkipButton dir="forward" onClick={() => skip(15)} />
            </div>

            <div
              onClick={seek}
              role="progressbar"
              aria-label="Session progress"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 3, background: 'var(--player-track)', borderRadius: 'var(--r-pill)', marginBottom: 12, cursor: 'pointer' }}
            >
              <div style={{ width: `${pct}%`, height: 3, background: 'var(--control)', borderRadius: 'var(--r-pill)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: '400 13px/18px var(--font-ui)', color: 'var(--player-faint)' }}>
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>
        </>
      )}
    </Shell>
  )
}

// The only dark surface in the system — design 1b.
function Shell({ children }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--player-bg)', position: 'relative', display: 'flex', flexDirection: 'column', color: 'var(--player-body)', overflow: 'hidden' }}>
      <div aria-hidden="true" className="blob blob-a blob-drift" style={{ position: 'absolute', width: 320, height: 260, left: -60, top: 120, background: 'var(--player-blob-a)', filter: 'blur(40px)' }} />
      <div aria-hidden="true" className="blob blob-b" style={{ position: 'absolute', width: 240, height: 200, right: -50, bottom: 180, background: 'var(--player-blob-b)', filter: 'blur(36px)' }} />
      {children}
    </div>
  )
}

function SkipButton({ dir, onClick }) {
  const back = dir === 'back'
  return (
    <button
      onClick={onClick}
      aria-label={back ? 'Back 15 seconds' : 'Forward 15 seconds'}
      style={{ width: 56, height: 56, border: 'none', background: 'transparent', color: 'var(--player-muted)', font: '500 13px/18px var(--font-ui)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer' }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        {back ? (
          <>
            <path d="M9 3.5a5.5 5.5 0 1 1-5.2 3.7" stroke="var(--player-muted)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <path d="M2.2 3v4.2h4.2" stroke="var(--player-muted)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M9 3.5a5.5 5.5 0 1 0 5.2 3.7" stroke="var(--player-muted)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <path d="M15.8 3v4.2h-4.2" stroke="var(--player-muted)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>15</span>
    </button>
  )
}
