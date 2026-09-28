import assert from 'node:assert/strict'
import { applyAction, parseAction } from '../scripts/education-admin.mjs'

const clientId = '30000000-0000-4000-8000-000000000001'
const practitionerId = '30000000-0000-4000-8000-000000000002'
const courseId = '10000000-0000-4000-8000-000000000001'

function fake({ missingUser = false, revoked = false, existing = false } = {}) {
  const writes = []
  const client = {
    auth: { admin: { getUserById: async id => ({ data: { user: missingUser ? null : { id } } }) } },
    from(table) {
      const query = {
        select() { return query }, eq() { return query },
        async maybeSingle() {
          return { data: table === 'courses' ? { id: courseId }
            : existing ? table === 'course_grants' ? { revoked_at: revoked ? '2026-01-01' : null }
              : { active: !revoked } : null, error: null }
        },
        async insert(row) { writes.push({ table, row }); return { error: null } },
      }
      return query
    },
  }
  return { client, writes }
}

const grant = parseAction(['grant', '--user', clientId, '--course', 'dissolve-anxiety',
  '--source', 'program', '--ref', 'verified-program-record'])
assert.match(await applyAction(null, grant), /Preview only/)
const validGrant = { ...grant, apply: true }
const allowed = fake()
assert.equal(await applyAction(allowed.client, validGrant), 'Course grant created.')
assert.deepEqual(allowed.writes[0], { table: 'course_grants', row: {
  user_id: clientId, course_id: courseId, source: 'program', source_ref: 'verified-program-record',
} })
const missing = fake({ missingUser: true })
await assert.rejects(applyAction(missing.client, validGrant), /Account not found/)
assert.equal(missing.writes.length, 0)
const revokedGrant = fake({ existing: true, revoked: true })
await assert.rejects(applyAction(revokedGrant.client, validGrant), /review before reactivating/)
assert.equal(revokedGrant.writes.length, 0)

const link = parseAction(['link', '--client', clientId, '--practitioner', practitionerId,
  '--client-label', 'Test client', '--practitioner-label', 'Test practitioner', '--apply'])
const allowedLink = fake()
assert.equal(await applyAction(allowedLink.client, link), 'Care link created.')
assert.equal(allowedLink.writes[0].table, 'care_links')
const disabledLink = fake({ existing: true, revoked: true })
await assert.rejects(applyAction(disabledLink.client, link), /review before reactivating/)
assert.equal(disabledLink.writes.length, 0)
console.log('education admin checks passed')
