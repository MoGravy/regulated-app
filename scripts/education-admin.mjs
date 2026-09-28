#!/usr/bin/env node
// Service-role setup for course access and practitioner/client support.
// Preview is the default. --apply is the only path that writes.
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9-]+$/

export function parseAction(argv) {
  const [command, ...rest] = argv
  if (!['grant', 'link'].includes(command)) throw new Error('Use grant or link')
  const { values } = parseArgs({
    args: rest,
    strict: true,
    options: {
      user: { type: 'string' }, course: { type: 'string' }, source: { type: 'string' },
      ref: { type: 'string' }, client: { type: 'string' }, practitioner: { type: 'string' },
      'client-label': { type: 'string' }, 'practitioner-label': { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  })
  const allowed = command === 'grant'
    ? ['user', 'course', 'source', 'ref', 'apply']
    : ['client', 'practitioner', 'client-label', 'practitioner-label', 'apply']
  if (Object.keys(values).some(key => !allowed.includes(key))) throw new Error('Unexpected option for command')
  if (command === 'grant') {
    if (!UUID.test(values.user || '') || !SLUG.test(values.course || '') ||
        !['program', 'manual'].includes(values.source) ||
        !values.ref?.trim() || values.ref.length > 200) {
      throw new Error('Grant needs a user UUID, course slug, program/manual source, and source reference')
    }
    return { kind: 'grant', userId: values.user, courseSlug: values.course,
      source: values.source, sourceRef: values.ref.trim(), apply: values.apply }
  }
  if (!UUID.test(values.client || '') || !UUID.test(values.practitioner || '') ||
      values.client === values.practitioner ||
      !validLabel(values['client-label']) || !validLabel(values['practitioner-label'])) {
    throw new Error('Link needs two different user UUIDs and labels of 1 to 100 characters')
  }
  return { kind: 'link', clientId: values.client, practitionerId: values.practitioner,
    clientLabel: values['client-label'].trim(), practitionerLabel: values['practitioner-label'].trim(),
    apply: values.apply }
}

function validLabel(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100
}

async function existingUser(client, id) {
  const { data, error } = await client.auth.admin.getUserById(id)
  if (error || data?.user?.id !== id) throw new Error('Account not found')
}

async function one(query) {
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

async function insert(client, table, row) {
  const { error } = await client.from(table).insert(row)
  if (error) throw error
}

export async function applyAction(client, action) {
  if (!action.apply) return 'Preview only. No account or database was checked or changed.'

  if (action.kind === 'grant') {
    await existingUser(client, action.userId)
    const course = await one(client.from('courses').select('id').eq('slug', action.courseSlug))
    if (!course) throw new Error('Course not found')
    const existing = await one(client.from('course_grants').select('revoked_at')
      .eq('user_id', action.userId).eq('course_id', course.id))
    if (existing?.revoked_at) throw new Error('Grant was revoked; review before reactivating')
    if (existing) return 'Grant already active. Nothing changed.'
    await insert(client, 'course_grants', { user_id: action.userId, course_id: course.id,
      source: action.source, source_ref: action.sourceRef })
    return 'Course grant created.'
  }

  await existingUser(client, action.clientId)
  await existingUser(client, action.practitionerId)
  const existing = await one(client.from('care_links').select('active')
    .eq('client_id', action.clientId).eq('practitioner_id', action.practitionerId))
  if (existing?.active === false) throw new Error('Link was disabled; review before reactivating')
  if (existing) return 'Care link already active. Nothing changed.'
  await insert(client, 'care_links', { client_id: action.clientId,
    practitioner_id: action.practitionerId, client_label: action.clientLabel,
    practitioner_label: action.practitionerLabel })
  return 'Care link created.'
}

async function main() {
  const action = parseAction(process.argv.slice(2))
  if (!action.apply) {
    console.log(`${action.kind} preview: ${await applyAction(null, action)}`)
    return
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, key, { auth: { persistSession: false } })
  console.log(await applyAction(client, action))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
