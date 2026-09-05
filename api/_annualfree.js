import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { callerEmail } from './_identity.js'

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
// Returns { email } when allowed, { error } with a sentence for the user when not.
export async function annualFreeCheck(req) {
  const email = await callerEmail(req, supabase)
  if (!email) return { error: 'Sign in to use ANNUALFREE' }

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .ilike('user_email', email)
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
  if (error) throw error

  // ponytail: the subscriptions table never stored the plan, so the interval
  // comes from Stripe. One read per active subscription, and there is one.
  let annual = false
  for (const s of subs || []) {
    if (!s.stripe_subscription_id) continue
    const sub = await stripe.subscriptions.retrieve(s.stripe_subscription_id)
    if (sub.items?.data?.some(i => i.price?.recurring?.interval === 'year')) { annual = true; break }
  }
  if (!annual) return { error: 'ANNUALFREE is for annual members' }

  const { count, error: countError } = await supabase
    .from('custom_orders')
    .select('id', { count: 'exact', head: true })
    .ilike('user_email', email)
    .eq('coupon_code_used', ANNUAL_FREE)
  if (countError) throw countError
  if (count > 0) return { error: 'ANNUALFREE has already been used on this account' }

  return { email }
}
