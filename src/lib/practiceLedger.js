import { dayKey } from './streak.js'
import { listeningThreshold } from './qualifiedListening.js'

const AWARDS = [7, 20, 50, 100]
const DAY = 86400000
export const practiceKey = scope => `regulated_practice_preview_v1:${encodeURIComponent(scope)}`
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const ordinal = value => Date.parse(value) / DAY
export const emptyLedger = () => ({ schemaVersion: 1, events: [], legacyDays: [], legacyImported: false, legacyRolloverHours: 4, best: 0, awards: [], attempts: {} })

function validEvent(e) {
  return e && e.schemaVersion === 1 && typeof e.id === 'string' && !!e.id
    && typeof e.attemptId === 'string' && !!e.attemptId && typeof e.mediaId === 'string' && !!e.mediaId
    && Number.isFinite(e.durationSeconds) && e.durationSeconds >= 60
    && Number.isFinite(e.heardSeconds) && e.heardSeconds >= listeningThreshold(e.durationSeconds)
    && validDate(e.localDate) && Number.isFinite(Date.parse(e.qualifiedAt))
    && Number.isInteger(e.offsetMinutes) && Math.abs(e.offsetMinutes) <= 840
    && new Date(Date.parse(e.qualifiedAt) + e.offsetMinutes * 60000).toISOString().slice(0, 10) === e.localDate
    && ['web-played', 'native-rendered'].includes(e.source)
}

function validAttempt(a, mediaId) {
  return a && a.mediaId === mediaId && typeof a.attemptId === 'string' && !!a.attemptId
    && Number.isFinite(a.heardSeconds) && a.heardSeconds >= 0 && Number.isFinite(a.updatedAt)
    && (a.durationSeconds == null || Number.isFinite(a.durationSeconds) && a.durationSeconds >= 0)
    && a.qualified === false
}

function validLedger(value) {
  return value?.schemaVersion === 1 && Array.isArray(value.events) && value.events.every(validEvent)
    && Array.isArray(value.legacyDays) && value.legacyDays.every(validDate)
    && typeof value.legacyImported === 'boolean' && value.legacyRolloverHours === 4
    && Number.isInteger(value.best) && value.best >= 0 && Array.isArray(value.awards)
    && value.awards.every(a => AWARDS.includes(a)) && value.attempts && typeof value.attempts === 'object'
    && !Array.isArray(value.attempts) && Object.entries(value.attempts).every(([id, a]) => validAttempt(a, id))
}

export function loadPractice(storage, scope) {
  try {
    const raw = storage.getItem(practiceKey(scope))
    if (raw !== null) {
      const ledger = JSON.parse(raw)
      if (!validLedger(ledger)) throw Error('invalid ledger')
      return { ledger, storageOK: true }
    }
    const ledger = emptyLedger()
    if (scope === 'guest') {
      const retained = JSON.parse(storage.getItem('regulated_practice_days') || '[]')
      ledger.legacyDays = Array.isArray(retained) ? [...new Set(retained.filter(validDate))] : []
      ledger.legacyImported = true
    }
    return { ledger, storageOK: true }
  } catch {
    return { ledger: emptyLedger(), storageOK: false }
  }
}

export function savePractice(storage, scope, ledger) {
  try {
    const old = storage.getItem(practiceKey(scope))
    if (old !== null && !validLedger(JSON.parse(old))) return false
    if (!validLedger(ledger)) return false
    storage.setItem(practiceKey(scope), JSON.stringify(ledger))
    return true
  } catch { return false }
}

function runs(dates) {
  let run = 0, best = 0, previous = null
  for (const date of dates) {
    run = previous !== null && ordinal(date) - ordinal(previous) <= 2 ? run + 1 : 1
    best = Math.max(best, run)
    previous = date
  }
  return { run, best, last: previous }
}

export function projectPractice(ledger, now = new Date()) {
  const dates = [...new Set([...ledger.legacyDays, ...ledger.events.map(e => e.localDate)])].sort()
  const eligible = [...new Set([...ledger.legacyDays, ...ledger.events.filter(e => e.runEligible !== false).map(e => e.localDate)])]
    .filter(d => d <= dayKey(now)).sort()
  const active = runs(eligible)
  const gap = active.last ? ordinal(dayKey(now)) - ordinal(active.last) : Infinity
  return {
    days: dates.length,
    currentRun: gap <= 2 ? active.run : 0,
    best: Math.max(ledger.best, runs(dates).best),
    awards: AWARDS.filter(a => ledger.awards.includes(a) || dates.length >= a),
    legacyMinimum: ledger.legacyDays.length > 0,
  }
}

export function acceptPractice(ledger, e, now = new Date()) {
  if (!validEvent(e) || Date.parse(e.qualifiedAt) > now.getTime() + 60000
    || ledger.events.some(old => old.id === e.id || old.attemptId === e.attemptId)) return ledger
  const next = { ...ledger, events: [...ledger.events, {
    schemaVersion: 1, id: e.id, attemptId: e.attemptId, mediaId: e.mediaId,
    heardSeconds: e.heardSeconds, durationSeconds: e.durationSeconds,
    qualifiedAt: e.qualifiedAt, localDate: e.localDate, offsetMinutes: e.offsetMinutes,
    source: e.source, runEligible: now.getTime() - Date.parse(e.qualifiedAt) <= 7 * DAY,
  }] }
  const summary = projectPractice(next, now)
  return { ...next, best: summary.best, awards: summary.awards }
}

export function retryCredit(ledger, mediaId, atMs = Date.now()) {
  const a = ledger.attempts[mediaId]
  return a && a.mediaId === mediaId && !a.qualified && Number.isFinite(a.updatedAt)
    && atMs >= a.updatedAt && atMs - a.updatedAt <= 600000
    && Number.isFinite(a.heardSeconds) && a.heardSeconds >= 0 && a.heardSeconds < listeningThreshold(a.durationSeconds)
    ? a : null
}

export function checkpointAttempt(ledger, a) {
  if (!a.mediaId || !a.attemptId || !Number.isFinite(a.updatedAt) || !Number.isFinite(a.heardSeconds) || a.heardSeconds < 0) return ledger
  const attempts = Object.fromEntries(Object.entries(ledger.attempts).filter(([id, old]) => validAttempt(old, id) && a.updatedAt - old.updatedAt <= 600000))
  if (a.qualified) delete attempts[a.mediaId]
  else attempts[a.mediaId] = {
    mediaId: a.mediaId, attemptId: a.attemptId, heardSeconds: a.heardSeconds,
    durationSeconds: Number.isFinite(a.durationSeconds) ? a.durationSeconds : null, updatedAt: a.updatedAt, qualified: false,
  }
  return { ...ledger, attempts }
}
