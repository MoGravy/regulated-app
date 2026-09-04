// Answers one question before the typed-email fallback in api/_identity.js is
// removed: has every active subscriber signed in at least once? A subscriber
// with no profiles row would lose premium the moment the fallback goes.
//   node scripts/who-signed-in.check.mjs
// Emails are masked in the output. Key read as in seed-program.mjs.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL } = await import('../src/config/credentials.js')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readFileSync(join(homedir(), '.regulated-admin'), 'utf8').trim()
const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })
const mask = e => e.replace(/^(..)[^@]*/, '$1***')

const { data: subs, error } = await db.from('subscriptions')
  .select('user_email,current_period_end').eq('status', 'active').gt('current_period_end', new Date().toISOString())
if (error) throw error
const { data: profiles } = await db.from('profiles').select('email')
const signedIn = new Set((profiles || []).map(p => p.email.toLowerCase()))

let missing = 0
for (const s of subs) {
  const ok = signedIn.has(s.user_email.toLowerCase())
  if (!ok) missing++
  console.log(`${mask(s.user_email)}  active until ${s.current_period_end.slice(0, 10)}  ${ok ? 'signed in' : 'NEVER signed in'}`)
}
console.log(missing ? `${missing} subscriber(s) still rely on the fallback. Keep it.` : 'all subscribers have signed in. Safe to drop the fallback.')
