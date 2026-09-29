import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const fakeEnv = {
  SUPABASE_URL: 'https://example.invalid',
  SUPABASE_ANON_KEY: 'fake-anon-key',
  STRIPE_PUBLIC_KEY: 'pk_test_fake',
}

const output = execFileSync(process.execPath, [
  '--input-type=module', '-e', `
    await import('./vite.config.js')
    if (process.env.VITE_SUPABASE_URL !== 'https://example.invalid') process.exit(1)
    if (process.env.VITE_STRIPE_PUBLISHABLE_KEY !== 'pk_test_fake') process.exit(1)
  `,
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    VITE_SUPABASE_URL: '',
    VITE_STRIPE_PUBLISHABLE_KEY: '',
    ...fakeEnv,
  },
})

assert.equal(output, '', 'Build configuration must not print environment values')

const out = mkdtempSync(join(tmpdir(), 'regulated-client-env-'))
try {
  const buildOutput = execFileSync(process.execPath, [
    'node_modules/vite/bin/vite.js', 'build', '--outDir', out, '--emptyOutDir',
  ], { cwd: root, encoding: 'utf8', env: fakeEnv })
  for (const value of Object.values(fakeEnv)) {
    assert(!buildOutput.includes(value), 'Build output must not print environment values')
  }
  const js = readdirSync(join(out, 'assets'))
    .filter(name => name.endsWith('.js'))
    .map(name => readFileSync(join(out, 'assets', name), 'utf8'))
    .join('\n')
  for (const value of Object.values(fakeEnv)) {
    assert(js.includes(value), 'Browser bundle must use injected environment values')
  }
  assert(!js.includes('pk_live_'), 'Browser bundle must not carry a fixed live Stripe key')
} finally {
  rmSync(out, { recursive: true, force: true })
}

console.log('PASS injected browser credentials without exposed build values')
