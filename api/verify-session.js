import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { session_id } = req.query
  if (!session_id) {
    return res.status(400).json({ error: 'session_id required' })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id)
    return res.status(200).json({
      status: session.payment_status,
      customer_email: session.customer_email,
      type: session.metadata?.type,
    })
  } catch (err) {
    console.error('verify-session error:', err)
    return res.status(500).json({ error: err.message })
  }
}
