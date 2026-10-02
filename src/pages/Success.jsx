import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { trackEvent, Events } from '../lib/analytics'
import { CUSTOM_AUDIO_PRICE } from '../config/pricing'
import { apiUrl } from '../lib/apiUrl'
import { ui } from '../content/reviewedCopy.js'

export default function Success() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  return <Receipt key={sessionId || ''} sessionId={sessionId} />
}

function Receipt({ sessionId }) {
  const navigate = useNavigate()
  const { refreshPremium, isPremium } = useApp()
  const [receipt, setReceipt] = useState({ status: sessionId ? 'pending' : 'failed' })

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    async function verify() {
      try {
        const res = await fetch(apiUrl(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`))
        if (!res.ok) throw new Error('Receipt request failed')
        const data = await res.json()
        if (cancelled) return
        const settled = data.status === 'paid' || (data.status === 'no_payment_required' && data.type === 'custom_audio')
        if (!settled || !['subscription', 'custom_audio'].includes(data.type)) {
          setReceipt({ status: 'failed' })
          return
        }
        setReceipt({ status: 'confirmed', data })
        if (data.type === 'subscription') {
          refreshPremium().catch(() => console.error('[Success] subscription check failed'))
          trackEvent(Events.PREMIUM_UPGRADE_COMPLETED)
        } else {
          trackEvent(Events.CUSTOM_AUDIO_ORDER_COMPLETED)
        }
      } catch {
        if (!cancelled) setReceipt({ status: 'failed' })
      }
    }
    void verify()
    return () => { cancelled = true }
  }, [sessionId, refreshPremium])

  const confirmed = receipt.status === 'confirmed'
  const custom = confirmed && receipt.data.type === 'custom_audio'
  const showAnnualCode = confirmed && receipt.data.type === 'subscription' && receipt.data.plan === 'annual'
  const title = !confirmed ? ui[`payment_${receipt.status}_title`]
    : custom ? ui.payment_confirmed_title.replace('Payment', 'Purchase') : ui.payment_confirmed_title
  const body = !confirmed ? ui[`payment_${receipt.status}_body`]
    : custom ? ui.payment_confirmed_body.split('.')[0].replace(' as paid', '') + '.' : ui.payment_confirmed_body

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', marginBottom: 12, lineHeight: 1.2 }}>{title}</h1>
      <p role="status" style={{ fontSize: 16, color: 'var(--ink-muted)', lineHeight: 1.7, marginBottom: 24, maxWidth: 440 }}>{body}</p>
      {confirmed && !custom && isPremium && <p>{ui.purchase_active}</p>}
      {custom && <p style={{ maxWidth: 440 }}>{ui.custom_delivery_help}</p>}
      {showAnnualCode && (
        <div className="card" style={{ width: '100%', maxWidth: 440, marginBottom: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>YOUR FREE CUSTOM AUDIO</div>
          <p>{ui.annual_custom_help}</p>
          <p>Custom audio normally A${CUSTOM_AUDIO_PRICE}</p>
          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, letterSpacing: '0.12em' }}>ANNUALFREE</div>
        </div>
      )}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {confirmed && !custom && !isPremium && <button className="btn-primary" onClick={() => navigate('/signin')}>Sign in</button>}
        <button className="btn-primary" onClick={() => navigate('/sessions')}>Explore the Library</button>
        <button className="btn-ghost" onClick={() => navigate('/')}>Go Home</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 28, lineHeight: 1.6, maxWidth: 340 }}>Questions? info@matthewtweediehypnosis.com.au</p>
    </div>
  )
}
