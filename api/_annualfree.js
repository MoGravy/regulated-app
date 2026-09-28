import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { callerUser, activeSubscriptions, normalEmail, sameEmail } from './_identity.js'

export const ANNUAL_FREE = 'ANNUALFREE'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Code handoff item 4. ANNUALFREE is the annual member's one custom session,
// so it is decided here with the service role and never from what the browser
// says: a verified sign-in, an active subscription whose Stripe price bills
// yearly, and no custom order already carrying the code.
// Returns the verified account and email when allowed, or an error.
export async function annualFreeCheck(req) {
  const user = await callerUser(req, supabase)
  const email = normalEmail(user?.email)
  if (!email) return { error: 'Sign in to use ANNUALFREE' }

  const subs = await activeSubscriptions(supabase, email, 'stripe_subscription_id')

  // ponytail: the subscriptions table never stored the plan, so the interval
  // comes from Stripe. One read per active subscription, and there is one.
  let annual = false
  for (const s of subs || []) {
    if (!s.stripe_subscription_id) continue
    const sub = await stripe.subscriptions.retrieve(s.stripe_subscription_id)
    if (sub.items?.data?.some(i => i.price?.recurring?.interval === 'year')) { annual = true; break }
  }
  if (!annual) return { error: 'ANNUALFREE is for annual members' }

  const { data: used, error: usedError } = await supabase
    .from('custom_orders')
    .select('id, user_email')
    .eq('user_email_normalized', email)
    .eq('coupon_code_used', ANNUAL_FREE)
    .not('stripe_session_id', 'is', null)
  if (usedError) throw usedError
  if (sameEmail(used, email).length) return { error: 'ANNUALFREE has already been used on this account' }

  return { email, accountId: user.id }
}

export async function annualFreeCheckout(gate) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reservationId = randomUUID()
    const { error } = await supabase.from('annual_free_reservations').insert({
      account_id: gate.accountId,
      user_email: gate.email,
      reservation_id: reservationId,
    })
    if (!error) return { reservationId }
    if (error.code !== '23505') throw error

    const { data: prior, error: readError } = await supabase.from('annual_free_reservations')
      .select('reservation_id,stripe_session_id,user_email').eq('account_id', gate.accountId).maybeSingle()
    if (readError || !prior) throw readError || error
    if (!prior.stripe_session_id) {
      return { error: 'Your previous checkout needs checking. Please contact support; your free session is reserved.' }
    }
    const session = await stripe.checkout.sessions.retrieve(prior.stripe_session_id)
    if (session.metadata?.annual_free_reservation_id !== prior.reservation_id ||
        session.metadata?.user_email !== prior.user_email || session.mode !== 'payment') {
      throw new Error('Prior checkout does not match its reservation')
    }
    if (session.status === 'open' && session.url) return { session }
    if (session.status === 'complete') return { error: 'ANNUALFREE has already been used on this account' }
    if (session.status !== 'expired' || session.payment_status !== 'unpaid') {
      throw new Error('Unable to verify prior checkout status')
    }

    const { error: deleteError } = await supabase.from('annual_free_reservations').delete()
      .eq('account_id', gate.accountId).eq('reservation_id', prior.reservation_id)
      .eq('stripe_session_id', prior.stripe_session_id)
    if (deleteError) throw deleteError
  }
  return { error: 'Your previous checkout is being checked. Please try again.' }
}

export async function saveAnnualFreeSession(accountId, reservationId, sessionId) {
  const { data, error } = await supabase.from('annual_free_reservations')
    .update({ stripe_session_id: sessionId })
    .eq('account_id', accountId).eq('reservation_id', reservationId)
    .is('stripe_session_id', null).select('reservation_id').maybeSingle()
  if (error || !data) throw error || new Error('ANNUALFREE reservation was not saved')
}
