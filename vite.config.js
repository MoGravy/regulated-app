import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sets env vars WITHOUT the VITE_ prefix (SUPABASE_URL, STRIPE_PUBLIC_KEY, etc.)
// but Vite's env plugin only exposes VITE_-prefixed vars to the browser via import.meta.env.
//
// Fix: Before Vite's env plugin runs, copy the Vercel-style names into VITE_-prefixed
// process.env entries. Vite then picks them up natively. No `define` hacks needed.
//
// This runs at build time in Node.js context — secrets stay server-side.

if (!process.env.VITE_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL
}
if (!process.env.VITE_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
}
if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_PUBLIC_KEY) {
  process.env.VITE_STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY
}
if (!process.env.VITE_STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_MONTHLY) {
  process.env.VITE_STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY
}
if (!process.env.VITE_STRIPE_PRICE_ANNUAL && process.env.STRIPE_PRICE_ANNUAL) {
  process.env.VITE_STRIPE_PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL
}
if (!process.env.VITE_APP_URL && process.env.APP_URL) {
  process.env.VITE_APP_URL = process.env.APP_URL
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
