import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { supabase, trackSessionCompletion, SESSION_COLUMNS, getCachedSession } from '../lib/supabase'
import { trackEvent, Events } from '../lib/analytics'
import { HARDCODED_SESSIONS_BY_ID } from '../lib/hardcodedSessions'
import MoodTracker from '../components/MoodTracker'
import { CUSTOM_AUDIO_PRICE } from '../config/pricing'

const STEP = { PRE_MOOD: 'pre_mood', PLAYING: 'playing', POST_MOOD: 'post_mood', DONE: 'done' }

export default function SessionPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userEmail, markSessionComplete } = useApp()

  const [session, setSession] = useState(null)   // DB row (safe columns) — single source of truth
  const [audioUrl, setAudioUrl] = useState(null)  // resolved at play time — premium via signed URL endpoint
  const [loadError, setLoadError] = useState(false)
  const [step, setStep] = useState(STEP.PRE_MOOD)
  const [moodBefore, setMoodBefore] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)

  const audioRef = useRef(null)
  const startRef = useRef(null)
  const timerRef = useRef(null)
  const autoStartRef = useRef(null)
  const wakeLockRef = useRef(null)

  // ---------------------------------------------------------------------------
  // Load session: Supabase first, hardcoded fallback on error
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
        console.log('[SessionPlayer] Loaded from DB:', data.title)
        setSession(data)
        trackEvent(Events.SESSION_STARTED, { session_title: data.title })
        return
      }

      // Supabase failed — try hardcoded fallback
      console.warn('[SessionPlayer] DB fetch failed:', JSON.stringify(error), '— trying hardcoded fallback')
      const fallback = HARDCODED_SESSIONS_BY_ID[trimmed]
      if (fallback) {
        console.log('[SessionPlayer] Using hardcoded fallback:', fallback.title)
        setSession(fallback)
        trackEvent(Events.SESSION_STARTED, { session_title: fallback.title })
      } else {
        console.error('[SessionPlayer] No session found for id:', trimmed)
        setLoadError(true)
      }
    }

    fetchSession()
    return () => {
      cancelled = true
      clearTimeout(autoStartRef.current)
    }
  }, [id])

  // Resolve the playable URL once the session is loaded. Hardcoded fallback
  // rows carry audio_url directly; DB rows never include it — free and premium
  // both go through the endpoint (free returns the public URL, premium returns
  // a 2h signed URL after a subscription check).
  useEffect(() => {
    if (!session) return
    const hasAudio = session.has_audio ?? !!session.audio_url
    if (!hasAudio) return
    if (session.audio_url) { setAudioUrl(session.audio_url); return }

    let cancelled = false
    async function resolveUrl() {
      try {
        const res = await fetch('/api/get-audio-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, email: userEmail }),
        })
        if (cancelled) return
        if (res.status === 401 || res.status === 403) {
          navigate('/premium')
          return
        }
        if (!res.ok) throw new Error(`get-audio-url responded ${res.status}`)
        const data = await res.json()
        setAudioUrl(data.url)
      } catch (err) {
        if (cancelled) return
        console.error('[SessionPlayer] get-audio-url failed:', err?.message || err)
        setLoadError(true)
      }
    }
    resolveUrl()
    return () => { cancelled = true }
  }, [session])

  // Auto-advance to PLAYING after mood selection delay
  useEffect(() => {
    if (!session || step !== STEP.PRE_MOOD) return
    setDuration((session.duration || 20) * 60)
    autoStartRef.current = setTimeout(() => setStep(STEP.PLAYING), 1200)
  }, [step, session])

  // Play audio when step becomes PLAYING
  useEffect(() => {
    if (step !== STEP.PLAYING || !audioUrl || !audioRef.current) return
    audioRef.current.play().catch(() => {})
  }, [step, audioUrl])

  // Timer tick
  useEffect(() => {
    if (!isPlaying || step !== STEP.PLAYING) return
    startRef.current = Date.now()
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setCurrentTime(elapsed)
      if (elapsed >= (duration || 1200)) {
        clearInterval(timerRef.current)
        setIsPlaying(false)
        setStep(STEP.POST_MOOD)
      }
    }, 500)
    return () => clearInterval(timerRef.current)
  }, [isPlaying, step, duration])

  // Wake lock — request when playing, release on pause/end/unmount
  useEffect(() => {
    if (isPlaying) {
      navigator.wakeLock?.request('screen').then(lock => {
        wakeLockRef.current = lock
      }).catch(() => {})
    } else {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
    return () => {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isPlaying])

  function handlePreMood(mood) {
    setMoodBefore(mood)
    setStep(STEP.PLAYING)
    trackEvent(Events.MOOD_TRACKED, { type: 'before', value: mood, session_title: session?.title })
  }

  function handlePostMood(mood) {
    markSessionComplete(session?.title)
    trackSessionCompletion(null, userEmail, moodBefore, mood)
    trackEvent(Events.MOOD_TRACKED, { type: 'after', value: mood, session_title: session?.title })
    setStep(STEP.DONE)
    setTimeout(() => setShowCustomPrompt(true), 800)
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (isPlaying) {
      a.pause()
      setIsPlaying(false)
    } else {
      a.play().catch(() => {})
      setIsPlaying(true)
    }
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

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (loadError) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
          <div>Session not found</div>
          <button className="btn-ghost" onClick={() => navigate('/sessions')} style={{ marginTop: 16 }}>← Back to sessions</button>
        </div>
      </div>
    )
  }

  if (session && !(session.has_audio ?? !!session.audio_url)) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)' }}>
        <div style={{ padding: '24px 24px 0' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🎙️</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            {session.title}
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8, maxWidth: 300 }}>
            This session is being recorded and will be available soon.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>
            {session.category} · {session.duration} min
          </p>
          <button className="btn-ghost" onClick={() => navigate('/sessions')}>
            ← Back to sessions
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <span className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
          padding: '0 24px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <button
          onClick={() => {
            trackEvent(Events.SESSION_ABANDONED, { session_title: session.title, time: currentTime })
            audioRef.current?.pause()
            navigate(-1)
          }}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 24 }}
        >
          ← Back
        </button>

        {step === STEP.PRE_MOOD && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🧘</div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>{session.title}</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {session.category} · {session.duration} min
              </p>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 24 }}>
              <MoodTracker label="How regulated do you feel right now?" onSubmit={handlePreMood} />
            </div>
          </div>
        )}

        {step === STEP.PLAYING && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={e => setDuration(e.target.duration)}
                onEnded={() => { setIsPlaying(false); setStep(STEP.POST_MOOD) }}
                onError={() => setIsPlaying(false)}
              />
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 72, marginBottom: 12 }}>🎧</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{session.title}</h2>
              <p style={{ color: 'var(--text-muted)' }}>{fmt(currentTime)}</p>
            </div>

            {/* Scrub bar */}
            <div style={{ width: '100%' }}>
              <div
                onClick={seek}
                style={{ height: 4, background: 'var(--border-solid)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                  background: 'var(--accent)', borderRadius: 2,
                }} />
                <div style={{
                  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                  left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                  width: 14, height: 14, borderRadius: '50%',
                  background: 'var(--accent)', marginLeft: -7,
                  boxShadow: '0 0 0 3px rgba(126,207,192,0.3)',
                }} />
              </div>
            </div>

            {/* Transport controls: skip back · play/pause · skip forward */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <button
                onClick={() => skip(-15)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 600 }}>15s</span>
              </button>

              <button
                onClick={togglePlay}
                style={{
                  width: 76, height: 76, borderRadius: '50%', background: 'var(--accent)',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--bg-deep)"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--bg-deep)" style={{ marginLeft: 3 }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
                )}
              </button>

              <button
                onClick={() => skip(15)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-.49-3.51" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 600 }}>15s</span>
              </button>
            </div>
          </div>
        )}

        {step === STEP.POST_MOOD && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <MoodTracker label="How regulated do you feel now?" onSubmit={handlePostMood} />
          </div>
        )}

        {step === STEP.DONE && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✨</div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Session complete</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Nice work. You showed up for yourself today.</p>
            </div>
            <button className="btn-primary" onClick={() => navigate('/sessions')} style={{ padding: '14px 28px' }}>Back to sessions</button>
            {showCustomPrompt && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Want a session built for your exact pattern?
                </p>
                <button className="btn-ghost" onClick={() => navigate('/custom')}>
                  Order Custom Audio — ${CUSTOM_AUDIO_PRICE}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
