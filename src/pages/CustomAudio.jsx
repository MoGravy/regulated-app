import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackEvent, Events } from '../lib/analytics'
import { useApp } from '../hooks/useApp'
import { stripePromise } from '../lib/stripe'
import CouponField from '../components/CouponField'

const PRICE = 99

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
      e.pattern = 'Please describe your pattern — the more detail, the better the audio'
    }
    if (!form.trigger.trim()) {
      e.trigger = 'Required — this anchors the whole session'
    }
    if (!form.desiredState.trim()) {
      e.desiredState = 'Required — this is where we guide you'
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
      setUserEmail(form.email)

      // Send all order details to the backend — no Supabase call needed here.
      // The serverless function embeds the fields in Stripe metadata, and the
      // webhook creates the confirmed order in the database after payment.
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom_audio',
          email: form.email,
          pattern: form.pattern,
          trigger: form.trigger,
          desiredState: form.desiredState,
          affirmations: form.affirmations,
          amount: Math.round(finalPrice * 100),
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
        <div className="card" style={{ marginBottom: 28 }}>
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

            {/* Email */}
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

            {/* Pattern — expanded with full instruction block */}
            <div className="form-group">
              <label className="form-label">Your Specific Pattern *</label>

              {/* Instruction block */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '18px 20px',
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 14px' }}>
                  Think of a situation that regularly triggers you. It might be a person, a place, a request, or a moment that always seems to pull you out of your calm.
                </p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 16px' }}>
                  Write it as a short scene, like you're describing it to a friend. Include what happens, how your body feels, and how you want to feel instead.
                </p>

                {/* Example */}
                <div style={{
                  background: 'rgba(126, 207, 192, 0.06)',
                  border: '1px solid rgba(126, 207, 192, 0.2)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 8 }}>
                    EXAMPLE
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0, fontStyle: 'italic' }}>
                    You get home from a long day. Your boss messages asking you to send an urgent email tonight. You feel the familiar surge of panic and that tight, exhausted tension. Then you catch yourself. You take a breath and choose calm, confidence, and quiet determination. You reply honestly: "I'm exhausted after a full day. I can't get to this tonight." Your boss pauses, then steps back and respects that.
                  </p>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  Your pattern doesn't need to be dramatic. It just needs to be real.
                </p>
              </div>

              <textarea
                className="form-input form-textarea"
                placeholder="Describe your pattern here…"
                value={form.pattern}
                onChange={e => handleChange('pattern', e.target.value)}
                style={{ minHeight: 300, resize: 'vertical' }}
              />
              {errors.pattern && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.pattern}</span>}
            </div>

            {/* Trigger */}
            <div className="form-group">
              <label className="form-label">Main Trigger *</label>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px' }}>
                What's the specific moment, person, or feeling that sets the pattern off? Name it precisely — the more specific, the more targeted your audio will be.
              </p>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. When my boss messages me after 6pm. When I feel a pain in my chest. When someone doesn't reply."
                value={form.trigger}
                onChange={e => handleChange('trigger', e.target.value)}
              />
              {errors.trigger && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.trigger}</span>}
            </div>

            {/* Desired state */}
            <div className="form-group">
              <label className="form-label">Desired State *</label>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px' }}>
                How do you want to feel when that trigger arrives? Describe the emotional and physical state — calm, grounded, confident, free. This is the destination your audio guides you toward.
              </p>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. Calm and grounded. Trusting my body. Present without panic. Able to set a boundary and feel okay about it."
                value={form.desiredState}
                onChange={e => handleChange('desiredState', e.target.value)}
                style={{ minHeight: 110, resize: 'vertical' }}
              />
              {errors.desiredState && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{errors.desiredState}</span>}
            </div>

            {/* Affirmations */}
            <div className="form-group">
              <label className="form-label">
                Personal Affirmations
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                  (optional)
                </span>
              </label>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px' }}>
                Any specific phrases, beliefs, or statements you want Matthew to weave into the audio. These become part of your session's language — phrases that feel true to you, not generic.
              </p>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. My body is safe. I trust myself. I am allowed to rest. I don't owe anyone my exhaustion."
                value={form.affirmations}
                onChange={e => handleChange('affirmations', e.target.value)}
                style={{ minHeight: 110, resize: 'vertical' }}
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
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
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

            <div style={{ marginBottom: 20 }}>
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

        {/* Social proof */}
        <div style={{ marginTop: 36, marginBottom: 8 }}>
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
