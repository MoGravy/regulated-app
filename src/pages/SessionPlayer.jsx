import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackSessionCompletion } from '../lib/supabase'
import { trackEvent, Events } from '../lib/analytics'
import { HARDCODED_SESSIONS_BY_ID } from '../lib/hardcodedSessions'
import MoodTracker from '../components/MoodTracker'

const STEP = { PRE_MOOD: 'pre_mood', PLAYING: 'playing', POST_MOOD: 'post_mood', DONE: 'done' }

export default function SessionPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userEmail, markSessionComplete } = useApp()

  const [title, setTitle] = useState(null)
  const [step, setStep] = useState(STEP.PRE_MOOD)
  const [moodBefore, setMoodBefore] = useState(null)
  const [moodAfter, setMoodAfter] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)

  const audioRef = useRef(null)
  const startRef = useRef(null)
  const timerRef = useRef(null)
  const autoStartRef = useRef(null)

  const FREE_TITLES = new Set(
    Object.values(HARDCODED_SESSIONS_BY_ID)
      .filter(s => s.free && s.audio_url)
      .map(s => s.title)
  )

  function resolve(title) {
    const s = Object.values(HARDCODED_SESSIONS_BY_ID).find(
      (x) => x.free && x.audio_url && x.title === title
    )
    return s ? s.audio_url : null
  }

  useEffect(() => {
    let cancelled = false
    const raw = decodeURIComponent(String(id || ''))
    const trimmed = raw.trim()
    if (!trimmed) return

    const session = HARDCODED_SESSIONS_BY_ID[trimmed]
    if (!session || !session.free || !session.audio_url) return

    if (!cancelled) {
      setTitle(session.title)
      setAudioUrl(session.audio_url)
      trackEvent(Events.SESSION_STARTED, { session_title: session.title })
    }
    return () => {
      cancelled = true
      clearTimeout(autoStartRef.current)
    }
  }, [id])

  useEffect(() => {
    if (!title || step !== STEP.PRE_MOOD || !audioUrl) return
    setDuration(600)
    autoStartRef.current = setTimeout(() => setStep(STEP.PLAYING), 1200)
  }, [step, title, audioUrl])

  useEffect(() => {
    if (step !== STEP.PLAYING || !audioUrl || !audioRef.current) return
    audioRef.current.play().catch(() => {})
  }, [step, audioUrl])

  useEffect(() => {
    if (!isPlaying || step !== STEP.PLAYING) return
    startRef.current = Date.now()
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setCurrentTime(elapsed)
      if (elapsed >= (duration || 600)) {
        clearInterval(timerRef.current)
        setIsPlaying(false)
        setStep(STEP.POST_MOOD)
      }
    }, 500)
    return () => clearInterval(timerRef.current)
  }, [isPlaying, step, duration])

  function handlePreMood(mood) {
    setMoodBefore(mood)
    setStep(STEP.PLAYING)
    trackEvent(Events.MOOD_TRACKED, { type: 'before', value: mood, session_title: title })
  }

  function handlePostMood(mood) {
    setMoodAfter(mood)
    markSessionComplete(title)
    trackSessionCompletion(null, userEmail, moodBefore, mood)
    trackEvent(Events.MOOD_TRACKED, { type: 'after', value: mood, session_title: title })
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

  const meta = Object.values(HARDCODED_SESSIONS_BY_ID).find((x) => x.title === title)

  if (!title || !meta) {
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
            trackEvent(Events.SESSION_ABANDONED, { session_title: title, time: currentTime })
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
              <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>{title}</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{meta.category} · {meta.duration} min</p>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 24 }}>
              <MoodTracker label="How regulated do you feel right now?" onSubmit={handlePreMood} />
            </div>
          </div>
        )}

        {step === STEP.PLAYING && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
            {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => { setIsPlaying(false); setStep(STEP.POST_MOOD) }} onError={() => setIsPlaying(false)} />}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 72, marginBottom: 12 }}>🎧</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h2>
              <p style={{ color: 'var(--text-muted)' }}>{fmt(currentTime)}</p>
            </div>
            <div style={{ width: '100%' }}>
              <div
                onClick={seek}
                style={{ height: 4, background: 'var(--border-solid)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
              >
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                    background: 'var(--accent)', borderRadius: 2,
                  }}
                />
                <div
                  style={{
                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                    width: 14, height: 14, borderRadius: '50%',
                    background: 'var(--accent)', marginLeft: -7,
                    boxShadow: '0 0 0 3px rgba(126,207,192,0.3)',
                  }}
                />
              </div>
            </div>
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
          </div>
        )}
      </div>
    </div>
  )
}
