import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sets env vars without the VITE_ prefix.
// These `define` entries inject them at build time so the frontend
// can read them via import.meta.env.VITE_* as normal.
// Only explicitly listed vars are exposed — no secrets leak.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    // Supabase — try Vercel name first, fall back to VITE_ prefix (local dev)
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    ),
    // Stripe publishable key (safe to expose to client)
    'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify(
      process.env.STRIPE_PUBLIC_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
    ),
    // Stripe price IDs
    'import.meta.env.VITE_STRIPE_PRICE_MONTHLY': JSON.stringify(
      process.env.STRIPE_PRICE_MONTHLY || process.env.VITE_STRIPE_PRICE_MONTHLY || ''
    ),
    'import.meta.env.VITE_STRIPE_PRICE_ANNUAL': JSON.stringify(
      process.env.STRIPE_PRICE_ANNUAL || process.env.VITE_STRIPE_PRICE_ANNUAL || ''
    ),
    // App URL
    'import.meta.env.VITE_APP_URL': JSON.stringify(
      process.env.APP_URL || process.env.VITE_APP_URL || 'https://regulatedapp.co'
    ),
  },
})
