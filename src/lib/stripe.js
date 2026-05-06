import { loadStripe } from '@stripe/stripe-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

// Debug: log resolved value on startup so we can verify env var injection.
// The key is safe to log (it's the publishable key, not the secret key).
console.log('[Regulated] STRIPE_PUBLIC_KEY:', publishableKey || '(not set)')

if (!publishableKey) {
  console.error(
    '[Regulated] STRIPE_PUBLIC_KEY is not set. ' +
    'Add STRIPE_PUBLIC_KEY (or VITE_STRIPE_PUBLISHABLE_KEY) to your Vercel environment variables.'
  )
}

export const stripePromise = loadStripe(publishableKey || '')

export const PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY || ''
export const PRICE_ANNUAL  = import.meta.env.VITE_STRIPE_PRICE_ANNUAL  || ''
