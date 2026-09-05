import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { annualFreeCheck, ANNUAL_FREE } from './_annualfree.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Custom audio price is server-authoritative. The client never sends an amount.
import { CUSTOM_AUDIO_PRICE_CENTS } from '../src/config/pricing.js'

// Look up a coupon code in the coupons table — same rules as /api/validate-coupon.
// Returns the coupon row, or null if the code is missing/inactive/expired/exhausted.
async function lookupCoupon(code) {
  if (!code) return null
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', String(code).toUpperCase().trim())
    .eq('active', true)
    .single()
  if (error || !coupon) return null
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return null
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return null
  return coupon
}
// APP_URL for Stripe success/cancel redirects.
// Priority: explicit env var → request Origin header → Vercel preview fallback.
// Using the request Origin means redirects always land on the same domain the
// user is browsing from, even across preview/production deployments.
function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (req.headers.origin) return req.headers.origin.replace(/\/$/, '')
  // Effectively dead: browser POSTs always send Origin. Kept as a safe last
  // resort for non-browser callers, pointed at production not a stale preview.
  return 'https://regulatedapp.co'
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let {
    type, email, plan,
    couponCode,
    // Custom audio order fields (stored in metadata; webhook creates DB row after payment)
    pattern, trigger, desiredState, affirmations,
  } = req.body
  // NOTE: price and discount values are never read from the client. Price is a
  // server constant; discounts come from the coupons table via lookupCoupon().

  // Stripe metadata values are capped at 500 chars — truncate long free-text fields
  const trunc = (str, max = 490) =>
    str && str.length > max ? str.slice(0, max) + '…' : (str || '')

  const appUrl = getAppUrl(req)

  try {
    // Build Stripe discount object from the coupons table — client-sent discount
    // values are ignored. An invalid/expired code is a hard error rather than a
    // silent full-price charge: the client validated it moments ago, so a miss
    // here means tampering or a race on expiry/usage limits.
    let discounts = undefined
    let appliedCoupon = null
    if (couponCode) {
      appliedCoupon = await lookupCoupon(couponCode)
      if (!appliedCoupon) {
        return res.status(400).json({ error: 'Invalid or expired coupon code' })
      }
      if (appliedCoupon.code === ANNUAL_FREE) {
        const gate = await annualFreeCheck(req)
        if (gate.error) return res.status(403).json({ error: gate.error })
        // The free session belongs to the account that earned it.
        email = gate.email
      }
      const stripeCoupon = await stripe.coupons.create({
        name: appliedCoupon.code,
        ...(appliedCoupon.discount_type === 'percentage'
          ? { percent_off: appliedCoupon.discount_amount }
          : { amount_off: Math.round(appliedCoupon.discount_amount * 100), currency: 'usd' }
        ),
        duration: 'once',
        max_redemptions: 1,
        metadata: { source_coupon: appliedCoupon.code },
      })
      discounts = [{ coupon: stripeCoupon.id }]
    }

    if (type === 'custom_audio') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: CUSTOM_AUDIO_PRICE_CENTS,
              product_data: {
                name: 'Custom Audio Session',
                description: 'Personalized nervous system regulation audio — delivered within 7 days',
                images: [`${appUrl}/og-image.jpg`],
              },
            },
            quantity: 1,
          },
        ],
        discounts,
        // only allow_promotion_codes when no programmatic coupon applied
        ...(discounts ? {} : { allow_promotion_codes: true }),
        metadata: {
          type: 'custom_audio',
          user_email: email,
          // Full order details — webhook reads these to create the DB row
          pattern:       trunc(pattern),
          trigger:       trunc(trigger),
          desired_state: trunc(desiredState),
          affirmations:  trunc(affirmations),
          coupon_code:   appliedCoupon ? appliedCoupon.code : '',
          discount_applied: appliedCoupon ? String(appliedCoupon.discount_amount) : '0',
        },
        success_url: `${appUrl}/success?type=custom_audio&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/custom`,
      })

      return res.status(200).json({ url: session.url, sessionId: session.id })

    } else if (type === 'subscription') {
      // Price IDs live in Vercel env vars — never trust the client to send them.
      // To update pricing: change STRIPE_PRICE_ANNUAL / STRIPE_PRICE_MONTHLY in Vercel.
      const resolvedPriceId = plan === 'annual'
        ? process.env.STRIPE_PRICE_ANNUAL
        : process.env.STRIPE_PRICE_MONTHLY

      if (!resolvedPriceId) {
        console.error(`[checkout] STRIPE_PRICE_${(plan || 'UNKNOWN').toUpperCase()} env var not set`)
        return res.status(500).json({ error: 'Subscription price not configured. Contact support.' })
      }

      // allow_promotion_codes lets customers enter codes (e.g. ANNUALFREE) on
      // Stripe's hosted page — no programmatic coupon handling needed here.
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        allow_promotion_codes: true,
        metadata: {
          type: 'subscription',
          plan,
          user_email: email,
        },
        subscription_data: {
          metadata: { user_email: email, plan },
        },
        success_url: `${appUrl}/success?type=subscription&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/premium`,
      })

      return res.status(200).json({ url: session.url, sessionId: session.id })

    } else {
      return res.status(400).json({ error: 'Invalid checkout type' })
    }

  } catch (err) {
    console.error('Stripe checkout error:', err)
    return res.status(500).json({ error: err.message })
  }
}
