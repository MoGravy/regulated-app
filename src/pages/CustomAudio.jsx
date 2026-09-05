import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { goBack } from '../lib/back'
import { trackEvent, Events } from '../lib/analytics'
import { useApp } from '../hooks/useApp'
import { stripePromise } from '../lib/stripe'
import { authHeaders } from '../lib/supabase'
import CouponField from '../components/CouponField'
import Texture from '../components/Texture'
import { CUSTOM_AUDIO_PRICE as PRICE } from '../config/pricing'

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
  const [step, setStep] = useState('intro') // 'intro' | 'form' | 'confirm'
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
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          type: 'custom_audio',
          email: form.email,
          pattern: form.pattern,
          trigger: form.trigger,
          desiredState: form.desiredState,
          affirmations: form.affirmations,
          // price and discount are server-authoritative; only the code is sent
          couponCode: appliedCoupon?.code || null,
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

  if (step === 'intro') return <CustomAudioIntro onStart={() => setStep('form')} onBack={() => goBack(navigate)} />

  return (
    <div className="page animate-fade-in">
      <div className="page-content" style={{ paddingTop: 56 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: '0 0 12px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em', textWrap: 'pretty' }}>
            A session made for you
          </h1>
          <p style={{ font: '400 16px/25px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
            Six questions, about ten minutes. Matthew writes and records from your answers.
          </p>
        </div>

        {/* What you get */}
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
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
              <span style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
          <div className="divider" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)' }}>${PRICE}</span>
            <span style={{ fontSize: 14, color: 'var(--ink-faint)' }}>one-time · 7-day turnaround</span>
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
              {errors.email && <span style={{ fontSize: 12, color: 'var(--cat-motivation)' }}>{errors.email}</span>}
              <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                Your custom audio will be delivered here.
              </span>
            </div>

            {/* Pattern — expanded with full instruction block */}
            <div className="form-group">
              <label className="form-label">Your Specific Pattern *</label>

              {/* Instruction block */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '18px 20px',
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.75, margin: '0 0 14px' }}>
                  Think of a situation that regularly triggers you. It might be a person, a place, a request, or a moment that always seems to pull you out of your calm.
                </p>
                <p style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.75, margin: '0 0 16px' }}>
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
                  <p style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.75, margin: 0, fontStyle: 'italic' }}>
                    You get home from a long day. Your boss messages asking you to send an urgent email tonight. You feel the familiar surge of panic and that tight, exhausted tension. Then you catch yourself. You take a breath and choose calm, confidence, and quiet determination. You reply honestly: "I'm exhausted after a full day. I can't get to this tonight." Your boss pauses, then steps back and respects that.
                  </p>
                </div>

                <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: 0 }}>
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
              {errors.pattern && <span style={{ fontSize: 12, color: 'var(--cat-motivation)' }}>{errors.pattern}</span>}
            </div>

            {/* Trigger */}
            <div className="form-group">
              <label className="form-label">Main Trigger *</label>
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 10px' }}>
                What's the specific moment, person, or feeling that sets the pattern off? Name it precisely — the more specific, the more targeted your audio will be.
              </p>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. When my boss messages me after 6pm. When I feel a pain in my chest. When someone doesn't reply."
                value={form.trigger}
                onChange={e => handleChange('trigger', e.target.value)}
              />
              {errors.trigger && <span style={{ fontSize: 12, color: 'var(--cat-motivation)' }}>{errors.trigger}</span>}
            </div>

            {/* Desired state */}
            <div className="form-group">
              <label className="form-label">Desired State *</label>
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 10px' }}>
                How do you want to feel when that trigger arrives? Describe the emotional and physical state — calm, grounded, confident, free. This is the destination your audio guides you toward.
              </p>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. Calm and grounded. Trusting my body. Present without panic. Able to set a boundary and feel okay about it."
                value={form.desiredState}
                onChange={e => handleChange('desiredState', e.target.value)}
                style={{ minHeight: 110, resize: 'vertical' }}
              />
              {errors.desiredState && <span style={{ fontSize: 12, color: 'var(--cat-motivation)' }}>{errors.desiredState}</span>}
            </div>

            {/* Affirmations */}
            <div className="form-group">
              <label className="form-label">
                Personal Affirmations
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--ink-faint)', fontSize: 12 }}>
                  (optional)
                </span>
              </label>
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 10px' }}>
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
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
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
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {value}
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Total</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  {appliedCoupon && (
                    <span style={{ fontSize: 15, color: 'var(--ink-faint)', textDecoration: 'line-through' }}>
                      ${PRICE}
                    </span>
                  )}
                  <span style={{ fontSize: 24, fontWeight: 800, color: appliedCoupon ? 'var(--cat-habits)' : 'var(--accent)' }}>
                    ${finalPrice % 1 === 0 ? finalPrice : finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 8 }}>
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

            <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              Secure payment via Stripe. You'll receive an email confirmation immediately and your custom audio within 7 days.
            </p>
          </div>
        )}

        {/* Social proof */}
        <div style={{ marginTop: 36, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.08em', marginBottom: 14 }}>
            WHAT OTHERS SAY
          </div>
          {[
            { quote: '"I\'d tried everything for my sleep anxiety. The custom audio Matthew made broke a pattern I\'d had for 6 years."', name: 'Sarah K.' },
            { quote: '"The specificity is what makes it different. It addressed my exact situation, not a generic relaxation track."', name: 'James R.' },
          ].map((t, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.7, marginBottom: 10, fontStyle: 'italic' }}>
                {t.quote}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)' }}>{t.name}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}

// The design's Custom audio board — three numbered steps in the sans, headings
// in the serif, no icon tiles. Sits in front of the existing brief form.
function CustomAudioIntro({ onStart, onBack }) {
  const STEPS = [
    ['A short written brief', 'Six questions, about ten minutes. No call needed.'],
    ['Written and recorded', 'Usually seven days. You will get an email when it is ready.'],
    ['Yours to keep', 'It stays in your library whether or not you subscribe. One free revision.'],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div className="status-bar"><span /><a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a></div>

      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 12px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <button className="btn-icon" onClick={onBack} aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3l-5 5 5 5" stroke="var(--ink-muted)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <h1 style={{ margin: '0 0 12px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em', textWrap: 'pretty' }}>
          A session made for you
        </h1>
        <p style={{ margin: '0 0 24px', font: '400 16px/25px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
          Tell Matthew what you are dealing with. He writes and records a session in your own language,
          for your situation, and it arrives in your library.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {STEPS.map(([title, desc], i) => (
            <div key={title} style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 'var(--r-pill)', background: 'var(--accent-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 13px/18px var(--font-ui)' }}>
                {i + 1}
              </div>
              <div>
                <div style={{ font: '400 18px/24px var(--font-display)', color: 'var(--ink)' }}>{title}</div>
                <div style={{ marginTop: 4, font: '400 14px/21px var(--font-ui)', color: 'var(--ink-muted)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="divider" style={{ margin: '26px 0 18px' }} />

        <div className="card texture" style={{ boxShadow: 'none' }}>
          <Texture ink="#5C4A5E" variant="quote" />
          <div style={{ position: 'relative', font: '400 15px/24px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
            Most people order a custom session for something specific: a procedure coming up, a flight,
            a habit that has not shifted with the library sessions.
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>

      <div className="footer-cta">
        <button className="btn-primary btn-lg" onClick={onStart}>
          Start a custom session · ${PRICE}
        </button>
        <div style={{ marginTop: 12, textAlign: 'center' }} className="t-caption">
          One payment. Brief first, pay before recording.
        </div>
      </div>
    </div>
  )
}
