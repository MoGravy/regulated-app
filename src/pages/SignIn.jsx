import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { goBack } from '../lib/back'
import { useApp } from '../hooks/useApp'
import Texture from '../components/Texture'
import { sendMagicLink, signInWithPassword, signUpWithPassword } from '../lib/supabase'

// Design board "ONBOARDING": the note under it reads "Sign-in is the same
// screen without the paragraph", so this is onboarding step 1 with the
// marketing paragraph removed and the step dots dropped. The magic link is the
// primary path because the design draws only that. The password form the brief
// asks for sits under it as a disclosure.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignIn() {
  const navigate = useNavigate()
  const { userEmail, authUser, addToast } = useApp()
  const [email, setEmail] = useState(userEmail || '')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('link') // link | password | register
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (authUser) {
    return (
      <div className="page-plain" style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 10px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em' }}>
            You are signed in
          </h1>
          <p style={{ margin: '0 0 24px', font: '400 16px/25px var(--font-ui)', color: 'var(--ink-muted)' }}>
            As {authUser.email}.
          </p>
          <button className="btn-primary btn-lg" onClick={() => navigate('/premium')}>
            Go to your account
          </button>
        </div>
      </div>
    )
  }

  async function submit() {
    if (!EMAIL_RE.test(email)) {
      setError('Enter an email we can reach you on.')
      return
    }
    if (mode !== 'link' && password.length < 8) {
      setError('Passwords need at least 8 characters.')
      return
    }
    setError('')
    setLoading(true)
    try {
      if (mode === 'link') {
        await sendMagicLink(email)
        setSent(true)
      } else if (mode === 'password') {
        await signInWithPassword(email, password)
        addToast('Signed in.', 'success')
        navigate('/premium')
      } else {
        const { needsConfirmation } = await signUpWithPassword(email, password)
        if (needsConfirmation) setSent(true)
        else {
          addToast('Account created.', 'success')
          navigate('/premium')
        }
      }
    } catch (err) {
      console.error('[SignIn] failed:', err)
      setError(err.message || 'That did not work. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="texture"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}
    >
      <Texture ink="#24344D" variant="page" />

      <div className="status-bar" style={{ position: 'relative' }}><span /><span /></div>

      <div style={{ position: 'relative', height: 56, display: 'flex', alignItems: 'center', padding: '0 12px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <button className="btn-icon" onClick={() => goBack(navigate)} aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3l-5 5 5 5" stroke="var(--ink-muted)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ position: 'relative', flex: 1, padding: '24px 24px 0', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ font: '500 13px/18px var(--font-ui)', color: 'var(--ink-muted)' }}>Regulated</div>
        <h1 style={{ margin: '12px 0 0', font: '300 38px/44px var(--font-display)', letterSpacing: '-0.015em', textWrap: 'pretty' }}>
          Feel safe in your own body
        </h1>

        {sent ? (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 40 }}>
            <p style={{ margin: 0, font: '400 17px/27px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
              Check {email}. The link signs you in on this phone and stays signed in.
            </p>
            <button className="btn-ghost" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 40 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                className="form-input form-input-lg"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && mode === 'link' && submit()}
                aria-invalid={!!error}
                aria-describedby={error ? 'signin-error' : undefined}
              />
            </div>

            {mode !== 'link' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="signin-password">Password</label>
                <input
                  id="signin-password"
                  className="form-input form-input-lg"
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
              </div>
            )}

            {error && (
              <div id="signin-error" role="alert" style={{ font: '400 13px/18px var(--font-ui)', color: '#6A4B4E' }}>
                {error}
              </div>
            )}

            <button className="btn-primary btn-lg" onClick={submit} disabled={loading}>
              {loading ? 'One moment…' : LABELS[mode]}
            </button>

            <div style={{ font: '400 13px/20px var(--font-ui)', color: 'var(--ink-faint)', textWrap: 'pretty' }}>
              {mode === 'link'
                ? 'No password. The link signs you in on this phone and stays signed in.'
                : 'Your password only unlocks this account. Sessions stay on the device either way.'}
            </div>

            <button
              className="btn-ghost"
              onClick={() => {
                setError('')
                setMode(mode === 'link' ? 'password' : 'link')
              }}
            >
              {mode === 'link' ? 'Use a password instead' : 'Email me a link instead'}
            </button>

            {mode !== 'link' && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setError('')
                  setMode(mode === 'password' ? 'register' : 'password')
                }}
              >
                {mode === 'password' ? 'Create an account' : 'I already have an account'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const LABELS = {
  link: 'Email me a sign-in link',
  password: 'Sign in',
  register: 'Create account',
}
