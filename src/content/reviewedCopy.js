import copy from './reviewed-copy.json' with { type: 'json' }

export const ui = copy.ui

export function reviewedSession(session) {
  const reviewed = Object.hasOwn(copy.sessions, session.id) ? copy.sessions[session.id] : null
  return reviewed ? { ...session, title: reviewed.title, description: reviewed.description } : session
}

export function unreviewedSessionIds(sessions) {
  return sessions.filter(session => !Object.hasOwn(copy.sessions, session.id)).map(session => session.id)
}
