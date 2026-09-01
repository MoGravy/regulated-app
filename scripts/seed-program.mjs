#!/usr/bin/env node
/**
 * Applies design/program-map.json to the programs / program_days tables.
 *
 * Needs the service role key, because programs and program_days have RLS on
 * with no write policy — content is seeded server side, never from a client.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-program.mjs
 *   ... --dry-run     print what would change and exit
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

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP_PATH = join(HERE, '..', 'design', 'program-map.json')

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY = process.argv.includes('--dry-run')

if (!URL_ || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.')
  console.error('Neither is printed by this script; it only reports whether they are present.')
  process.exit(1)
}

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
  }]),
})
console.log(`program ${program.slug} upserted (approved=${program.approved})`)

const rows = days.map(d => ({
  program_id: program.id,
  week: d.week,
  day: d.day,
  session_id: d.session_id,
  reading: d.reading || null,
}))

const written = await rest('program_days?on_conflict=program_id,week,day', {
  method: 'POST',
  body: JSON.stringify(rows),
})
console.log(`program_days upserted: ${written.length}`)
console.log(map.approved
  ? 'Program is APPROVED and will show in the app.'
  : 'Program stays hidden until "approved": true in design/program-map.json.')
