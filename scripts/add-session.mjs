#!/usr/bin/env node
/**
 * Adds one library session: uploads the MP3 to the `sessions` bucket and
 * inserts the row with the audio_url shape api/get-audio-url.js expects.
 *
 *   node scripts/add-session.mjs ./file.mp3 --title "Anxiety Release" \
 *     --category Anxiety --duration 20 --description "..." [--free false] \
 *     [--tags "Sleep, Stress"] [--dry-run]
 *
 * Credentials: same pattern as seed-program.mjs. Project URL from
 * src/config/credentials.js, service role key from SUPABASE_SERVICE_ROLE_KEY
 * or ~/.regulated-admin. The key is never printed.
 *
 * Additive only: one storage object, one new row. Never touches existing rows.
 */
import { readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL } = await import('../src/config/credentials.js')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readKey()
const BUCKET = 'sessions'

function readKey() {
  try { return readFileSync(join(homedir(), '.regulated-admin'), 'utf8').trim() } catch { return null }
}

// ponytail: flat flag parser, every flag takes one value except --dry-run.
const argv = process.argv.slice(2)
const file = argv.find(a => !a.startsWith('--'))
const opt = k => { const i = argv.indexOf(`--${k}`); return i === -1 ? undefined : argv[i + 1] }
const DRY = argv.includes('--dry-run')

const title = opt('title')
const category = opt('category')
const duration = Number(opt('duration'))
const description = opt('description') || ''
const free = opt('free') === 'true'
const tags = (opt('tags') || '').split(',').map(s => s.trim()).filter(Boolean)

if (!file || !title || !category || !Number.isInteger(duration) || duration <= 0) {
  console.error('Usage: node scripts/add-session.mjs ./file.mp3 --title "..." --category Stress --duration 18 [--description "..."] [--free false] [--tags "A, B"] [--dry-run]')
  process.exit(1)
}
if (!SUPABASE_URL || !KEY) {
  console.error('No service role key. Put it on one line in ~/.regulated-admin (chmod 600) or set SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const size = statSync(file).size
const object = basename(file).replace(/[^\w.-]+/g, '-')
const audio_url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${object}`
const row = { title, description, category, duration, free, audio_url, tags: tags.length ? tags : null }

console.log(`Upload ${file} (${(size / 1048576).toFixed(1)} MB) -> ${BUCKET}/${object}`)
console.log('Insert row:', JSON.stringify(row, null, 2))
if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0) }

const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

const up = await db.storage.from(BUCKET).upload(object, readFileSync(file), { contentType: 'audio/mpeg', upsert: false })
if (up.error) { console.error('Upload failed:', JSON.stringify(up.error)); process.exit(1) }

const ins = await db.from('sessions').insert(row).select('id').single()
if (ins.error) { console.error('Insert failed (file is uploaded, row is not):', JSON.stringify(ins.error)); process.exit(1) }

console.log(`Done. Session id ${ins.data.id}. Hard refresh the app to see it.`)
