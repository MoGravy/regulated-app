import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ---------------------------------------------------------------------------
// Runtime env dump — shows what was baked into the bundle at build time.
// All import.meta.env.VITE_* values are replaced with literals during vite build.
// If they show as "(NOT BAKED IN)", the Vercel build didn't have those env vars
// set — check Vercel dashboard → Settings → Environment Variables.
// ---------------------------------------------------------------------------
console.log('=== [Regulated] Runtime env diagnostics ===')
console.log('MODE:', import.meta.env.MODE)
console.log('PROD:', import.meta.env.PROD)
console.log('VITE_SUPABASE_URL:           ',
  import.meta.env.VITE_SUPABASE_URL || '(NOT BAKED IN — missing from Vercel env vars at build time)')
console.log('VITE_SUPABASE_ANON_KEY:      ',
  import.meta.env.VITE_SUPABASE_ANON_KEY
    ? `set (${import.meta.env.VITE_SUPABASE_ANON_KEY.length} chars, prefix: ${import.meta.env.VITE_SUPABASE_ANON_KEY.slice(0, 20)}…)`
    : '(NOT BAKED IN — missing from Vercel env vars at build time)')
console.log('VITE_STRIPE_PUBLISHABLE_KEY: ',
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
    ? `set (prefix: ${import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.slice(0, 12)}…)`
    : '(NOT BAKED IN — missing from Vercel env vars at build time)')
console.log('VITE_STRIPE_PRICE_MONTHLY:   ',
  import.meta.env.VITE_STRIPE_PRICE_MONTHLY || '(NOT BAKED IN)')
console.log('VITE_STRIPE_PRICE_ANNUAL:    ',
  import.meta.env.VITE_STRIPE_PRICE_ANNUAL || '(NOT BAKED IN)')
console.log('VITE_APP_URL:                ',
  import.meta.env.VITE_APP_URL || '(NOT BAKED IN)')
console.log('=== [Regulated] End runtime env diagnostics ===')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
