import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel supplies these without the VITE_ prefix. Copy only browser-safe
// values, and never print key material in build output.
const browserEnv = {
  SUPABASE_URL: 'VITE_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'VITE_SUPABASE_ANON_KEY',
  STRIPE_PUBLIC_KEY: 'VITE_STRIPE_PUBLISHABLE_KEY',
  STRIPE_PRICE_MONTHLY: 'VITE_STRIPE_PRICE_MONTHLY',
  STRIPE_PRICE_ANNUAL: 'VITE_STRIPE_PRICE_ANNUAL',
  APP_URL: 'VITE_APP_URL',
}
for (const [source, target] of Object.entries(browserEnv)) {
  if (!process.env[target] && process.env[source]) process.env[target] = process.env[source]
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 3000,
  },
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.info', 'console.debug', 'console.warn'] }
    : {},
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
