import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { getSessions } from '../lib/supabase'
import { HARDCODED_SESSIONS } from '../lib/hardcodedSessions'
import SessionCard from '../components/SessionCard'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Home() {
  const navigate = useNavigate()
  const { completedSessions, isPremium, onboardingDone } = useApp()
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
      const data = await getSessions(isPremium)
      if (data.length) setSessions(data)
    } catch {
      // Use demo data
    } finally {
      setLoading(false)
    }
  }

  const completedCount = completedSessions.length
  const freeSessions = sessions.filter(s => s.free)

  return (
    <div className="page animate-fade-in">
      <div className="page-content" style={{ paddingTop: 56 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                {getGreeting()}
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Regulated
              </h1>
            </div>
            {isPremium && (
              <span style={{
                padding: '6px 14px',
                background: 'var(--accent-glow)',
                border: '1px solid var(--border-solid)',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '0.06em',
              }}>
                PREMIUM ✦
              </span>
            )}
          </div>
        </div>

        {/* Progress Card */}
        {completedCount > 0 && (
          <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, #1A3A4A 0%, #1A2E40 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Your progress</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {completedCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    session{completedCount !== 1 ? 's' : ''} complete
                  </span>
                </div>
              </div>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: '3px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
              }}>
                {completedCount >= 10 ? '🌟' : completedCount >= 5 ? '✨' : '🌱'}
              </div>
            </div>
            <div style={{
              marginTop: 14,
              height: 4,
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min((completedCount / 10) * 100, 100)}%`,
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {10 - Math.min(completedCount, 10)} sessions to first milestone
            </div>
          </div>
        )}

        {/* Custom Audio Prompt — shown after first session */}
        {completedCount >= 1 && !isPremium && (
          <div
            onClick={() => navigate('/custom')}
            style={{
              background: 'linear-gradient(135deg, #1F3A30 0%, #1A3A3A 100%)',
              border: '1px solid rgba(126, 207, 192, 0.2)',
              borderRadius: 16,
              padding: '18px 20px',
              marginBottom: 24,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 32 }}>🎯</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                Want to solve your specific pattern?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Get a custom audio built around your exact triggers →
              </div>
            </div>
          </div>
        )}

        {/* Free Sessions */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Free Sessions
            </h2>
            <button
              onClick={() => navigate('/sessions')}
              style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              All sessions →
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  height: 72,
                  background: 'var(--bg-card)',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  animation: 'pulse 1.5s ease infinite',
                }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {freeSessions.map(session => (
                <SessionCard key={session.id} session={session} compact />
              ))}
            </div>
          )}
        </div>

        {/* Premium Upsell */}
        {!isPremium && (
          <div style={{ marginTop: 28, marginBottom: 8 }}>
            <div
              onClick={() => navigate('/premium')}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: '22px 20px',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 140,
                height: 140,
                background: 'radial-gradient(circle at top right, rgba(126, 207, 192, 0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 8 }}>
                PREMIUM
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>
                13 sessions and growing. New sessions added every week.
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.6 }}>
                Sleep, anxiety, confidence, relationships, gut health, grief, and more. Plus monthly live group sessions.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  padding: '10px 20px',
                  background: 'var(--accent)',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--bg-deep)',
                }}>
                  Unlock — $149/year
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or $19/mo</div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom spacer for safe scroll */}
        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
