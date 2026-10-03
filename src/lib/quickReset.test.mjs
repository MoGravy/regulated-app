import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('./quickReset.js').catch(() => ({}))
test('saved premium, deleted or failed media falls back only to a verified free row', async () => {
  assert.equal(typeof api.resolveQuickReset, 'function', 'Quick Reset resolver is missing')
  const sessions = [{ id: 'premium', free: false, has_audio: true }, { id: 'bad', free: true, has_audio: true }, { id: 'good', free: true, has_audio: true }]
  const seen = []
  const resolve = async row => { seen.push(row.id); if (row.id === 'bad') throw Error('gone'); return '/verified.wav' }
  const picked = await api.resolveQuickReset(sessions, 'premium', resolve)
  assert.equal(picked.session.id, 'good')
  assert.deepEqual(seen, ['bad', 'good'])
  assert.equal(picked.url, '/verified.wav')
  assert.equal(await api.resolveQuickReset([{ id: 'paid', free: false, has_audio: true }], 'paid', resolve), null)
})
test('current Daily Reset is preferred and unavailable rows are excluded', async () => {
  const rows = [{ id: 'other', free: true, has_audio: true }, { id: api.DEFAULT_RESET_ID, free: true, has_audio: true }, { id: 'missing', free: true, has_audio: false }]
  assert.equal((await api.resolveQuickReset(rows, null, async () => '/audio.wav')).session.id, api.DEFAULT_RESET_ID)
  assert.equal((await api.resolveQuickReset(rows, 'other', async () => '/audio.wav')).session.id, 'other')
})
