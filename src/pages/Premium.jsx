import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'
import { upsertUser, checkSubscription } from '../lib/supabase'
import { stripePromise } from '../lib/stripe'
import { PROGRAM_APPROVED } from '../config/program'
import { ANNUAL_FOUNDING_PRICE, MONTHLY_PRICE, CUSTOM_AUDIO_PRICE } from '../config/pricing'

// Three price points, annual first. The design marks the preferred card by
// border weight only — no badge, no countdown, no struck-through price.
const PLANS = [
  {
    id: 'annual',
    label: 'Annual, founding rate',
    price: ANNUAL_FOUNDING_PRICE,
    note: `$${(ANNUAL_FOUNDING_PRICE / 12).toFixed(2)} a month, billed once a year. The founding rate stays at $${ANNUAL_FOUNDING_PRICE} for as long as you keep the subscription.`,
  },
  {
    id: 'monthly',
    label: 'Monthly',
    price: MONTHLY_PRICE,
    note: 'Billed monthly. Same content as annual.',
  },
]

export default function Premium() {
  const navigate = useNavigate()
  const { isPremium, userEmail, setUserEmail, addToast, setIsPremium } = useApp()
  const [selectedPlan, setSelectedPlan] = useState('annual')
  const [email, setEmail] = useState(userEmail || '')
  const [emailError, setEmailError] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const selected = PLANS.find(p => p.id === selectedPlan) || PLANS[0]

  async function handleSubscribe() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter the email you want the subscription on.')
      return
    }
    setEmailError('')
    setLoading(true)
    trackEvent(Events.PREMIUM_UPGRADE_STARTED, { plan: selectedPlan })

    try {
      setUserEmail(email)
      await upsertUser(email)

      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subscription', plan: selectedPlan, email }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Checkout failed')
      }

      const { url, sessionId } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        const stripe = await stripePromise
        const { error } = await stripe.redirectToCheckout({ sessionId })
        if (error) throw error
      }
    } catch (err) {
      console.error('[Premium] checkout failed:', err)
      addToast(err.message || 'Something went wrong. Please try again.', 'error')
      setLoading(false)
    }
  }

  // Re-checks the subscription against the email that bought it. Read-only —
  // it never writes a subscription row.
  async function handleRestore() {
    const target = email || userEmail
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setEmailError('Enter the email you bought with, then restore.')
      return
    }
    setEmailError('')
    setRestoring(true)
    try {
      const active = await checkSubscription(target)
      if (active) {
        setUserEmail(target)
        setIsPremium(true)
        addToast('Restored. Everything is unlocked.', 'success')
      } else {
        addToast('No active subscription on that email.', 'info')
      }
    } catch (err) {
      console.error('[Premium] restore failed:', err)
      addToast('Could not check that email. Try again.', 'error')
    } finally {
      setRestoring(false)
    }
  }

  if (isPremium) {
    return (
      <div className="page">
        <div className="status-bar"><span /><span>Regulated</span></div>
        <div className="page-content-wide" style={{ paddingTop: 8 }}>
          <h1 style={{ margin: '0 0 10px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em' }}>
            You have premium
          </h1>
          <p style={{ margin: '0 0 24px', font: '400 16px/25px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
            Every session is unlocked, including everything added from here.
          </p>
          <button className="btn-primary btn-lg" onClick={() => navigate('/sessions')}>
            Go to the library
          </button>
          <div className="divider" />
          <CustomAudioCard onClick={() => navigate('/custom')} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="status-bar"><span /><span>Regulated</span></div>

      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 12px', maxWidth: 480, margin: '0 auto' }}>
        <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="var(--ink-muted)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="page-content-wide">
        <h1 style={{ margin: '0 0 10px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em' }}>
          Premium
        </h1>
        <p style={{ margin: '0 0 18px', font: '400 16px/25px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
          All 13 sessions{PROGRAM_APPROVED ? ' and the six-week program' : ''}. New sessions are added
          monthly, on the way to 40. Cancel any time.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PLANS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              aria-pressed={selectedPlan === plan.id}
              className={`card ${selectedPlan === plan.id ? 'card-current' : ''}`}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: selectedPlan === plan.id ? 'var(--e1)' : 'none',
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ font: '400 21px/28px var(--font-display)', color: 'var(--ink)' }}>{plan.label}</span>
                <span style={{ font: '500 17px/24px var(--font-ui)', color: 'var(--ink)' }}>${plan.price}</span>
              </div>
              <div style={{ marginTop: 6, font: '400 13px/19px var(--font-ui)', color: 'var(--ink-muted)' }}>
                {plan.note}
              </div>
            </button>
          ))}

          <CustomAudioCard onClick={() => navigate('/custom')} />
        </div>

        <div className="divider" />

        <div className="form-group">
          <label className="form-label" htmlFor="premium-email">Email</label>
          <input
            id="premium-email"
            className="form-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'premium-email-error' : undefined}
          />
          {emailError && (
            <div id="premium-email-error" role="alert" style={{ font: '400 13px/18px var(--font-ui)', color: '#6A4B4E' }}>
              {emailError}
            </div>
          )}
        </div>

        <div style={{ font: '400 14px/22px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
          All sessions are written and recorded by Matthew Tweedie, clinical hypnotherapist, Adelaide.
        </div>
        <div style={{ height: 24 }} />
      </div>

      <div className="footer-cta" style={{ maxWidth: 480, margin: '0 auto', width: '100%', background: 'transparent', borderTop: 'none', padding: '0 24px 24px' }}>
        <button className="btn-primary btn-lg" onClick={handleSubscribe} disabled={loading}>
          {loading ? 'Opening checkout…' : `Continue at $${selected.price} ${selected.id === 'annual' ? 'a year' : 'a month'}`}
        </button>
        <button className="btn-ghost" onClick={handleRestore} disabled={restoring}>
          {restoring ? 'Checking…' : 'Restore a purchase'}
        </button>
      </div>
    </div>
  )
}

function CustomAudioCard({ onClick }) {
  return (
    <button onClick={onClick} className="card" style={{ textAlign: 'left', cursor: 'pointer', boxShadow: 'none', padding: 18, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ font: '400 21px/28px var(--font-display)', color: 'var(--ink)' }}>Custom audio</span>
        <span style={{ font: '500 17px/24px var(--font-ui)', color: 'var(--ink)' }}>${CUSTOM_AUDIO_PRICE}</span>
      </div>
      <div style={{ marginTop: 6, font: '400 13px/19px var(--font-ui)', color: 'var(--ink-muted)' }}>
        One session written and recorded for your situation. Bought separately, no subscription needed.
      </div>
    </button>
  )
}
