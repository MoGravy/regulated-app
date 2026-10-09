import { dayKey } from './streak.js'

export const listeningThreshold = seconds => Number.isFinite(seconds) && seconds > 0
  ? Math.max(60, Math.min(seconds * 0.8, 600)) : Infinity

// The native owner measures rendered playback while the WebView is suspended.
// Position is deliberately absent: a seek must never become listening credit.
export function createNativeListeningAttempt({ attemptId, mediaId, durationSeconds, heardSeconds = 0 }) {
  const prior = Number.isFinite(heardSeconds) && heardSeconds >= 0 ? heardSeconds : 0
  let heard = prior, duration = durationSeconds, total = 0, atMs = null, revision = -1, qualified = false
  return {
    get heardSeconds() { return heard },
    get qualified() { return qualified },
    consume(snapshot) {
      if (snapshot.attemptId !== attemptId || snapshot.evidenceSource !== 'native-rendered'
        || !Number.isInteger(snapshot.revision) || snapshot.revision <= revision
        || !Number.isFinite(snapshot.eligibleSeconds) || snapshot.eligibleSeconds < total
        || !Number.isFinite(snapshot.atMs) || snapshot.atMs < 0 || atMs !== null && snapshot.atMs < atMs
        || atMs === null && snapshot.eligibleSeconds !== 0
        || atMs !== null && snapshot.eligibleSeconds - total > (snapshot.atMs - atMs) / 1000 + 0.5) return null
      revision = snapshot.revision
      total = snapshot.eligibleSeconds
      atMs = snapshot.atMs
      if (Number.isFinite(snapshot.durationSeconds) && snapshot.durationSeconds > 0) duration = snapshot.durationSeconds
      if (!qualified) heard = prior + total
      const time = snapshot.qualifiedAtMs, offset = snapshot.offsetMinutes
      if (qualified || duration < 60 || heard < listeningThreshold(duration)
        || !Number.isFinite(time) || time <= 0 || time > Date.now() + 60000
        || !Number.isInteger(offset) || Math.abs(offset) > 840
        || !Number.isFinite(new Date(time).getTime())) return null
      qualified = true
      return {
        schemaVersion: 1, id: crypto.randomUUID(), attemptId, mediaId,
        heardSeconds: heard, durationSeconds: duration,
        qualifiedAt: new Date(time).toISOString(),
        localDate: new Date(time + offset * 60000).toISOString().slice(0, 10),
        offsetMinutes: offset, source: 'native-rendered',
      }
    },
  }
}

// The browser's played ranges prove rendering, not audibility on a muted device.
export function createListeningAttempt({ attemptId, mediaId, durationSeconds, heardSeconds = 0 }) {
  let heard = Number.isFinite(heardSeconds) && heardSeconds >= 0 ? heardSeconds : 0
  let duration = durationSeconds
  let previous = null
  let revision = -1
  let qualified = false
  return {
    get heardSeconds() { return heard },
    get qualified() { return qualified },
    consume(snapshot, now = new Date()) {
      if (snapshot.attemptId !== attemptId || !Number.isInteger(snapshot.revision) || snapshot.revision <= revision
        || !Number.isFinite(snapshot.position) || snapshot.position < 0 || !Number.isFinite(snapshot.atMs)) return null
      revision = snapshot.revision
      if (Number.isFinite(snapshot.durationSeconds) && snapshot.durationSeconds > 0) duration = snapshot.durationSeconds
      const delta = previous ? snapshot.position - previous.position : 0
      const elapsed = previous ? (snapshot.atMs - previous.atMs) / 1000 : 0
      if (!qualified && previous?.status === 'playing' && snapshot.status !== 'seeking'
        && delta > 0 && elapsed >= 0 && delta <= elapsed * (previous.rate || 1) + 0.5) {
        let rendered = 0
        let end = previous.position
        for (const [start, stop] of snapshot.played || []) {
          if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) continue
          const left = Math.max(previous.position, start, end)
          const right = Math.min(snapshot.position, stop)
          if (right > left) { rendered += right - left; end = right }
        }
        heard += rendered
      }
      previous = snapshot
      if (qualified || duration < 60 || heard < listeningThreshold(duration) || !Number.isFinite(now.getTime())) return null
      qualified = true
      return {
        schemaVersion: 1, id: crypto.randomUUID(), attemptId, mediaId,
        heardSeconds: heard, durationSeconds: duration,
        qualifiedAt: now.toISOString(), localDate: dayKey(now),
        offsetMinutes: -now.getTimezoneOffset(), source: 'web-played',
      }
    },
  }
}
