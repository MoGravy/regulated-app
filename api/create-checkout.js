import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://regulatedapp.co'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type, email, orderId, amount, plan, priceId, couponCode, discountType, discountAmount } = req.body

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
          order_id: orderId,
          user_email: email,
          coupon_code: couponCode || '',
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
