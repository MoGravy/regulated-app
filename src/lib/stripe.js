import { loadStripe } from '@stripe/stripe-js'

// TEMPORARY: hardcoded publishable key while env var baking issue is debugged.
// Publishable key is safe to expose — it's designed to be public.
// TODO: revert to import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY once env vars are confirmed working.
const publishableKey = 'pk_test_29N1UHLhLHe7eum9rt2WvYKj'

console.log('[Regulated] Stripe publishable key:', publishableKey.slice(0, 12) + '…')

export const stripePromise = loadStripe(publishableKey)

// Price IDs — still from env vars (set in Vercel, used only at checkout time via API)
export const PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY || ''
export const PRICE_ANNUAL  = import.meta.env.VITE_STRIPE_PRICE_ANNUAL  || ''
