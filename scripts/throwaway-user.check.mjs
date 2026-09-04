// Live check of the sign-in path on production Supabase, run by hand:
//   node scripts/throwaway-user.check.mjs
// Creates one throwaway auth user with the service role key, signs in as it
// with the public key, proves the profile trigger, a user_progress write, RLS
// on that row, and the production premium check, then deletes the user.
// Nothing secret is printed. The key is read the same way seed-program.mjs does.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../src/config/credentials.js')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readFileSync(join(homedir(), '.regulated-admin'), 'utf8').trim()
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

const admin = createClient(SUPABASE_URL, KEY, noSession)
const email = `throwaway-${Date.now()}@example.com`
const password = `tmp-${crypto.randomUUID()}`

const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
assert.equal(cErr, null, JSON.stringify(cErr))
const uid = created.user.id
console.log('1. user created')

try {
  const me = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, noSession)
  const { data: signed, error: sErr } = await me.auth.signInWithPassword({ email, password })
  assert.equal(sErr, null, JSON.stringify(sErr))
  assert.equal(signed.user.id, uid)
  console.log('2. signed in with the public key')

  const { data: profile, error: pErr } = await me.from('profiles').select('id,email').eq('id', uid).single()
  assert.equal(pErr, null, JSON.stringify(pErr))
  assert.equal(profile.email, email)
  console.log('3. profile row exists and is readable by its owner')

  const { data: day, error: dErr } = await me.from('program_days').select('id').limit(1).single()
  assert.equal(dErr, null, JSON.stringify(dErr))
  const { error: iErr } = await me.from('user_progress').insert({ user_id: uid, program_day_id: day.id })
  assert.equal(iErr, null, JSON.stringify(iErr))
  const { data: mine } = await me.from('user_progress').select('id').eq('user_id', uid)
  assert.equal(mine.length, 1)
  console.log('4. user_progress write and read back as owner')

  const stranger = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, noSession)
  const { data: leak } = await stranger.from('user_progress').select('id').eq('user_id', uid)
  assert.equal(leak.length, 0)
  const { error: forged } = await stranger.from('user_progress').insert({ user_id: uid, program_day_id: day.id })
  assert.ok(forged, 'anon must not insert progress for another user')
  console.log('5. RLS: signed out sees nothing and cannot write')

  const res = await fetch('https://regulatedapp.co/api/check-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signed.session.access_token}` },
    body: JSON.stringify({ email: 'someone-else@example.com' }),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { active: false })
  console.log('6. production accepts the real token, no subscription, so not premium')
} finally {
  const { error: delErr } = await admin.auth.admin.deleteUser(uid)
  assert.equal(delErr, null, JSON.stringify(delErr))
  const { data: left } = await admin.from('profiles').select('id').eq('id', uid)
  const { data: leftP } = await admin.from('user_progress').select('id').eq('user_id', uid)
  assert.equal(left.length + leftP.length, 0, 'rows must cascade on delete')
  console.log('7. user deleted, profile and progress rows gone')
}
console.log('throwaway user ok')
