import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'
import { upsertUser } from '../lib/supabase'
import CouponField from '../components/CouponField'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')

const PLANS = [
  {
    id: 'annual',
    label: 'Annual',
    price: 99,
    period: '/year',
    perMonth: '$8.25/mo',
    badge: 'BEST VALUE',
    badgeColor: 'var(--accent)',
    priceEnvKey: 'VITE_STRIPE_PRICE_ANNUAL',
  },
  {
    id: 'monthly',
    label: 'Monthly',
    price: 14.99,
    period: '/month',
    perMonth: null,
    badge: null,
    priceEnvKey: 'VITE_STRIPE_PRICE_MONTHLY',
  },
]

const FEATURES = [
  { icon: '🎧', title: '40+ sessions', desc: 'Full library — sleep, anxiety, gut, confidence, focus, relationships, grief and more' },
  { icon: '🌙', title: 'Custom playlists', desc: 'Build your own sequence and save sessions for easy replay' },
  { icon: '📱', title: 'Offline downloads', desc: 'Download any session to listen without internet connection' },
  { icon: '🌐', title: 'Monthly live sessions', desc: 'Join Matthew live for monthly group regulation sessions (link in app)' },
  { icon: '📊', title: 'Progress tracking', desc: 'Full mood trends, regulation scores, and session history' },
  { icon: '⚡', title: 'Early access', desc: 'New sessions added monthly, you get them first' },
]

export default function Premium() {
  const navigate = useNavigate()
  const { isPremium, userEmail, setUserEmail, addToast, setIsPremium } = useApp()
  const [selectedPlan, setSelectedPlan] = useState('annual')
  const [email, setEmail] = useState(userEmail || '')
  const [emailError, setEmailError] = useState('')
  const [loading, setLoading] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState(null)

  const selectedPlanObj = PLANS.find(p => p.id === selectedPlan)
  const basePrice = selectedPlanObj?.price || 99

  function getDiscountedPrice() {
    if (!appliedCoupon) return null
    if (appliedCoupon.discount_type === 'percentage') {
      return Math.max(0, basePrice * (1 - appliedCoupon.discount_amount / 100))
    }
    return Math.max(0, basePrice - appliedCoupon.discount_amount)
  }
  const discountedPrice = getDiscountedPrice()

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

      const plan = PLANS.find(p => p.id === selectedPlan)
      const priceId = selectedPlan === 'annual'
        ? import.meta.env.VITE_STRIPE_PRICE_ANNUAL
        : import.meta.env.VITE_STRIPE_PRICE_MONTHLY

      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subscription',
          plan: selectedPlan,
          priceId,
          email,
          couponCode: appliedCoupon?.code || null,
          discountType: appliedCoupon?.discount_type || null,
          discountAmount: appliedCoupon?.discount_amount || null,
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
              Full access to all sessions, monthly live group calls, and everything new Matthew creates.
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
            40+ sessions covering every pattern. Built for lasting change, not quick fixes.
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
              <div style={{ fontSize: 22, fontWeight: 800, color: selectedPlan === plan.id ? 'var(--accent)' : 'var(--text-primary)' }}>
                ${plan.price}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {plan.period}
              </div>
              {plan.perMonth && (
                <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginTop: 4 }}>
                  {plan.perMonth}
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

        {/* Coupon code */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Have a coupon code?
          </div>
          <CouponField
            appliedCoupon={appliedCoupon}
            onApply={setAppliedCoupon}
            onRemove={() => setAppliedCoupon(null)}
          />
        </div>

        {/* Price display */}
        <div style={{ marginBottom: 16 }}>
          {discountedPrice !== null ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px',
              background: 'rgba(110, 201, 154, 0.06)',
              borderRadius: 12,
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 15, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                ${basePrice}{selectedPlanObj?.period}
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
                ${discountedPrice % 1 === 0 ? discountedPrice : discountedPrice.toFixed(2)}{selectedPlanObj?.period}
              </span>
              {discountedPrice === 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>FREE</span>
              )}
            </div>
          ) : null}
        </div>

        {/* CTA */}
        <button className="btn-primary" onClick={handleSubscribe} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? (
            <><span className="spinner" />Redirecting…</>
          ) : discountedPrice !== null ? (
            `Start Premium — $${discountedPrice % 1 === 0 ? discountedPrice : discountedPrice.toFixed(2)}${selectedPlanObj?.period}`
          ) : (
            `Start Premium — $${basePrice}${selectedPlanObj?.period}`
          )}
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>
          Secure payment via Stripe. Cancel anytime. Annual plan billed once per year.
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
            ['40+ full library', false, true],
            ['Offline downloads', false, true],
            ['Monthly live sessions', false, true],
            ['Progress analytics', false, true],
            ['Custom audio ordering', true, true],
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
            ['How is this different from the free sessions?', 'Premium unlocks 40+ sessions covering every major nervous system pattern — not just the 4 foundational tracks. Plus monthly live sessions with Matthew.'],
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
