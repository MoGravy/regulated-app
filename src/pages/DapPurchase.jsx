import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { authHeaders, supabase } from '../lib/supabase'
import { CourseFrame } from './Courses'
import { dapPurchaseCopy as copy } from '../config/dapPurchaseCopy'

const DAP_ID = '0a02caf8-5050-571c-9a70-e2bcda2253a3'

export default function DapPurchase() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { authUser, authReady } = useApp()
  const [enabled, setEnabled] = useState(false)
  const [access, setAccess] = useState(null)
  const [checkedAccount, setCheckedAccount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const sessionId = params.get('session_id')
  const native = !!window.Capacitor?.isNativePlatform?.()
  const ready = !!authUser && access === authUser.id

  useEffect(() => {
    let active = true
    fetch('/api/dap-checkout').then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setEnabled(data?.enabled === true) })
      .catch(() => { if (active) setEnabled(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!authReady || !authUser || native) return
    let active = true
    async function check() {
      try {
        if (sessionId) {
          const response = await fetch('/api/dap-checkout', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() },
            body: JSON.stringify({ action: 'status', sessionId }),
          })
          if (!response.ok) throw new Error('Unavailable')
        }
        const { data, error: readError } = await supabase.from('courses').select('id').eq('id', DAP_ID).maybeSingle()
        if (readError) throw readError
        if (active) { setAccess(data ? authUser.id : null); setCheckedAccount(authUser.id); setError(false) }
      } catch { if (active) { setAccess(null); setCheckedAccount(authUser.id); setError(true) } }
    }
    check()
    return () => { active = false }
  }, [authReady, authUser, sessionId, native, refresh])

  async function buy() {
    setBusy(true)
    setError(false)
    try {
      const response = await fetch('/api/dap-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({}),
      })
      const result = await response.json()
      const url = new URL(result.url)
      if (!response.ok || url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Unavailable')
      window.location.assign(url.href)
    } catch { setError(true); setBusy(false) }
  }

  return <CourseFrame title={copy.title} backTo="/courses">
    {native ? <p>{copy.browserOnly}</p> : <div className="course-lesson-copy">
      <p>{copy.intro}</p>
      <p style={{ fontSize: 24, fontWeight: 700 }}>{copy.price}</p>
      <h2>{copy.refundHeading}</h2>
      <p>{copy.refundBody}</p>
      {error && <p role="alert">{copy.unavailable}</p>}
      {!authReady ? null : ready
        ? <button className="btn-primary btn-lg" onClick={() => navigate(`/courses/${DAP_ID}`)}>{copy.openCourse}</button>
        : !authUser ? <>
          <p>{copy.signInPrompt}</p>
          <button className="btn-primary btn-lg" onClick={() => navigate('/signin?next=/dap')}>{copy.signInButton}</button>
        </> : sessionId ? <>
          {!error && <p role="status">{copy.paymentPending}</p>}
          <button className="btn-primary btn-lg" onClick={() => setRefresh(value => value + 1)}>{copy.refresh}</button>
        </> : <>
          {!enabled && <p>{copy.unavailable}</p>}
          {busy && <p role="status">{copy.paying}</p>}
          <button className="btn-primary btn-lg" disabled={!enabled || busy || error || checkedAccount !== authUser.id} onClick={buy}>{copy.buyButton}</button>
        </>}
    </div>}
  </CourseFrame>
}
