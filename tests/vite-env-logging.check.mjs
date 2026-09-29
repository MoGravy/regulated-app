import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const output = execFileSync(process.execPath, [
  '--input-type=module', '-e', `
    await import('./vite.config.js')
    if (process.env.VITE_SUPABASE_URL !== 'https://example.invalid') process.exit(1)
    if (process.env.VITE_STRIPE_PUBLISHABLE_KEY !== 'fake-public-key') process.exit(1)
  `,
], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  env: {
    VITE_SUPABASE_URL: '',
    VITE_STRIPE_PUBLISHABLE_KEY: '',
    SUPABASE_URL: 'https://example.invalid',
    STRIPE_PUBLIC_KEY: 'fake-public-key',
    SUPABASE_ANON_KEY: 'fake-anon-key',
  },
})

assert.equal(output, '', 'Build configuration must not print environment values')
console.log('PASS environment mapping without build-log values')
