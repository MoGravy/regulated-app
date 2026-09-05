#!/usr/bin/env node
/**
 * Applies design/program-map.json to the programs / program_days tables.
 *
 * Needs the service role key, because programs and program_days have RLS on
 * with no write policy — content is seeded server side, never from a client.
 *
 *   node scripts/seed-program.mjs
 *   ... --dry-run     print what would change and exit
 *
 * The project URL comes from src/config/credentials.js, same as the app. The
 * service role key is read from ~/.regulated-admin, one line, chmod 600 — the
 * same pattern as ~/quill/.wp-luma. It is never printed, and it deliberately
 * does not live in a dotenv-named file.
 *
 * Re-running is safe: rows are upserted on (program_id, week, day).
 *
 * The map ships with "approved": false. While it is false this script refuses
 * to mark the program live — flip approved to true in the JSON only after the
 * clinical sequencing has actually been reviewed, then run again.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP_PATH = join(HERE, '..', 'design', 'program-map.json')
const KEY_PATH = join(homedir(), '.regulated-admin')

const { SUPABASE_URL: URL_ } = await import('../src/config/credentials.js')
const DRY = process.argv.includes('--dry-run')

// Env wins if it is set, so CI can supply the key without a file on disk.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readKeyFile()

function readKeyFile() {
  try {
    return readFileSync(KEY_PATH, 'utf8').trim()
  } catch {
    return null
  }
}

if (!URL_ || !KEY) {
  console.error(`No service role key. Put it on one line in ${KEY_PATH} (chmod 600),`)
  console.error('or set SUPABASE_SERVICE_ROLE_KEY. The key is never printed by this script.')
  process.exit(1)
}

// Supabase has two generations of privileged key and this accepts either: the
// new opaque secret key, which is self-identifying by prefix, and the legacy
// service_role JWT, which carries role=service_role in its payload.
//
// Checked up front because the alternative is an unexplained 401 forty lines
// into the run — programs and program_days have RLS on with no write policy,
// so an underprivileged key writes nothing while looking like it tried.
function keyKind(k) {
  if (k.startsWith('sb_secret_')) return 'secret key'
  if (k.startsWith('sb_publishable_')) return 'publishable key'
  try {
    const p = k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(p, 'base64').toString()).role
  } catch {
    return 'unreadable'
  }
}

const KIND = keyKind(KEY)
if (KIND !== 'secret key' && KIND !== 'service_role') {
  console.error(`Key present, but it is a "${KIND}". That cannot write these tables.`)
  console.error('Wanted the secret key, or the legacy service_role key. No value is printed.')
  process.exit(1)
}
console.log(`Key loaded: ${KIND}. Value not printed.`)

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
const days = map.weeks.flatMap(w => w.days.map(d => ({ ...d, week: w.week })))

console.log(`program-map.json: ${map.weeks.length} weeks, ${days.length} days, approved=${map.approved}`)
if (!map.approved) {
  console.log('approved is false — seeding the content, leaving the program gated.')
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...init.headers,
    },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${body.slice(0, 300)}`)
  return body ? JSON.parse(body) : null
}

// Every day must point at a session that actually exists, or the run is a no-op.
const sessions = await rest('sessions?select=id')
const known = new Set(sessions.map(s => s.id))
const orphans = days.filter(d => d.session_id && !known.has(d.session_id))
if (orphans.length) {
  console.error(`${orphans.length} day(s) reference a session id that is not in the table:`)
  for (const o of orphans.slice(0, 10)) console.error(`  week ${o.week} day ${o.day} -> ${o.session_id}`)
  console.error('Fix design/program-map.json and run again. Nothing was written.')
  process.exit(1)
}
console.log(`all ${days.length} days resolve to a real session`)

if (DRY) {
  console.log('--dry-run: nothing written.')
  process.exit(0)
}

const [program] = await rest('programs?on_conflict=slug', {
  method: 'POST',
  body: JSON.stringify([{
    slug: map.program.slug,
    title: map.program.title,
    subtitle: map.program.subtitle,
    approved: map.approved === true,
    day_zero_session_id: map.day_zero?.session_id || null,
  }]),
})
console.log(`program ${program.slug} upserted (approved=${program.approved})`)

const rows = days.map(d => ({
  program_id: program.id,
  week: d.week,
  day: d.day,
  session_id: d.session_id,
  reading: d.reading || null,
  entry_track: d.entry_track || null,
}))

const written = await rest('program_days?on_conflict=program_id,week,day', {
  method: 'POST',
  body: JSON.stringify(rows),
})
console.log(`program_days upserted: ${written.length}`)
console.log(map.approved
  ? 'Program is APPROVED and will show in the app.'
  : 'Program stays hidden until "approved": true in design/program-map.json.')
