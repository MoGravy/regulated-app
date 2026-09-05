import { useState } from 'react'
import { authHeaders } from '../lib/supabase'

export default function CouponField({ onApply, onRemove, appliedCoupon }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleApply() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await res.json()

      if (!res.ok || !data.valid) {
        setError(data.error || 'Invalid coupon code')
      } else {
        onApply(data)
        setCode('')
      }
    } catch (err) {
      console.error('[CouponField] validate-coupon failed:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      setError('Could not validate code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (appliedCoupon) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'rgba(110, 201, 154, 0.08)',
        border: '1px solid rgba(110, 201, 154, 0.3)',
        borderRadius: 12,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🏷️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cat-habits)' }}>
              {appliedCoupon.code} applied
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              {appliedCoupon.discount_type === 'percentage'
                ? `${appliedCoupon.discount_amount}% off`
                : `$${appliedCoupon.discount_amount} off`}
              {appliedCoupon.partner_name ? ` · ${appliedCoupon.partner_name}` : ''}
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-faint)',
            cursor: 'pointer',
            fontSize: 18,
            padding: '2px 4px',
            lineHeight: 1,
          }}
          aria-label="Remove coupon"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          className="form-input"
          placeholder="Coupon code"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
          style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        />
        <button
          onClick={handleApply}
          disabled={loading || !code.trim()}
          style={{
            padding: '14px 18px',
            background: 'var(--surface)',
            border: '1px solid var(--line-strong)',
            borderRadius: 12,
            color: 'var(--accent)',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
            opacity: loading || !code.trim() ? 0.5 : 1,
          }}
        >
          {loading ? '…' : 'Apply'}
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--cat-motivation)', marginTop: 6, paddingLeft: 2 }}>
          {error}
        </div>
      )}
    </div>
  )
}
