import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'
import { upsertUser } from '../lib/supabase'
import { stripePromise } from '../lib/stripe'
import { ANNUAL_FOUNDING_PRICE, ANNUAL_FULL_PRICE, MONTHLY_PRICE } from '../config/pricing'

const PLANS = [
  {
    id: 'annual',
    label: 'Annual',
    price: ANNUAL_FOUNDING_PRICE,
    originalPrice: ANNUAL_FULL_PRICE,
    period: '/year',
    perMonth: '$12.42/mo',
    badge: 'FOUNDING MEMBER',
    badgeColor: 'var(--accent)',
    note: 'Includes 1 free custom audio — use code ANNUALFREE',
    subline: 'Locks in for life. Price rises to $199 when the library reaches 40 sessions.',
  },
  {
    id: 'monthly',
    label: 'Monthly',
    price: MONTHLY_PRICE,
    period: '/month',
    perMonth: null,
    badge: null,
    note: null,
  },
]

const FEATURES = [
  { icon: '🎧', title: '13 sessions and growing', desc: 'Full library — sleep, anxiety, gut, confidence, focus, relationships, grief and more. New sessions added every week.' },
  { icon: '🎯', title: 'Built for your pattern, not relaxation', desc: 'Every session targets a specific nervous system pattern: anxiety, sleep, gut, habits. This is hypnosis, not background ambience.' },
  { icon: '🎙️', title: 'Custom audio service', desc: 'Order a session recorded personally for your exact trigger and desired outcome. $99, or free with annual.' },
  { icon: '🧠', title: 'Made by a practitioner, not an algorithm', desc: 'Every session is written and recorded by Matthew, a clinical hypnosis and NLP practitioner, drawing on years of one on one client work.' },
  { icon: '🔒', title: 'Founding price locked for life', desc: '$149 a year now, and it never rises for you, even when the library hits 40 plus sessions and the price goes to $199.' },
  { icon: '⚡', title: 'Early access', desc: 'New sessions added every week. You get them first.' },
]

