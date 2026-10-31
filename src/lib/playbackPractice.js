import { createListeningAttempt, createNativeListeningAttempt } from './qualifiedListening.js'

export function createPlaybackPractice({ native, mediaId, prior, updatePractice, onQualified }) {
  const accumulator = (native ? createNativeListeningAttempt : createListeningAttempt)({
    ...prior, mediaId, durationSeconds: NaN,
  })
  let token = null, closed = false, lastHeardAt = prior.updatedAt || Date.now()
  function receive(snapshot) {
    if (closed || !snapshot || String(snapshot.sessionId) !== String(mediaId)
      || typeof snapshot.token !== 'string' || !snapshot.token || token && snapshot.token !== token) return
    token ||= snapshot.token
    const before = accumulator.heardSeconds
    const event = accumulator.consume({ ...snapshot, attemptId: prior.attemptId,
      durationSeconds: snapshot.duration,
      status: snapshot.seeking ? 'seeking' : snapshot.muted || snapshot.volume === 0 ? 'paused' : snapshot.status,
    })
    if (accumulator.heardSeconds > before) {
      lastHeardAt = native && Number.isFinite(snapshot.lastRenderedAtMs) ? snapshot.lastRenderedAtMs : Date.now()
    }
    updatePractice(prior.scope, {
      mediaId, attemptId: prior.attemptId, heardSeconds: accumulator.heardSeconds,
      durationSeconds: snapshot.duration, updatedAt: lastHeardAt, qualified: accumulator.qualified,
    }, event)
    if (event) onQualified()
  }
  return {
    priorCreditSeconds: prior.heardSeconds || 0,
    receive,
    close(snapshot) { receive(snapshot); closed = true },
  }
}
