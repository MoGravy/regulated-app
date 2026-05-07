import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
// APP_URL must match the actual deployed URL so Stripe redirects land correctly.
// Set APP_URL in Vercel env vars. Falls back to the current Vercel preview URL.
const APP_URL =
  process.env.APP_URL ||
  process.env.VITE_APP_URL ||
  'https://regulated-41wm9xok4-mogravys-projects.vercel.app'

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
              unit_amount: amount || 7500,
              product_data: {
                name: 'Custom Audio Session',
                description: 'Personalized nervous system regulation audio — delivered within 7 days',
                images: [`${APP_URL}/og-image.jpg`],
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
        success_url: `${APP_URL}/success?type=custom_audio&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/custom`,
      })

      return res.status(200).json({ url: session.url, sessionId: session.id })

    } else if (type === 'subscription') {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        discounts,
        ...(discounts ? {} : { allow_promotion_codes: true }),
        metadata: {
          type: 'subscription',
          plan,
          user_email: email,
          coupon_code: couponCode || '',
          discount_applied: discountAmount ? String(discountAmount) : '0',
        },
        subscription_data: {
          metadata: { user_email: email, plan },
        },
        success_url: `${APP_URL}/success?type=subscription&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/premium`,
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
