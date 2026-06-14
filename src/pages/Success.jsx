import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'

export default function Success() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { setIsPremium } = useApp()

  const type = params.get('type') // 'subscription' | 'custom_audio'
  const plan = params.get('plan') // 'annual' | 'monthly' | null
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
        Welcome to Regulated Premium.
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: plan === 'annual' ? 20 : 36, maxWidth: 340 }}>
        You now have access to every session in the library, with new sessions added every week. Everything Matthew creates goes straight to your library.
      </p>

      {plan === 'annual' && (
        <div style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--accent-glow)',
          border: '1px solid var(--border-solid)',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 24,
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 6 }}>
            YOUR FREE CUSTOM AUDIO
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
            Use this code at checkout when ordering your custom audio session (normally $99 — free for annual members):
          </div>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '0.12em',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            padding: '8px 14px',
            display: 'inline-block',
          }}>
            ANNUALFREE
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-primary" onClick={() => navigate('/sessions')}>
          Explore the Library
        </button>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={() => navigate('/')}>
          Go Home
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 28, lineHeight: 1.6, maxWidth: 300 }}>
        Questions? hello@regulatedapp.co
      </p>
    </div>
  )
}
