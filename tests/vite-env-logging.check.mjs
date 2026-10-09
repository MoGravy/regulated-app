import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const { validateNativeBuild } = await import('../vite.config.js')
const publicSettings = { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_ANON_KEY: 'public-fixture' }
assert.doesNotThrow(() => validateNativeBuild(publicSettings))
assert.doesNotThrow(() => validateNativeBuild({ ...publicSettings, VITE_SUPABASE_ANON_KEY: 'sb_publishable_fixture' }))
assert.doesNotThrow(() => validateNativeBuild({ ...publicSettings, VITE_SUPABASE_ANON_KEY: 'header.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.signature' }))
for (const settings of [
  {}, { ...publicSettings, VITE_SUPABASE_URL: 'http://example.invalid' },
  { ...publicSettings, VITE_SUPABASE_URL: 'https://user:private@example.invalid' },
  { ...publicSettings, VITE_SUPABASE_URL: 'https://example.invalid/path' },
  { ...publicSettings, VITE_SUPABASE_ANON_KEY: '' },
  { ...publicSettings, VITE_SUPABASE_ANON_KEY: 'sb_secret_fixture' },
  { ...publicSettings, VITE_SUPABASE_ANON_KEY: ' \tsb_secret_fixture\n' },
  { ...publicSettings, VITE_SUPABASE_ANON_KEY: ' sb_publishable_fixture' },
  { ...publicSettings, VITE_SUPABASE_ANON_KEY: 'sb_publishable_fixture\n' },
  { ...publicSettings, VITE_SUPABASE_ANON_KEY: 'header.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature' },
]) {
  assert.throws(() => validateNativeBuild(settings), /Native build requires/)
}

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

const missing = spawnSync(process.execPath, [
  'node_modules/vite/bin/vite.js', 'build', '--mode', 'native',
], { cwd: root, encoding: 'utf8', env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } })
assert.notEqual(missing.status, 0, 'Native packaging must stop without sign-in settings')
assert.match(missing.stderr, /Native build requires/)

const paddedPrivateKey = ' \tsb_secret_fixture\n'
const privateBuild = spawnSync(process.execPath, [
  'node_modules/vite/bin/vite.js', 'build', '--mode', 'native',
], { cwd: root, encoding: 'utf8', env: { ...publicSettings, VITE_SUPABASE_ANON_KEY: paddedPrivateKey } })
assert.notEqual(privateBuild.status, 0, 'Native packaging must reject padded private keys')
assert.match(privateBuild.stderr, /Native build requires a public/)
assert(!`${privateBuild.stdout}${privateBuild.stderr}`.includes('sb_secret_fixture'), 'Refusal must not expose the rejected value')

const out = mkdtempSync(join(tmpdir(), 'regulated-client-env-'))
try {
  const buildOutput = execFileSync(process.execPath, [
    'node_modules/vite/bin/vite.js', 'build', '--mode', 'native', '--outDir', out, '--emptyOutDir',
  ], { cwd: root, encoding: 'utf8', env: { ...fakeEnv, VITE_LOOK: 'night' } })
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
