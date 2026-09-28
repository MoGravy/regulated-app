import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only'
const { handleCourseMediaRequest } = await import('../api/get-course-media-url.js')

const courseId = '10000000-0000-4000-8000-000000000001'
const lessonId = '20000000-0000-4000-8000-000000000001'
const mediaId = '40000000-0000-4000-8000-000000000001'
const userA = '30000000-0000-4000-8000-000000000001'
const userB = '30000000-0000-4000-8000-000000000002'
const path = `${courseId}/${lessonId}/${mediaId}/sample.mp3`

function fakeClient({ userId = userA, granted = true, published = true, storagePath = path, kind = 'audio', grants, grantError = null } = {}) {
  const calls = { signed: 0, options: undefined }
  const rows = {
    course_media: { id: mediaId, lesson_id: lessonId, kind, storage_path: storagePath, published },
    course_lessons: { id: lessonId, course_id: courseId, published },
    courses: { id: courseId, published },
    course_grants: grants ?? (granted ? [{ course_id: courseId, user_id: userA, revoked_at: null }] : []),
  }
  const client = {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: userId } : null } }) },
    from(table) {
      const filters = {}
      const query = {
        select() { return query },
        eq(key, value) { filters[key] = value; return query },
        is(key, value) { filters[key] = value; return query },
        async limit(count) {
          assert.equal(table, 'course_grants')
          assert.equal(count, 1)
          return { data: rows[table].filter(row => Object.entries(filters)
            .every(([key, value]) => row[key] === value)).slice(0, count), error: grantError }
        },
        async maybeSingle() {
          const row = rows[table]
          return { data: row && Object.entries(filters).every(([key, value]) => row[key] === value) ? row : null, error: null }
        },
      }
      return query
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'course-media')
      return { createSignedUrl: async (objectPath, ttl, options) => {
        calls.signed += 1
        assert.equal(objectPath, path)
        assert.equal(ttl, 3600)
        calls.options = options
        return { data: { signedUrl: 'https://example.test/signed-media' }, error: null }
      } }
    } },
  }
  return { client, calls }
}

async function request(client, token = 'valid', id = mediaId, download) {
  const req = { method: 'POST', body: { mediaId: id, download }, headers: token ? { authorization: `Bearer ${token}` } : {} }
  const res = {
    code: 0, body: null, headers: {},
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
    setHeader(key, value) { this.headers[key] = value },
  }
  await handleCourseMediaRequest(req, res, client)
  return res
}

const allowed = fakeClient()
assert.equal((await request(allowed.client)).code, 200)
assert.equal(allowed.calls.signed, 1)
assert.equal(allowed.calls.options, undefined)

const reasons = ['purchase', 'program'].map(source => ({
  source, course_id: courseId, user_id: userA, revoked_at: null,
}))
for (const grants of [reasons, reasons.map((row, i) => ({ ...row, revoked_at: i === 0 ? '2026-01-01' : null })),
  reasons.map((row, i) => ({ ...row, revoked_at: i === 1 ? '2026-01-01' : null }))]) {
  assert.equal((await request(fakeClient({ grants }).client)).code, 200)
}
for (const grants of [reasons.map(row => ({ ...row, revoked_at: '2026-01-01' })),
  reasons.map(row => ({ ...row, user_id: userB })),
  reasons.map(row => ({ ...row, course_id: lessonId }))]) {
  const blocked = fakeClient({ grants })
  assert.equal((await request(blocked.client)).code, 404)
  assert.equal(blocked.calls.signed, 0)
}
const databaseFailure = fakeClient({ grantError: { message: 'test database failure' } })
assert.equal((await request(databaseFailure.client)).code, 500)
assert.equal(databaseFailure.calls.signed, 0)

const file = fakeClient({ kind: 'file' })
assert.equal((await request(file.client)).code, 200)
assert.equal(file.calls.signed, 1)
assert.deepEqual(file.calls.options, { download: true })

const signedOut = fakeClient()
assert.equal((await request(signedOut.client, null)).code, 401)
assert.equal(signedOut.calls.signed, 0)

const wrongUser = fakeClient({ userId: userB })
assert.equal((await request(wrongUser.client)).code, 404)
assert.equal(wrongUser.calls.signed, 0)

const revoked = fakeClient({ granted: false })
assert.equal((await request(revoked.client)).code, 404)
assert.equal(revoked.calls.signed, 0)

const draft = fakeClient({ published: false })
assert.equal((await request(draft.client)).code, 404)
assert.equal(draft.calls.signed, 0)

const misplaced = fakeClient({ storagePath: `${courseId}/other-lesson/${mediaId}/sample.mp3` })
assert.equal((await request(misplaced.client)).code, 500)
assert.equal(misplaced.calls.signed, 0)

assert.equal((await request(fakeClient().client, 'valid', 'not-a-uuid')).code, 400)
const audioDownload = fakeClient()
const saved = await request(audioDownload.client, 'valid', mediaId, true)
assert.equal(saved.code, 200)
assert.equal(saved.headers['Cache-Control'], 'no-store')
assert.deepEqual(audioDownload.calls.options, { download: true })
assert.equal((await request(audioDownload.client, 'valid', mediaId, false)).code, 200)
assert.equal(audioDownload.calls.options, undefined)
for (const blocked of [wrongUser, revoked, draft, misplaced]) {
  const result = await request(blocked.client, 'valid', mediaId, true)
  assert.ok(result.code >= 400)
  assert.equal(blocked.calls.signed, 0)
}
assert.equal((await request(signedOut.client, null, mediaId, true)).code, 401)
for (const invalid of ['true', 1, null, {}]) {
  const bad = fakeClient()
  assert.equal((await request(bad.client, 'valid', mediaId, invalid)).code, 400)
  assert.equal(bad.calls.signed, 0)
}
console.log('course media API checks passed, including audio downloads and access refusals')
