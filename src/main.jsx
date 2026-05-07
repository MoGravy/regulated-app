import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { STRIPE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from './config/credentials'
import App from './App.jsx'
import './index.css'

console.log('=== [Regulated] Startup credential check ===')
console.log('STRIPE_PUBLISHABLE_KEY:', STRIPE_PUBLISHABLE_KEY ? STRIPE_PUBLISHABLE_KEY.slice(0, 14) + '…' : '❌ MISSING')
console.log('SUPABASE_URL:         ', SUPABASE_URL           || '❌ MISSING')
console.log('SUPABASE_ANON_KEY:    ', SUPABASE_ANON_KEY      ? SUPABASE_ANON_KEY.slice(0, 20) + '…' : '❌ MISSING')
console.log('=== [Regulated] End startup check ===')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
