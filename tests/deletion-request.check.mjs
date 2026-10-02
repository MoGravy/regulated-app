import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../api/request-account-deletion.js'

function database() {
  const rows = new Map()
  return {
    rows,
    writes: 0,
    fail: null,
    auth: {
      async getUser(token) {
        return { data: { user: ['account-a', 'account-b'].includes(token) ? { id: token } : null } }
      },
    },
    from(table) {
      assert.equal(table, 'account_deletion_requests')
      return {
        upsert: async (row, options) => {
          this.writes++
          if (this.fail === 'write') return { error: new Error('private database detail') }
          if (!rows.has(row.account_id) || !options.ignoreDuplicates) {
            rows.set(row.account_id, { id: `receipt-${row.account_id}`, requested_at: new Date().toISOString() })
          }
          return { error: null }
        },
        select: () => ({ eq: (field, id) => {
          assert.equal(field, 'account_id')
          return { single: async () => this.fail === 'read'
            ? { data: null, error: new Error('private database detail') }
            : { data: rows.get(id), error: null } }
        } }),
      }
    },
  }
}

async function request(db, token, body = {}, method = 'POST') {
  const res = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
    end() { return this },
  }
  await handleRequest({ method, body, headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    origin: 'capacitor://localhost',
  } }, res, db)
  return res
}

test('only verified callers can request deletion for their own account', async () => {
  const db = database()
  assert.equal((await request(db)).code, 401)
  assert.equal((await request(db, 'invalid')).code, 401)
  assert.equal(db.writes, 0)
  const result = await request(db, 'account-a', { account_id: 'account-b', email: 'other@example.com' })
  assert.equal(result.code, 200)
  assert.equal(result.body.status, 'requested')
  assert.deepEqual([...db.rows.keys()], ['account-a'])
  assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'capacitor://localhost')
})

test('retries return the same receipt and accounts stay separate', async () => {
  const db = database()
  const first = await request(db, 'account-a')
  const repeat = await request(db, 'account-a')
  assert.deepEqual(repeat.body, first.body)
  assert.equal(db.rows.size, 1)
  const other = await request(db, 'account-b')
  assert.notEqual(other.body.requestId, first.body.requestId)
  assert.equal(db.rows.size, 2)
})

test('database failures never claim success or expose details', async () => {
  const db = database()
  for (const failure of ['write', 'read']) {
    db.fail = failure
    const result = await request(db, 'account-a')
    assert.equal(result.code, 500)
    assert.deepEqual(result.body, { error: 'Could not record the request' })
  }
  db.fail = null
  assert.equal((await request(db, 'account-a')).body.status, 'requested')
})

test('preflight and unsupported methods do not authenticate or write', async () => {
  const db = database()
  db.auth.getUser = () => assert.fail('Authentication must not run')
  assert.equal((await request(db, 'account-a', {}, 'OPTIONS')).code, 200)
  const result = await request(db, 'account-a', {}, 'GET')
  assert.equal(result.code, 405)
  assert.equal(result.headers.Allow, 'POST, OPTIONS')
  assert.equal(db.writes, 0)
})
