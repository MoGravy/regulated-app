import { createContext, useContext, useState, useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { checkSubscription } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [userEmail, setUserEmail] = useLocalStorage('regulated_email', null)
  const [completedSessions, setCompletedSessions] = useLocalStorage('regulated_completed', [])
  const [isPremium, setIsPremium] = useState(false)
  const [onboardingDone, setOnboardingDone] = useLocalStorage('regulated_onboarding', false)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    if (userEmail) {
      checkSubscription(userEmail).then(setIsPremium)
    }
  }, [userEmail])

  function markSessionComplete(sessionId) {
    if (!completedSessions.includes(sessionId)) {
      setCompletedSessions([...completedSessions, sessionId])
    }
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
      isPremium, setIsPremium,
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
