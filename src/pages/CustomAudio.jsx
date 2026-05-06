import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCustomOrder } from '../lib/supabase'
import { trackEvent, Events } from '../lib/analytics'
import { useApp } from '../hooks/useApp'
import { stripePromise } from '../lib/stripe'
import CouponField from '../components/CouponField'

const PRICE = 75

export default function CustomAudio() {
  const navigate = useNavigate()
  const { addToast, setUserEmail } = useApp()

  const [form, setForm] = useState({
    email: '',
    pattern: '',
    trigger: '',
    desiredState: '',
    affirmations: '',
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('form') // 'form' | 'confirm'
  const [appliedCoupon, setAppliedCoupon] = useState(null)

  function getDiscountedPrice() {
    if (!appliedCoupon) return PRICE
    if (appliedCoupon.discount_type === 'percentage') {
      return Math.max(0, PRICE * (1 - appliedCoupon.discount_amount / 100))
    }
    return Math.max(0, PRICE - appliedCoupon.discount_amount)
  }
  const finalPrice = getDiscountedPrice()

  function validate() {
    const e = {}
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Valid email required for delivery'
    }
    if (!form.pattern.trim() || form.pattern.trim().length < 20) {
      e.pattern = 'Please describe your pattern in detail (at least 20 characters)'
    }
    if (!form.trigger.trim()) {
      e.trigger = 'Trigger is required'
    }
    if (!form.desiredState.trim()) {
      e.desiredState = 'Desired state is required'
    }
    return e
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  function handleReview(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) {
      setErrors(e2)
      return
    }
    setStep('confirm')
    trackEvent(Events.CUSTOM_AUDIO_ORDER_STARTED)
  }

  async function handleCheckout() {
    setLoading(true)
    try {
      // Create order record in Supabase first
      const order = await createCustomOrder({
        user_email: form.email,
        pattern: form.pattern,
        trigger: form.trigger,
        desired_state: form.desiredState,
        affirmations: form.affirmations,
      })

      // Save email to local state
      setUserEmail(form.email)

      // Create Stripe checkout session
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom_audio',
          orderId: order.id,
          email: form.email,
          amount: Math.round(finalPrice * 100), // cents, post-discount
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

  return (
    <div className="page animate-fade-in">
      <div className="page-content" style={{ paddingTop: 56 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 8 }}>
            CUSTOM AUDIO
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 12 }}>
            Built for your exact pattern.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Matthew personally creates a 20–30 minute audio session targeting your specific pattern, trigger, and desired outcome. Delivered within 7 days.
          </p>
        </div>

        {/* What you get */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
            What's included
          </div>
          {[
            ['🎯', 'Personalized to your exact nervous system pattern'],
            ['🎧', '20–30 minute custom session, professionally recorded'],
            ['📧', 'Delivered to your email within 7 days'],
            ['♾️', 'Yours to keep and replay forever'],
            ['💬', 'Optional affirmations you write, woven in'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
          <div className="divider" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>${PRICE}</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>one-time · 7-day turnaround</span>
          </div>
        </div>

        {step === 'form' && (
          <form onSubmit={handleReview}>

            <div className="form-group">
              <label className="form-label">Your Email *</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
              />
              {errors.email && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.email}</span>}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Your custom audio will be delivered here.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Your Specific Pattern *</label>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. I've struggled with health anxiety for 3 years. Every time I feel a physical sensation, my mind immediately catastrophises to worst-case illness. I've tried therapy but the pattern keeps returning..."
                value={form.pattern}
                onChange={e => handleChange('pattern', e.target.value)}
                style={{ minHeight: 130 }}
              />
              {errors.pattern && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.pattern}</span>}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Be as specific as possible. This is what Matthew builds around.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Main Trigger *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Physical sensations, social situations, work stress, conflict..."
                value={form.trigger}
                onChange={e => handleChange('trigger', e.target.value)}
              />
              {errors.trigger && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.trigger}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Desired State *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Calm and grounded. Trusting my body. Free from the anxiety loop."
                value={form.desiredState}
                onChange={e => handleChange('desiredState', e.target.value)}
              />
              {errors.desiredState && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.desiredState}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">
                Personal Affirmations
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                  (optional)
                </span>
              </label>
              <textarea
                className="form-input form-textarea"
                placeholder="Any specific phrases or beliefs you want woven into the audio. e.g. 'My body is safe. I trust myself. I am enough.'"
                value={form.affirmations}
                onChange={e => handleChange('affirmations', e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
              Review Order
            </button>
          </form>
        )}

        {step === 'confirm' && (
          <div className="animate-fade-in">
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                Order Summary
              </div>
              {[
                ['Email', form.email],
                ['Pattern', form.pattern],
                ['Trigger', form.trigger],
                ['Desired State', form.desiredState],
                form.affirmations ? ['Affirmations', form.affirmations] : null,
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {value}
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Total</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  {appliedCoupon && (
                    <span style={{ fontSize: 15, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                      ${PRICE}
                    </span>
                  )}
                  <span style={{ fontSize: 24, fontWeight: 800, color: appliedCoupon ? 'var(--success)' : 'var(--accent)' }}>
                    ${finalPrice % 1 === 0 ? finalPrice : finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Coupon field on confirm step */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Have a coupon code?
              </div>
              <CouponField
                appliedCoupon={appliedCoupon}
                onApply={setAppliedCoupon}
                onRemove={() => setAppliedCoupon(null)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-primary"
                onClick={handleCheckout}
                disabled={loading}
              >
                {loading ? (
                  <><span className="spinner" />Redirecting to payment…</>
                ) : (
                  <>Pay ${finalPrice % 1 === 0 ? finalPrice : finalPrice.toFixed(2)} → Get My Custom Audio</>
                )}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setStep('form')}
                disabled={loading}
                style={{ width: '100%' }}
              >
                ← Edit order
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              Secure payment via Stripe. You'll receive an email confirmation immediately and your custom audio within 7 days.
            </p>
          </div>
        )}

        {/* Testimonial-style social proof */}
        <div style={{ marginTop: 32, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 14 }}>
            WHAT OTHERS SAY
          </div>
          {[
            { quote: '"I\'d tried everything for my sleep anxiety. The custom audio Matthew made broke a pattern I\'d had for 6 years."', name: 'Sarah K.' },
            { quote: '"The specificity is what makes it different. It addressed my exact situation, not a generic relaxation track."', name: 'James R.' },
          ].map((t, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10, fontStyle: 'italic' }}>
                {t.quote}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{t.name}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
