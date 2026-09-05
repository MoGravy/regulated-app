import { useState } from 'react'
import { useApp } from '../hooks/useApp'

// "Notify me when this session is ready", for a session with no audio yet.
// Sits where the Start button would be. The row is written server-side.
export default function Waitlist({ session }) {
  const { userEmail } = useApp()
  const [email, setEmail] = useState(userEmail || '')
  const [state, setState] = useState('idle') // idle | busy | done | error

  async function submit(e) {
    e.preventDefault()
    setState('busy')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, email: email.trim() }),
      })
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
      setState('done')
    } catch (err) {
      console.error('[Waitlist] failed:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div role="status" style={{ font: '400 15px/22px var(--font-ui)', color: 'var(--ink)', textAlign: 'center' }}>
        You are on the list. One email when it is ready.
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <label className="form-label" htmlFor="waitlist-email">Notify me when this session is ready</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="waitlist-email"
          className="form-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button className="btn-primary" type="submit" disabled={state === 'busy'} style={{ flex: 'none', width: 'auto', padding: '0 18px' }}>
          Notify me
        </button>
      </div>
      {state === 'error' && (
        <div role="alert" style={{ marginTop: 8, font: '400 13px/18px var(--font-ui)', color: '#6A4B4E' }}>
          That did not go through. Try again in a moment.
        </div>
      )}
    </form>
  )
}
