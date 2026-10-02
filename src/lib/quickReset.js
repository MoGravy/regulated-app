export const DEFAULT_RESET_ID = '7a875d14-f77e-47e9-8ff3-16d5db08d2e6'
export const resetChoiceKey = scope => `regulated_reset_choice_v1:${encodeURIComponent(scope)}`

export function resetCandidates(sessions, savedId) {
  const free = sessions.filter(s => s.free === true && s.has_audio === true)
  const preferred = free.find(s => s.id === savedId) || free.find(s => s.id === DEFAULT_RESET_ID)
  return preferred ? [preferred, ...free.filter(s => s.id !== preferred.id)] : free
}

export async function resolveQuickReset(sessions, savedId, resolveAudio) {
  for (const session of resetCandidates(sessions, savedId)) {
    try {
      const url = await resolveAudio(session)
      if (typeof url === 'string' && url) return { session, url }
    } catch { /* A failed free track tries the next verified free row. */ }
  }
  return null
}
