import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { careConnectCopy as copy } from '../config/careConnectCopy'

async function request(fields) {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Signed out')
  const response = await fetch('/api/care-connect', {
    method: fields ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(fields && { 'Content-Type': 'application/json' }) },
    ...(fields && { body: JSON.stringify(fields) }),
  })
  if (!response.ok) throw new Error('Connection failed')
  return response.json()
}

export default function CareConnect({ userId, onConnected }) {
  const [allowed, setAllowed] = useState(false)
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    let active = true
    request().then(data => active && setAllowed(data.canConnect === true)).catch(() => {})
    return () => { active = false }
  }, [userId])
  if (!allowed) return null
  async function connect(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setStatus('')
    try {
      await request({ email: email.trim(), label: label.trim() })
      setEmail(''); setLabel(''); setStatus('success')
      onConnected()
    } catch { setStatus('error') }
    finally { setSaving(false) }
  }
  return <form className="card" onSubmit={connect} style={{ marginBottom: 20 }}>
    <h2 style={{ marginTop: 0 }}>{copy.connectTitle}</h2>
    <p>{copy.connectHelp}</p>
    <label htmlFor="care-client-email">{copy.clientEmailLabel}</label>
    <input id="care-client-email" type="email" autoComplete="off" required maxLength={254}
      value={email} onChange={event => setEmail(event.target.value)}
      style={{ display: 'block', width: '100%', margin: '8px 0 16px' }} />
    <label htmlFor="care-client-label">{copy.clientNameLabel}</label>
    <input id="care-client-label" required maxLength={100} value={label} onChange={event => setLabel(event.target.value)}
      style={{ display: 'block', width: '100%', margin: '8px 0 16px' }} />
    <button className="btn-primary" disabled={saving || !email.trim() || !label.trim()}>
      {saving ? copy.connecting : copy.connectButton}
    </button>
    {status && <p role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? copy.connectError : copy.connectSuccess}</p>}
  </form>
}
