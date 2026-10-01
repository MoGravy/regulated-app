import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'

// Keep alert routing mounted on every screen, including while iOS resumes the app.
export default function CareNotificationRouter() {
  const navigate = useNavigate()
  const { authReady, authUser } = useApp()
  useEffect(() => {
    const worker = navigator.serviceWorker
    if (!worker || !authReady || !authUser) return
    let active = true
    const onNotification = event => {
      const data = event.data
      if (!active || data?.type !== 'care-notification' || typeof data.url !== 'string') return
      if (data.recipientId && data.recipientId !== authUser.id) return
      try {
        const url = new URL(data.url, window.location.origin)
        if (url.origin !== window.location.origin || url.pathname !== '/care') return
        navigate(url.pathname + url.search)
        event.source?.postMessage({ type: 'care-notification-ack', recipientId: authUser.id, url: data.url })
      } catch { /* Ignore malformed alert destinations. */ }
    }
    const resume = () => {
      if (document.visibilityState === 'hidden') return
      worker.getRegistration('/care-sw.js').then(registration => {
        if (!active) return
        registration?.active?.postMessage({ type: 'care-notification-pending', recipientId: authUser.id })
        registration?.update().catch(() => {})
      }).catch(() => {})
    }
    worker.addEventListener('message', onNotification)
    worker.addEventListener('controllerchange', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    resume()
    return () => {
      active = false
      worker.removeEventListener('message', onNotification)
      worker.removeEventListener('controllerchange', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [authReady, authUser?.id, navigate])
  return null
}
