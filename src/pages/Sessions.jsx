import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { getAllSessions } from '../lib/supabase'
import { HARDCODED_SESSIONS } from '../lib/hardcodedSessions'
import { chipStyle, categoriesOf } from '../lib/categories'
import SessionRow from '../components/SessionRow'

export default function Sessions() {
  const { isPremium } = useApp()
  const [params, setParams] = useSearchParams()
  const [sessions, setSessions] = useState(HARDCODED_SESSIONS)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const active = params.get('category') || 'All'

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    try {
      const data = await getAllSessions()
      if (data.length) {
        const hasFree = data.some(s => s.free)
        setSessions(hasFree ? data : [...HARDCODED_SESSIONS.filter(s => s.free), ...data.filter(s => !s.free)])
      } else {
        console.warn('[Sessions] Supabase returned 0 rows — keeping hardcoded fallback.')
        setSessions(HARDCODED_SESSIONS)
      }
    } catch (err) {
      console.error('[Sessions] getAllSessions threw — keeping hardcoded fallback:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      setSessions(HARDCODED_SESSIONS)
      setOffline(!navigator.onLine)
    } finally {
      setLoading(false)
    }
  }

  // Chips come from the library itself, so a new category never needs a code
  // change. A session appears under its primary category and all of its tags.
  // Counting is case-insensitive; the first spelling seen becomes the label.
  const counts = {}
  const labels = {}
  for (const s of sessions) {
    for (const c of categoriesOf(s)) {
      const k = c.toLowerCase()
      if (!(k in labels)) labels[k] = c
      counts[k] = (counts[k] || 0) + 1
    }
  }
  const categories = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a] || labels[a].localeCompare(labels[b]))
    .map(k => labels[k])

  const visible = params.get('free') === '1' ? sessions.filter(s => s.free === true) : sessions
  const filtered = active === 'All'
    ? visible
    : visible.filter(s => categoriesOf(s).some(c => c.toLowerCase() === active.toLowerCase()))

  // Unlocked first, locked below — design 1d.
  const unlocked = filtered.filter(s => s.free || isPremium)
  const locked = filtered.filter(s => !s.free && !isPremium)

  function select(cat) {
    const next = params.get('free') === '1' ? { free: '1' } : {}
    if (cat !== 'All') next.category = cat
    setParams(next, { replace: true })
  }

  return (
    <div className="page">
      <div className="status-bar"><span /><a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a></div>

      <div className="page-content library-header" style={{ paddingTop: 8, paddingBottom: 12 }}>
        <h1 style={{ margin: '0 0 14px', font: '300 30px/36px var(--font-display)' }}>Library</h1>
        <div className="chip-row">
          <button
            className="chip chip-all"
            aria-pressed={active === 'All'}
            onClick={() => select('All')}
            style={active === 'All' ? undefined : { border: '1px solid var(--line)', color: 'var(--ink-muted)' }}
          >
            All {sessions.length}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className="chip"
              aria-pressed={active.toLowerCase() === cat.toLowerCase()}
              onClick={() => select(cat)}
              style={
                active.toLowerCase() === cat.toLowerCase()
                  ? { ...chipStyle(cat), fontWeight: 500 }
                  : chipStyle(cat)
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content">
        {offline && (
          <div className="card-flat fade-in" style={{ marginBottom: 12 }}>
            <div className="t-title">You are offline</div>
            <p className="t-caption" style={{ marginTop: 4 }}>Nothing is lost. The library comes back with the connection.</p>
            <button className="btn-ghost" style={{ height: 40, justifyContent: 'flex-start' }} onClick={() => { setOffline(false); setLoading(true); loadSessions() }}>Try again</button>
          </div>
        )}
        <div className="session-list">
          {unlocked.map(s => <SessionRow key={s.id} session={s} />)}
          {locked.map(s => <SessionRow key={s.id} session={s} />)}
        </div>

        {!loading && !filtered.length && (
          <div className="fade-in" style={{ padding: '32px 0', textAlign: 'center' }}>
            <div className="t-title">Nothing here yet</div>
            <p className="t-caption" style={{ marginTop: 6 }}>New sessions arrive monthly. Everything else is one tap away.</p>
            <button className="btn-ghost" onClick={() => select('All')}>Show everything</button>
          </div>
        )}
      </div>
    </div>
  )
}
