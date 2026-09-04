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

  const filtered = active === 'All'
    ? sessions
    : sessions.filter(s => categoriesOf(s).some(c => c.toLowerCase() === active.toLowerCase()))

  // Unlocked first, locked below — design 1d.
  const unlocked = filtered.filter(s => s.free || isPremium)
  const locked = filtered.filter(s => !s.free && !isPremium)

  function select(cat) {
    if (cat === 'All') setParams({}, { replace: true })
    else setParams({ category: cat }, { replace: true })
  }

  return (
    <div className="page">
      <div className="status-bar"><span /><span>Regulated</span></div>

      <div style={{ padding: '8px 20px 12px', maxWidth: 480, margin: '0 auto' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {unlocked.map(s => <SessionRow key={s.id} session={s} />)}
          {locked.map(s => <SessionRow key={s.id} session={s} />)}
        </div>

        {!loading && !filtered.length && (
          <div className="t-caption" style={{ padding: '32px 0', textAlign: 'center' }}>
            Nothing in {active} yet.
          </div>
        )}
      </div>
    </div>
  )
}
