import assert from 'node:assert/strict'
import test from 'node:test'
import { handleDeletionAlert } from '../api/_deletion-alert.js'

const secret = 'local-test-cron-secret'
const env = {
  CRON_SECRET: secret, DELETION_MONITOR_ENABLED: 'true',
  DELETION_ALERT_EMAIL: 'operator@example.invalid', RESEND_API_KEY: 'unused-test-value',
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
  }
}

function database(rows, fail = false) {
  return () => ({
    from(table) {
      assert.equal(table, 'account_deletion_requests')
      const filters = []
      const query = {
        select(column, options) {
          assert.equal(column, 'id')
          assert.deepEqual(options, { count: 'exact', head: true })
          return this
        },
        is(column, value) { filters.push(row => row[column] === value); return this },
        eq(column, value) { filters.push(row => row[column] === value); return this },
        neq(column, value) { filters.push(row => row[column] !== value); return this },
        not(column, operator, value) {
          assert.equal(operator, 'is')
          filters.push(row => row[column] !== value)
          return this
        },
        lte(column, value) { filters.push(row => row[column] != null && row[column] <= value); return this },
        then(resolve) {
          return Promise.resolve(fail
            ? { count: null, error: new Error('private detail') }
            : { count: rows.filter(row => filters.every(filter => filter(row))).length, error: null }).then(resolve)
        },
      }
      return query
    },
  })
}

async function run({ rows = [], auth = `Bearer ${secret}`, config = env, method = 'GET', fail = false, send } = {}) {
  const res = response()
  let calls = 0
  await handleDeletionAlert({ method, headers: { authorization: auth } }, res, {
    env: config,
    now: () => new Date('2026-09-29T00:00:00Z'),
    database: () => { calls++; return database(rows, fail)() },
    send: send || (() => assert.fail('Email should not be sent')),
  })
  return { res, calls }
}

test('only the configured cron secret can read the queue', async () => {
  for (const auth of ['', 'Bearer wrong', `Bearer ${secret}x`]) {
    const { res, calls } = await run({ auth })
    assert.equal(res.code, 401)
    assert.equal(calls, 0)
  }
  const disabled = await run({ config: { ...env, DELETION_MONITOR_ENABLED: 'false' } })
  assert.equal(disabled.res.code, 503)
  assert.equal(disabled.calls, 0)
  const method = await run({ method: 'POST' })
  assert.equal(method.res.code, 405)
  assert.equal(method.calls, 0)
})

test('empty queue is quiet and never sends an email', async () => {
  const { res } = await run()
  assert.equal(res.code, 200)
  assert.deepEqual(res.body, { ok: true, attention: false })
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('one private count-only reminder covers review, cleanup, failures and held checks', async () => {
  const rows = [
    { id: 'private-account-a', reviewed_at: null, review_due_at: '2026-09-30T00:00:00.000Z', ordinary_state: 'pending', ordinary_due_at: '2026-10-01T00:00:00.000Z', last_error_code: null, held_state: 'pending' },
    { id: 'private-account-b', reviewed_at: '2026-09-20T00:00:00Z', ordinary_state: 'done', ordinary_due_at: '2026-09-20T00:00:00Z', last_error_code: 'review_required', held_state: 'held', next_run_at: '2026-09-30T00:00:00Z' },
  ]
  let message
  const { res } = await run({ rows, send: async value => { message = value; return { error: null } } })
  assert.equal(res.code, 200)
  assert.deepEqual(res.body, { ok: true, attention: true })
  assert.equal(message.to, env.DELETION_ALERT_EMAIL)
  assert.match(message.text, /Awaiting review: 1/)
  assert.match(message.text, /Review due within two days: 1/)
  assert.match(message.text, /Ordinary cleanup due within two days: 1/)
  assert.match(message.text, /Processing failures: 1/)
  assert.match(message.text, /Held records due for a check within two days: 1/)
  assert.equal(message.text.includes('private-account'), false)
})

test('read or email failure never claims a successful check', async () => {
  assert.equal((await run({ fail: true })).res.code, 500)
  const row = { reviewed_at: null, review_due_at: '2026-10-01T00:00:00Z', ordinary_state: 'pending', ordinary_due_at: '2026-10-30T00:00:00Z', last_error_code: null, held_state: 'pending' }
  assert.equal((await run({ rows: [row], send: async () => ({ error: new Error('private detail') }) })).res.code, 500)
})
