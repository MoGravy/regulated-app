import { loadStripe } from '@stripe/stripe-js'
import { STRIPE_PUBLISHABLE_KEY } from '../config/credentials'

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY)
