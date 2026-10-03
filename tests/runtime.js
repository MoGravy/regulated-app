export const BASE_URL = process.env.BASE_URL || 'http://localhost:4173'
export const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE_URL).hostname)
export const SUPABASE_URL = IS_LOCAL ? 'https://local-preview.supabase.invalid' : process.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = IS_LOCAL ? 'preview-public-only' : process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Remote tests require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the test environment')
}

export const LOCAL_BUILD_ENV = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_local',
}
