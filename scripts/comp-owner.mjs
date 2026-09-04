// Adds ONE new subscriptions row giving the owner's email premium for 100
// years. Existing rows are never touched. Run by hand:
//   node scripts/comp-owner.mjs
// Reads the service role key the same way seed-program.mjs does. Prints no
// secrets: ids are shown as their first four characters only.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL } = await import('../src/config/credentials.js')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readFileSync(join(homedir(), '.regulated-admin'), 'utf8').trim()
const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

const EMAIL = 'info@matthewtweediehypnosis.com.au'
const scrub = r => Object.fromEntries(Object.entries(r).map(([k, v]) =>
  [k, /id$|customer/i.test(k) && typeof v === 'string' ? `${v.slice(0, 4)}…` : v]))

const { data: rows, error: rErr } = await db.from('subscriptions').select('*').eq('user_email', EMAIL)
if (rErr) throw rErr
console.log('existing rows for owner:')
rows.forEach(r => console.log(' ', scrub(r)))

if (rows.some(r => r.status === 'active' && new Date(r.current_period_end) > new Date())) {
  console.log('already active, nothing inserted')
  process.exit(0)
}

// Only the three columns the premium gate reads, plus a marker id. If the
// table has other NOT NULL columns the insert fails and says which, and
// nothing is written.
const { data: ins, error: iErr } = await db.from('subscriptions').insert({
  user_email: EMAIL,
  status: 'active',
  current_period_end: '2126-01-01T00:00:00Z',
  stripe_subscription_id: 'comp-owner',
}).select()
if (iErr) { console.error('insert failed:', JSON.stringify(iErr)); process.exit(1) }
console.log('inserted:', scrub(ins[0]))

const res = await fetch('https://regulatedapp.co/api/check-subscription', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }),
})
console.log('production says:', await res.json())
