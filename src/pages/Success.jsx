import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'

export default function Success() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { setIsPremium } = useApp()

  const type = params.get('type') // 'subscription' | 'custom_audio'
  const sessionId = params.get('session_id')

  // Fire analytics in the background — never block rendering on this
  useEffect(() => {
    if (!sessionId) return
    async function verifyInBackground() {
      try {
        const res = await fetch(`/api/verify-session?session_id=${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'paid' || data.status === 'complete') {
            if (type === 'subscription') {
              setIsPremium(true)
              trackEvent(Events.PREMIUM_UPGRADE_COMPLETED)
            } else {
              trackEvent(Events.CUSTOM_AUDIO_ORDER_COMPLETED)
            }
          }
        }
      } catch {
        // Ignore — webhook already handled the order
      }
    }
    verifyInBackground()
  }, [sessionId, type])

  // Render immediately — no loading gate. Payment already confirmed by Stripe
  // redirecting here with a session_id.

  if (type === 'custom_audio') {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'var(--bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 28px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>🎯</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.2 }}>
          Order confirmed.
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8, maxWidth: 340 }}>
          Matthew will create your personalized audio and deliver it to your email within 7 days.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 36, maxWidth: 320 }}>
          Check your inbox for a confirmation email. If you don't see it, check your spam folder.
        </p>

        <div style={{ width: '100%', maxWidth: 380 }}>
          <div className="card" style={{ marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              What happens next
            </div>
            {[
              ['📧', 'Check your email', 'Confirmation sent immediately'],
              ['🎙️', 'Matthew records', 'Your custom session in the next 3–5 days'],
              ['📬', 'Audio delivered', 'To your inbox within 7 days'],
              ['♾️', 'Replay forever', 'Yours to keep and use whenever you need it'],
            ].map(([icon, step, detail]) => (
              <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{step}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>

          <button className="btn-primary" onClick={() => navigate('/')}>
            Back to Sessions
          </button>
          <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => navigate('/premium')}>
            Upgrade to Premium
          </button>
        </div>
      </div>
    )
  }

  // Premium success
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 28px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 72, marginBottom: 20 }}>✦</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.2 }}>
        Welcome to Premium.
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 36, maxWidth: 340 }}>
        You now have access to every session in the library, monthly live calls, and everything Matthew creates going forward.
      </p>

      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-primary" onClick={() => navigate('/sessions')}>
          Explore All 40+ Sessions
        </button>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={() => navigate('/')}>
          Go Home
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 28, lineHeight: 1.6, maxWidth: 300 }}>
        Check your email for your welcome message and onboarding guide. Questions? hello@regulatedapp.co
      </p>
    </div>
  )
}
