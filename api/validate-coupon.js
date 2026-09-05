import { createClient } from '@supabase/supabase-js'
import { annualFreeCheck, ANNUAL_FREE } from './_annualfree.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, type } = req.body  // type: 'custom_audio' | 'subscription'
  if (!code) return res.status(400).json({ error: 'code is required' })

  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('active', true)
    .single()

  if (error || !coupon) {
    return res.status(404).json({ valid: false, error: 'Invalid coupon code' })
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(400).json({ valid: false, error: 'This coupon has expired' })
  }

  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return res.status(400).json({ valid: false, error: 'This coupon has reached its usage limit' })
  }

  if (coupon.code === ANNUAL_FREE) {
    const gate = await annualFreeCheck(req)
    if (gate.error) return res.status(403).json({ valid: false, error: gate.error })
  }

  return res.status(200).json({
    valid: true,
    code: coupon.code,
    discount_type: coupon.discount_type,    // 'percentage' | 'fixed'
    discount_amount: coupon.discount_amount, // e.g. 20 = 20% or $20
    partner_name: coupon.partner_name,
  })
}
