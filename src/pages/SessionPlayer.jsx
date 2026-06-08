import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { supabase, trackSessionCompletion } from '../lib/supabase'
import { trackEvent, Events } from '../lib/analytics'
import { HARDCODED_SESSIONS_BY_ID } from '../lib/hardcodedSessions'
import MoodTracker from '../components/MoodTracker'

// Numeric-keyed stubs removed — HARDCODED_SESSIONS_BY_ID is the fallback now
const DEMO_SESSIONS = {}

// Mood step states
const STEP = { PRE_MOOD: 'pre_mood', PLAYING: 'playing', POST_MOOD: 'post_mood', DONE: 'done' }

export default function SessionPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userEmail, markSessionComplete, isPremium, addToast } = useApp()

  const [session, setSession] = useState(null)
  const [step, setStep] = useState(STEP.PRE_MOOD)
  const [moodBefore, setMoodBefore] = useState(null)
  const [moodAfter, setMoodAfter] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioError, setAudioError] = useState(false)
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)

  const audioRef = useRef(null)
  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)

  // Load session — Supabase first (only when id is a real UUID), fall back to demo data
  useEffect(() => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = UUID_RE.test(id)

    async function loadSession() {
      console.log('[SessionPlayer] Loading session id:', id, '| looks like UUID:', isUuid)

      if (isUuid) {
        // Real UUID from Supabase — fetch the full row
        try {
          console.log('[SessionPlayer] Fetching from Supabase with UUID:', id)
          const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('id', id)
            .single()

          console.log('[SessionPlayer] Supabase response — data:', data, '| error:', error)

          if (data && !error) {
            console.log('Playing session with ID:', data.id)
            console.log('[SessionPlayer] ✓ Loaded:', data.title, '| audio_url:', data.audio_url || '(none)')
            setSession(data)
            return
          }

          console.warn('[SessionPlayer] Supabase returned no data. Full error:', JSON.stringify(error))
        } catch (e) {
          console.error('[SessionPlayer] Supabase fetch threw an exception:', e)
        }
      } else {
        // Numeric/demo ID — skip Supabase (it expects a UUID and will reject this)
        console.log('[SessionPlayer] Non-UUID id "' + id + '" — using demo data directly (no Supabase query)')
      }

      // Fall back: check hardcoded sessions first (have real audio_urls), then old demo stubs
      const hardcoded = HARDCODED_SESSIONS_BY_ID[id] || null
      const demo = hardcoded || DEMO_SESSIONS[id] || null
      const source = hardcoded ? 'hardcoded' : 'demo stub (no audio)'
      console.log('[SessionPlayer] Fallback lookup for id', id, '— source:', source, '| audio_url:', demo?.audio_url || '(none)')
      if (demo) console.log('Playing session with ID:', demo.id)
      setSession(demo)
    }

    loadSession()
    trackEvent(Events.SESSION_STARTED, { session_id: id })
    return () => clearInterval(intervalRef.current)
  }, [id])

  // Start audio playback when the playing step begins (after pre-mood)
  useEffect(() => {
    if (step !== STEP.PLAYING) return
    if (!session?.audio_url) return

    const audio = audioRef.current
    if (!audio) {
      console.warn('[Audio] audioRef not ready when step became PLAYING')
      return
    }

    console.log('[Audio] Element src attribute:', session.audio_url)
    console.log('[Audio] Element .src (resolved):', audio.src)
    console.log('[Audio] volume:', audio.volume, '| muted:', audio.muted, '| readyState:', audio.readyState)
    audio.volume = 1
    audio.muted = false
    console.log('[Audio] Calling play()…')

    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[Audio] play() resolved — audio is playing')
          setIsPlaying(true)
        })
        .catch(err => {
          console.error('[Audio] play() rejected:', err.name, '—', err.message)
          // Autoplay blocked — leave isPlaying false so user sees the Play button
          setIsPlaying(false)
        })
    }
  }, [step, session?.audio_url])

  // Debug overlay so the user can read which session is actually loaded
  const debugOverlay = session ? (
    <div style={{
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700
    }}>
      SESSION: {session.id} — {session.title}
    </div>
  ) : null

  // Simulate progress when no audio file (demo mode)
  useEffect(() => {
    if (step === STEP.PLAYING && !session?.audio_url && isPlaying) {
      const totalMs = (session?.duration || 15) * 60 * 1000
      startTimeRef.current = Date.now() - currentTime * 1000

      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000
        setCurrentTime(elapsed)

        if (elapsed >= (session?.duration || 15) * 60) {
          clearInterval(intervalRef.current)
          setIsPlaying(false)
          handleSessionComplete()
        }
      }, 500)

      return () => clearInterval(intervalRef.current)
    }
  }, [step, isPlaying, session?.audio_url])

  function handlePreMood(mood) {
    setMoodBefore(mood)
    setStep(STEP.PLAYING)
    // Note: isPlaying starts false — the useEffect above will call play() and set it true
    // For demo sessions (no audio_url), start the simulated timer
    if (!session?.audio_url) setIsPlaying(true)
    setDuration((session?.duration || 15) * 60)
    trackEvent(Events.MOOD_TRACKED, { type: 'before', value: mood, session_id: id })
  }

  function handleSessionComplete() {
    setStep(STEP.POST_MOOD)
    trackEvent(Events.SESSION_COMPLETED, { session_id: id })
  }

  async function handlePostMood(mood) {
    setMoodAfter(mood)
    markSessionComplete(id)
    await trackSessionCompletion(id, userEmail, moodBefore, mood)
    trackEvent(Events.MOOD_TRACKED, { type: 'after', value: mood, session_id: id })
    setStep(STEP.DONE)
    setTimeout(() => setShowCustomPrompt(true), 800)
  }

  function togglePlay() {
    const audio = audioRef.current

    if (audio) {
      if (isPlaying) {
        console.log('[Audio] Pausing')
        audio.pause()
        setIsPlaying(false)
        clearInterval(intervalRef.current)
      } else {
        console.log('[Audio] Resuming — calling play()…')
        audio.volume = 1
        audio.muted = false
        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[Audio] Resume play() resolved')
              setIsPlaying(true)
            })
            .catch(err => {
              console.error('[Audio] Resume play() rejected:', err.name, '—', err.message)
            })
        } else {
          setIsPlaying(true)
        }
      }
    } else {
      // Demo mode — no audio element
      if (isPlaying) {
        clearInterval(intervalRef.current)
      }
      setIsPlaying(prev => !prev)
    }
  }

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    const newTime = ratio * duration
    setCurrentTime(newTime)
    if (audioRef.current) audioRef.current.currentTime = newTime
    startTimeRef.current = Date.now() - newTime * 1000
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
          <div>Session not found</div>
          <button className="btn-ghost" onClick={() => navigate('/sessions')} style={{ marginTop: 16 }}>
            ← Back to sessions
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 24px',
      paddingTop: 'max(20px, env(safe-area-inset-top))',
      paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
    }}>
      {debugOverlay}

      {/* Back button */}
      <button
        onClick={() => {
          trackEvent(Events.SESSION_ABANDONED, { session_id: id, time: currentTime })
          if (audioRef.current) audioRef.current.pause()
          navigate(-1)
        }}
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: 15,
          cursor: 'pointer',
          padding: '8px 0',
          marginBottom: 16,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>

      {/* Pre-mood step */}
      {step === STEP.PRE_MOOD && (
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🧘</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                {session.title}
              </h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>
                {session.description}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {session.duration} minutes
              </p>
            </div>

            <div className="card">
              <MoodTracker
                label="How regulated do you feel right now?"
                onSubmit={handlePreMood}
              />
            </div>
          </div>
        </div>
      )}

      {/* Playing step */}
      {step === STEP.PLAYING && (
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>

          {/* Audio element — always rendered when there's a URL, so ref is available */}
          {session.audio_url && (
            <audio
              ref={audioRef}
              src={session.audio_url}
              preload="auto"
              onPlay={e => {
                console.log('[Audio] onPlay event — src:', e.target.src)
                setIsPlaying(true)
              }}
              onPause={e => {
                console.log('[Audio] onPause event — currentTime:', e.target.currentTime)
                setIsPlaying(false)
              }}
              onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={e => {
                console.log('[Audio] onLoadedMetadata — duration:', e.target.duration, 'src:', e.target.src)
                setDuration(e.target.duration)
              }}
              onCanPlay={e => console.log('[Audio] onCanPlay — browser can play, src:', e.target.src)}
              onStalled={e => console.warn('[Audio] onStalled — network stalled loading audio, src:', e.target.src)}
              onWaiting={e => console.warn('[Audio] onWaiting — buffering, src:', e.target.src)}
              onEnded={() => {
                console.log('[Audio] onEnded — session finished')
                setIsPlaying(false)
                handleSessionComplete()
              }}
              onError={e => {
                const err = e.target.error
                const codes = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' }
                console.error('[Audio] onerror event:', {
                  code: err?.code,
                  codeLabel: codes[err?.code] || 'UNKNOWN',
                  message: err?.message,
                  src: e.target.src,
                  networkState: e.target.networkState,
                  readyState: e.target.readyState,
                })
                setAudioError(true)
                setIsPlaying(false)
              }}
            />
          )}

          {/* Album art / waveform */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 200,
              height: 200,
              borderRadius: 28,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {isPlaying && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle, rgba(126,207,192,0.12) 0%, transparent 70%)',
                  animation: 'pulse 2s ease infinite',
                }} />
              )}
              <div style={{ fontSize: 72 }}>🎧</div>

              {isPlaying && (
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, marginTop: 12 }}>
                  {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 1, 0.7, 0.4].map((h, i) => (
                    <div key={i} style={{
                      width: 3,
                      height: `${h * 100}%`,
                      background: 'var(--accent)',
                      borderRadius: 2,
                      animation: `waveform ${0.6 + i * 0.1}s ease infinite`,
                      animationDelay: `${i * 0.08}s`,
                    }} />
                  ))}
                </div>
              )}
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
              {session.title}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {session.category} · {session.duration} min
            </p>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%' }}>
            <div
              onClick={seek}
              style={{
                height: 4,
                background: 'var(--border-solid)',
                borderRadius: 2,
                cursor: 'pointer',
                marginBottom: 8,
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.5s linear',
              }} />
              <div style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--accent)',
                marginLeft: -7,
                boxShadow: '0 0 0 3px rgba(126,207,192,0.3)',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration || (session.duration * 60))}</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {/* Rewind 15s */}
            <button
              onClick={() => {
                const t = Math.max(0, currentTime - 15)
                setCurrentTime(t)
                if (audioRef.current) audioRef.current.currentTime = t
                startTimeRef.current = Date.now() - t * 1000
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 8 }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.46"/>
                <text x="8" y="15" style={{ fontSize: '7px', fill: 'currentColor', stroke: 'none', fontWeight: 700 }}>15</text>
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--accent)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(126, 207, 192, 0.4)',
                transition: 'transform 0.15s ease',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--bg-deep)">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--bg-deep)" style={{ marginLeft: 3 }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              )}
            </button>

            {/* Forward 15s */}
            <button
              onClick={() => {
                const t = Math.min(duration || session.duration * 60, currentTime + 15)
                setCurrentTime(t)
                if (audioRef.current) audioRef.current.currentTime = t
                startTimeRef.current = Date.now() - t * 1000
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 8 }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-.49-3.46"/>
                <text x="8" y="15" style={{ fontSize: '7px', fill: 'currentColor', stroke: 'none', fontWeight: 700 }}>15</text>
              </svg>
            </button>
          </div>

          {audioError && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '0 20px' }}>
              Audio file not yet available. This session is coming soon.
            </div>
          )}

          {/* Mark complete manually (for demo) */}
          {!session.audio_url && (
            <button
              onClick={handleSessionComplete}
              className="btn-ghost"
              style={{ fontSize: 13 }}
            >
              Mark as complete →
            </button>
          )}
        </div>
      )}

      {/* Post-mood step */}
      {step === STEP.POST_MOOD && (
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              Session Complete
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
              Great work. One more question.
            </p>
          </div>
          <div className="card">
            <MoodTracker
              label="How do you feel now?"
              onSubmit={handlePostMood}
              optional
            />
          </div>
        </div>
      )}

      {/* Done step */}
      {step === STEP.DONE && (
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 20, textAlign: 'center' }}>

          {moodBefore !== null && moodAfter !== null && (
            <div className="card" style={{ width: '100%', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Your regulation shift</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 4 }}>😐</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{moodBefore}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Before</div>
                </div>
                <div style={{ fontSize: 24, color: moodAfter > moodBefore ? 'var(--success)' : 'var(--text-muted)' }}>
                  {moodAfter > moodBefore ? '↑' : moodAfter < moodBefore ? '↓' : '→'}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 4 }}>✨</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: moodAfter > moodBefore ? 'var(--success)' : 'var(--text-primary)' }}>{moodAfter}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>After</div>
                </div>
              </div>
              {moodAfter > moodBefore && (
                <div style={{ marginTop: 14, fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>
                  +{moodAfter - moodBefore} points regulated 🌟
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              Well done.
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Consistency is how lasting change is built. Come back tomorrow.
            </p>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-primary" onClick={() => navigate('/sessions')}>
              Explore More Sessions
            </button>
            <button className="btn-secondary" onClick={() => navigate('/')}>
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Custom audio prompt modal */}
      {showCustomPrompt && step === STEP.DONE && (
        <div className="modal-overlay" onClick={() => setShowCustomPrompt(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
              Want results built for you specifically?
            </h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              These sessions are powerful — but a custom audio built around <em>your exact pattern and triggers</em> is in a different league. Matthew builds it personally.
            </p>
            <button className="btn-primary" onClick={() => navigate('/custom')}>
              Order Custom Audio — $99
            </button>
            <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowCustomPrompt(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
