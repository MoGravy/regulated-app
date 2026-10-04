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

export function validateNativeBuild(env) {
  let url
  try { url = new URL(env.VITE_SUPABASE_URL) } catch { /* Checked below. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Native build requires a valid HTTPS VITE_SUPABASE_URL')
  }
  const key = env.VITE_SUPABASE_ANON_KEY
  if (typeof key !== 'string' || !key.trim() || key !== key.trim() || key.startsWith('sb_secret_')) {
    throw new Error('Native build requires a public VITE_SUPABASE_ANON_KEY')
  }
  if (key.split('.').length === 3) {
    let role
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch { /* Refuse malformed keys. */ }
    if (role !== 'anon') throw new Error('Native build requires an anon public key')
  }
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), ...(command === 'build' && mode === 'native' ? [{
    name: 'native-sign-in-preflight',
    configResolved(config) { validateNativeBuild(config.env) },
  }] : [])],
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
