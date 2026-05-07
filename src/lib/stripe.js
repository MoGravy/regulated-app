import { loadStripe } from '@stripe/stripe-js'
import { STRIPE_PUBLISHABLE_KEY } from '../config/credentials'

console.log('[stripe.js] Initializing with key:', STRIPE_PUBLISHABLE_KEY.slice(0, 14) + '…')

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY)

export const PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY || ''
export const PRICE_ANNUAL  = import.meta.env.VITE_STRIPE_PRICE_ANNUAL  || ''
