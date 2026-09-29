import { useEffect, useState } from 'react'
import { carePushCopy as copy } from '../config/carePushCopy'
import { carePushRequest, disableCarePush, enableCarePush, supportsCarePush } from '../lib/carePush'

export default function CareAlerts({ userId }) {
  const [state, setState] = useState('loading')
  const [publicKey, setPublicKey] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    async function load() {
      if (!supportsCarePush()) return 'unavailable'
      const settings = await carePushRequest()
      if (!settings.configured) return 'unavailable'
      if (active) setPublicKey(settings.publicKey)
      if (Notification.permission === 'denied') return 'denied'
      const registration = await navigator.serviceWorker.getRegistration('/care-sw.js')
      return await registration?.pushManager.getSubscription() ? 'on' : 'off'
    }
    load().then(value => active && setState(value)).catch(() => active && setState('error'))
    return () => { active = false }
  }, [userId])

  async function change() {
    const previous = state
    setState('saving'); setError(false)
    try {
      if (previous === 'on') await disableCarePush()
      else await enableCarePush(publicKey)
      setState(previous === 'on' ? 'off' : 'on')
    } catch {
      setState(Notification.permission === 'denied' ? 'denied' : previous)
      setError(true)
    }
  }
  const status = { on: copy.alertsOn, off: copy.alertsOff, unavailable: copy.alertsUnavailable,
    denied: copy.alertsDenied, loading: copy.alertsSaving, saving: copy.alertsSaving, error: copy.alertsError }[state]
  return <section className="card" style={{ marginBottom: 20 }} aria-label={copy.notificationsTitle}>
    <h2 style={{ marginTop: 0 }}>{copy.notificationsTitle}</h2>
    <p role="status">{status}</p>
    {error && <p role="alert">{copy.alertsError}</p>}
    {['on', 'off', 'saving'].includes(state) && <button className="btn-primary" onClick={change} disabled={state === 'saving'}>
      {state === 'on' ? copy.disableAlerts : copy.enableAlerts}
    </button>}
    <p style={{ fontSize: 14 }}>{copy.homeScreenHelp}</p>
  </section>
}
