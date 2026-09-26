import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { supabase } from '../lib/supabase'
import { apiUrl } from '../lib/apiUrl'

export default function AccountDeletion() {
  const { authUser } = useApp()
  return (
    <div className="page-plain" style={{ padding: '64px 24px' }}>
      <main style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 style={{ font: '300 32px/38px var(--font-display)' }}>Request account deletion</h1>
        <p>This page records your request to delete your account. Nothing is deleted right away.</p>
        {authUser ? <DeletionForm key={authUser.id} user={authUser} /> : (
          <>
            <p>Sign in to request deletion. You can also do this on the website after uninstalling the app.</p>
            <Link className="btn-primary btn-lg" to="/signin">Sign in</Link>
          </>
        )}
        <p><Link to="/premium">Back</Link></p>
      </main>
    </div>
  )
}

function DeletionForm({ user }) {
  const [confirmed, setConfirmed] = useState(false)
  const [phase, setPhase] = useState('idle')

  async function submit(event) {
    event.preventDefault()
    if (!confirmed || phase === 'submitting' || phase === 'saved') return
    setPhase('submitting')
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user.id !== user.id) throw new Error('Account changed')
      const response = await fetch(apiUrl('/api/request-account-deletion'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      if (!response.ok) throw new Error('Request failed')
      const receipt = await response.json()
      if (receipt.status !== 'requested' || !receipt.requestId) throw new Error('Missing receipt')
      setPhase('saved')
    } catch {
      setPhase('error')
    }
  }

  return (
    <>
      <p>Signed in as {user.email}</p>
      <p>Submitting this request does not cancel any subscription.</p>
      {phase === 'saved' ? (
        <div role="status" style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ font: '400 24px/30px var(--font-display)' }}>Request received</h2>
          <p>Your deletion request has been recorded.</p>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
          <label style={{ display: 'flex', gap: 12, alignItems: 'start', minHeight: 44 }}>
            <input type="checkbox" style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={phase === 'submitting'} />
            I want to request deletion of my account
          </label>
          {phase === 'error' && <p role="alert">Something went wrong. Please try again.</p>}
          <button className="btn-primary btn-lg" type="submit" disabled={!confirmed || phase === 'submitting'}>
            {phase === 'submitting' ? 'Submitting' : 'Submit request'}
          </button>
        </form>
      )}
    </>
  )
}
