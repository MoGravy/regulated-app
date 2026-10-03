import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { authHeaders, getAllSessions } from '../lib/supabase'
import { resetCandidates, resetChoiceKey, resolveQuickReset } from '../lib/quickReset'
import { resetCopy as copy } from '../config/resetCopy'
import SessionPlayer from './SessionPlayer'

export default function QuickReset() {
  const { practiceScope } = useApp()
  return <ResetSelection key={practiceScope || 'loading'} scope={practiceScope} />
}

function ResetSelection({ scope }) {
  const navigate = useNavigate()
  const [chosen, setChosen] = useState(null)
  const [choices, setChoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [failedIds, setFailedIds] = useState([])
  const [preferred, setPreferred] = useState(() => {
    try { return scope ? localStorage.getItem(resetChoiceKey(scope)) : null } catch { return null }
  })
  useEffect(() => {
    if (!scope) return
    let live = true
    setLoading(true)
    setChosen(null)
    async function load() {
      try {
        const rows = (await getAllSessions({ fallback: false })).filter(s => !failedIds.includes(s.id))
        const selected = await resolveQuickReset(rows, preferred, async session => {
          const r = await fetch('/api/get-audio-url', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() },
            body: JSON.stringify({ sessionId: session.id }),
          })
          if (!r.ok) throw Error('unavailable')
          return (await r.json()).url
        })
        if (!live) return
        setChoices(resetCandidates(rows, selected?.session.id))
        setChosen(selected)
        if (selected) {
          try { localStorage.setItem(resetChoiceKey(scope), selected.session.id) } catch { /* Playback remains available. */ }
        }
      } catch { /* Recovery stays in the free library. */ }
      finally { if (live) setLoading(false) }
    }
    load()
    return () => { live = false }
  }, [scope, preferred, retry, failedIds])

  if (chosen && !loading) return <SessionPlayer key={chosen.session.id} resetSession={chosen.session} resetUrl={chosen.url}
    onResetError={() => setFailedIds(ids => ids.includes(chosen.session.id) ? ids : [...ids, chosen.session.id])}
    resetControls={
    <div className="reset-choice">
      <h2 className="t-label">{copy.title}</h2>
      <label htmlFor="reset-choice">{copy.choose}</label>
      <select id="reset-choice" value={chosen.session.id} onChange={e => setPreferred(e.target.value)}>
        {choices.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
    </div>
  } />

  return <div className="page">
    <div className="status-bar"><button className="btn-ghost" onClick={() => navigate('/')}>{copy.back}</button></div>
    <div className="page-content reset-empty">
      <h1 className="t-display-m">{copy.title}</h1>
      <p role="status">{loading ? copy.loading : copy.unavailable}</p>
      {!loading && <>
        <button className="btn-primary" onClick={() => { setFailedIds([]); setRetry(n => n + 1) }}>{copy.retry}</button>
        <button className="btn-ghost" onClick={() => navigate('/sessions?free=1')}>{copy.browse}</button>
      </>}
    </div>
  </div>
}
