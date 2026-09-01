import { createContext, useContext, useState, useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { supabase, checkSubscription, ensureProfile, signOutUser } from '../lib/supabase'

const AppContext = createContext(null)

// A session counts as "in progress" once past this fraction and before the end,
// so a stray two-second tap does not populate "Continue listening".
const RESUME_MIN = 0.02
const RESUME_MAX = 0.97

export function AppProvider({ children }) {
  const [userEmail, setUserEmail] = useLocalStorage('regulated_email', null)
  const [completedSessions, setCompletedSessions] = useLocalStorage('regulated_completed', [])
  const [progress, setProgress] = useLocalStorage('regulated_progress', {})
  const [isPremium, setIsPremium] = useState(false)
  const [onboardingDone, setOnboardingDone] = useLocalStorage('regulated_onboarding', false)
  const [toasts, setToasts] = useState([])
  const [authUser, setAuthUser] = useState(null)

  // Auth is additive. Signed out, everything below behaves exactly as it did
  // before phase 3: the localStorage email still drives the premium check.
  // Signed in, the verified address takes over as that email.
  useEffect(() => {
    let live = true

    function adopt(session) {
      if (!live) return
      const user = session?.user ?? null
      setAuthUser(user)
      if (user?.email) {
        setUserEmail(user.email)
        ensureProfile(user)
      }
    }

    supabase.auth.getSession().then(({ data }) => adopt(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => adopt(session))

    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
    // setUserEmail is a fresh closure every render; re-running this would tear
    // down the auth listener on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (userEmail) {
      checkSubscription(userEmail).then(setIsPremium)
    }
  }, [userEmail])

  // Signing out drops the local email too, otherwise premium would survive a
  // sign-out. "Restore a purchase" on the You tab gets it back.
  async function signOut() {
    await signOutUser()
    setAuthUser(null)
    setUserEmail(null)
    setIsPremium(false)
  }

  function markSessionComplete(sessionId) {
    if (!completedSessions.includes(sessionId)) {
      setCompletedSessions([...completedSessions, sessionId])
    }
    // Finished sessions leave "Continue listening".
    setProgress(prev => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
  }

  // Position in seconds. Drives the in-progress row state and the design's
  // "Continue listening" card. Local only — nothing is written to Supabase.
  function saveProgress(sessionId, position, duration) {
    if (!sessionId || !duration || !Number.isFinite(position)) return
    const ratio = position / duration
    setProgress(prev => {
      const next = { ...prev }
      if (ratio < RESUME_MIN || ratio > RESUME_MAX) delete next[sessionId]
      else next[sessionId] = { position, duration, updatedAt: Date.now() }
      return next
    })
  }

  // Most recently touched unfinished session, or null.
  function lastInProgress(sessions) {
    const entries = Object.entries(progress)
      .filter(([id]) => sessions.some(s => String(s.id) === String(id)))
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    if (!entries.length) return null
    const [id, p] = entries[0]
    return { session: sessions.find(s => String(s.id) === String(id)), ...p }
  }

  function addToast(message, type = 'info', duration = 4000) {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }

  return (
    <AppContext.Provider value={{
      userEmail, setUserEmail,
      completedSessions, markSessionComplete,
      progress, saveProgress, lastInProgress,
      isPremium, setIsPremium,
      authUser, signOut,
      onboardingDone, setOnboardingDone,
      toasts, addToast,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
