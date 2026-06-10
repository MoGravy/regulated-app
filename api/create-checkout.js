import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
// APP_URL for Stripe success/cancel redirects.
// Priority: explicit env var → request Origin header → Vercel preview fallback.
// Using the request Origin means redirects always land on the same domain the
// user is browsing from, even across preview/production deployments.
function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (req.headers.origin) return req.headers.origin.replace(/\/$/, '')
  return 'https://regulated-41wm9xok4-mogravys-projects.vercel.app'
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    type, email, amount, plan, priceId,
    couponCode, discountType, discountAmount,
    // Custom audio order fields (stored in metadata; webhook creates DB row after payment)
    pattern, trigger, desiredState, affirmations,
  } = req.body

  // Stripe metadata values are capped at 500 chars — truncate long free-text fields
  const trunc = (str, max = 490) =>
    str && str.length > max ? str.slice(0, max) + '…' : (str || '')

  const appUrl = getAppUrl(req)

  try {
    // Build Stripe discount object from coupon if provided
    let discounts = undefined
    if (couponCode && discountType && discountAmount) {
      const stripeCoupon = await stripe.coupons.create({
        name: couponCode,
        ...(discountType === 'percentage'
          ? { percent_off: discountAmount }
          : { amount_off: Math.round(discountAmount * 100), currency: 'usd' }
        ),
        duration: 'once',
        max_redemptions: 1,
        metadata: { source_coupon: couponCode },
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
              unit_amount: amount || 9900,
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
          coupon_code:   couponCode || '',
          discount_applied: discountAmount ? String(discountAmount) : '0',
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
        success_url: `${appUrl}/success?type=subscription&session_id={CHECKOUT_SESSION_ID}`,
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
