// Hardcoded public credentials — safe to expose in browser.
// Anon key is the public Supabase key (role: "anon"), not the service role key.
// Publishable key is the public Stripe key, not the secret key.

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_29N1UHLhLHe7eum9rt2WvYKj'
export const SUPABASE_URL           = 'https://aynyvirtzioyeshauith.supabase.co'
export const SUPABASE_ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5bnl2aXJ0emlveWVzaGF1aXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjEzODcsImV4cCI6MjA5MzMzNzM4N30.q1hfzEtVylk2_1a3hdc1gRZ9jZNLB4YKdK77A9mqHBM'

console.log('[credentials] STRIPE_PUBLISHABLE_KEY:', STRIPE_PUBLISHABLE_KEY.slice(0, 14) + '…')
console.log('[credentials] SUPABASE_URL:          ', SUPABASE_URL)
console.log('[credentials] SUPABASE_ANON_KEY:     ', SUPABASE_ANON_KEY.slice(0, 30) + '…')
