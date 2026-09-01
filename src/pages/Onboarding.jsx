import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import Texture from '../components/Texture'

// Three steps: who this is for, what brought you here, then in.
// Step 1 carries the email field the design puts on the first board.
const REASONS = ['Sleep', 'Stress', 'Anxiety', 'Gut symptoms', 'Something else']

export default function Onboarding() {
  const navigate = useNavigate()
  const { setOnboardingDone, setUserEmail, userEmail } = useApp()
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState(userEmail || '')
  const [emailError, setEmailError] = useState('')
  const [reason, setReason] = useState(null)

  function submitEmail() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter an email we can reach you on.')
      return
    }
    setEmailError('')
    setUserEmail(email)
    setStep(1)
  }

  function finish() {
    setOnboardingDone(true)
    navigate('/')
  }

  return (
    <div className="texture" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <Texture ink="#24344D" variant="page" />

      <div className="status-bar" style={{ position: 'relative' }}><span /><span /></div>

      <div style={{ position: 'relative', flex: 1, padding: '40px 24px 0', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ font: '500 13px/18px var(--font-ui)', color: 'var(--ink-muted)' }}>Regulated</div>

        {step === 0 && (
          <>
            <h1 style={{ margin: '12px 0 0', font: '300 38px/44px var(--font-display)', letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Feel safe in your own body
            </h1>
            <p style={{ margin: '18px 0 0', font: '400 17px/27px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
              Hypnotherapy audio for sleep, stress, anxiety and gut symptoms, recorded by a clinical
              hypnotherapist. Four sessions are free.
            </p>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="onboard-email">Email</label>
                <input
                  id="onboard-email"
                  className="form-input form-input-lg"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitEmail()}
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'onboard-email-error' : undefined}
                />
                {emailError && (
                  <div id="onboard-email-error" role="alert" style={{ font: '400 13px/18px var(--font-ui)', color: '#6A4B4E' }}>
                    {emailError}
                  </div>
                )}
              </div>
              <button className="btn-primary btn-lg" onClick={submitEmail}>Continue</button>
              <button className="btn-ghost" onClick={finish}>Skip for now</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 style={{ margin: '12px 0 0', font: '300 38px/44px var(--font-display)', letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              What brought you here?
            </h1>
            <p style={{ margin: '18px 0 0', font: '400 17px/27px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
              It points you at the right session first. You can change it later.
            </p>

            <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {REASONS.map(r => (
                <button
                  key={r}
                  className="chip chip-all"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  style={reason === r ? undefined : { border: '1px solid var(--line)', color: 'var(--ink-muted)' }}
                >
                  {r}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <button className="btn-primary btn-lg" onClick={() => setStep(2)} disabled={!reason}>Continue</button>
              <button className="btn-ghost" onClick={() => setStep(2)}>Skip</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={{ margin: '12px 0 0', font: '300 38px/44px var(--font-display)', letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Start with the library
            </h1>
            <p style={{ margin: '18px 0 0', font: '400 17px/27px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
              Four sessions are free, no card needed. The six-week program opens once it is ready.
            </p>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <button className="btn-primary btn-lg" onClick={finish}>Go to the library</button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '28px 0 32px' }}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: i === step ? 20 : 8,
                height: 3,
                borderRadius: 'var(--r-pill)',
                background: i === step ? 'var(--accent)' : 'var(--line-strong)',
                transition: 'width var(--t-enter)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