export default function Premium() {
  const navigate = useNavigate()
  const { isPremium, userEmail, setUserEmail, addToast, setIsPremium } = useApp()
  const [selectedPlan, setSelectedPlan] = useState('annual')
  const [email, setEmail] = useState(userEmail || '')
  const [emailError, setEmailError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedPlanObj = PLANS.find(p => p.id === selectedPlan)
  const basePrice = selectedPlanObj?.price || 149

  async function handleSubscribe() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Valid email required')
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
        body: JSON.stringify({
          type: 'subscription',
          plan: selectedPlan,
          email,
        }),
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
      console.error(err)
      addToast(err.message || 'Something went wrong. Please try again.', 'error')
      setLoading(false)
    }
  }

  if (isPremium) {
    return (
      <div className="page animate-fade-in">
        <div className="page-content" style={{ paddingTop: 56 }}>
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✦</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
              You're Premium
            </h1>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 32 }}>
              Full access to all sessions and everything new Matthew creates.
            </p>
            <button className="btn-primary" onClick={() => navigate('/sessions')}>
              Explore All Sessions
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page animate-fade-in">
      <div className="page-content" style={{ paddingTop: 56 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-block',
            padding: '6px 16px',
            background: 'var(--accent-glow)',
            border: '1px solid var(--border-solid)',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.08em',
            marginBottom: 16,
          }}>
            PREMIUM
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 12 }}>
            Your complete nervous system library.
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            13 sessions and growing. New sessions added every week. Built for lasting change, not quick fixes.
          </p>
        </div>

        {/* Plan selector */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {PLANS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              style={{
                flex: 1,
                padding: '16px 12px',
                background: selectedPlan === plan.id ? 'var(--accent-glow)' : 'var(--bg-card)',
                border: `2px solid ${selectedPlan === plan.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 16,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            >
              {plan.badge && (
                <div style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--accent)',
                  color: 'var(--bg-deep)',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 20,
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {plan.label}
              </div>
              {plan.originalPrice && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: 2 }}>
                  ${plan.originalPrice}/year
                </div>
              )}
              <div style={{ fontSize: 22, fontWeight: 800, color: selectedPlan === plan.id ? 'var(--accent)' : 'var(--text-primary)' }}>
                ${plan.price}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {plan.id === 'annual' ? '/year Founding Member rate' : plan.period}
              </div>
              {plan.perMonth && (
                <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginTop: 4 }}>
                  {plan.perMonth}
                </div>
              )}
              {plan.note && (
                <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>
                  {plan.note}
                </div>
              )}
              {plan.subline && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.4 }}>
                  {plan.subline}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Email field */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Email Address</label>
          <input
            type="email"
            className="form-input"
            placeholder="you@example.com"
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              setEmailError('')
            }}
          />
          {emailError && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{emailError}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            For login and welcome materials.
          </span>
        </div>

        {/* CTA */}
        <button className="btn-primary" onClick={handleSubscribe} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? (
            <><span className="spinner" />Redirecting…</>
          ) : (
            `Start Premium — $${basePrice}${selectedPlanObj?.period}`
          )}
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>
          Secure payment via Stripe. Cancel anytime. Annual plan billed once per year.{' '}
          Annual members get 1 free custom audio — use code <strong style={{ color: 'var(--accent)' }}>ANNUALFREE</strong> at checkout.
        </p>

        {/* Features */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 14 }}>
            EVERYTHING INCLUDED
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '14px 16px',
                background: 'var(--bg-card)',
                borderRadius: 14,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Roadmap strip */}
          <div style={{
            marginTop: 14,
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
              Coming for founding members: offline downloads, custom playlists, and progress tracking with mood trends and regulation scores. You are joining at the start. These arrive as the library grows.
            </p>
          </div>
        </div>

        {/* Free vs Premium comparison */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
            Free vs Premium
          </div>
          <div style={{ display: 'flex', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>FEATURE</div>
            <div style={{ width: 48, textAlign: 'center' }}>FREE</div>
            <div style={{ width: 64, textAlign: 'center', color: 'var(--accent)' }}>PREMIUM</div>
          </div>
          {[
            ['4 foundational sessions', true, true],
            ['Full library — 13 sessions and growing', false, true],
            ['Custom audio ordering', true, true],
            ['Early access to new sessions', false, true],
          ].map(([label, free, premium]) => (
            <div key={label} style={{
              display: 'flex',
              alignItems: 'center',
              paddingBottom: 10,
              marginBottom: 10,
              borderBottom: '1px solid var(--border)',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}>
              <div style={{ flex: 1 }}>{label}</div>
              <div style={{ width: 48, textAlign: 'center', color: free ? 'var(--success)' : 'var(--text-muted)' }}>
                {free ? '✓' : '—'}
              </div>
              <div style={{ width: 64, textAlign: 'center', color: premium ? 'var(--accent)' : 'var(--text-muted)' }}>
                {premium ? '✓' : '—'}
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 14 }}>
            FAQ
          </div>
          {[
            ['Can I cancel anytime?', 'Yes. Cancel from your account settings or email hello@regulatedapp.co. No questions asked.'],
            ['How is this different from the free sessions?', 'Premium unlocks the full library — 13 sessions and growing, covering every major nervous system pattern beyond the 4 foundational tracks. Every session is written and recorded by Matthew, targeting specific patterns.'],
            ['What if I already ordered a custom audio?', 'Custom audio is a separate one-time purchase. Premium is the ongoing library. They work perfectly together but are independent.'],
          ].map(([q, a]) => (
            <FAQItem key={q} question={q} answer={a} />
          ))}
        </div>

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: '4px 0',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{question}</span>
        <span style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(45deg)' : 'none', flexShrink: 0 }}>+</span>
      </button>
      {open && (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8, animation: 'fadeIn 0.2s ease' }}>
          {answer}
        </p>
      )}
    </div>
  )
}
