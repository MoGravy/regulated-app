import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { getAllSessions } from '../lib/supabase'
import { HARDCODED_SESSIONS } from '../lib/hardcodedSessions'
import SessionCard from '../components/SessionCard'

const categories = ['All', 'Sleep', 'Stress', 'Daily', 'Habits', 'Anxiety', 'Focus', 'Confidence', 'Grief', 'Weight Loss']

export default function Sessions() {
  const navigate = useNavigate()
  const { isPremium, completedSessions } = useApp()
  const [sessions, setSessions] = useState(HARDCODED_SESSIONS)
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    console.log('[Sessions] loadSessions — starting')
    try {
      const data = await getAllSessions()
      if (data.length) {
        console.log('[Sessions] ✓ Using Supabase sessions —', data.length, 'rows')
        const dataFree = data.filter(s => s.free)
        if (dataFree.length) {
          setSessions(data)
        } else {
          console.warn('[Sessions] Supabase had no free rows — keeping hardcoded free sessions.')
          setSessions([
            ...HARDCODED_SESSIONS.filter(s => s.free),
            ...data.filter(s => !s.free),
          ])
        }
      } else {
        console.warn('[Sessions] Supabase returned 0 rows — keeping hardcoded free sessions.')
        setSessions(HARDCODED_SESSIONS)
      }
    } catch (err) {
      console.error('[Sessions] getAllSessions threw — keeping hardcoded free sessions. Error:', err?.message || err)
      setSessions(HARDCODED_SESSIONS)
    } finally {
      setLoading(false)
    }
  }

  const filtered = activeCategory === 'All'
    ? sessions
    : sessions.filter(s => s.category?.toLowerCase() === activeCategory.toLowerCase())

  const freeSessions = filtered.filter(s => s.free)
  const premiumSessions = filtered.filter(s => !s.free)

  return (
    <div className="page animate-fade-in">
      <div className="page-content" style={{ paddingTop: 56 }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            Sessions
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
            {completedSessions.length} completed · {sessions.filter(s => s.free).length} free sessions
          </p>
        </div>

        {/* Category filter */}
        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 20,
          scrollbarWidth: 'none',
        }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: 20,
                border: `1px solid ${activeCategory === cat ? 'var(--accent)' : 'var(--border)'}`,
                background: activeCategory === cat ? 'var(--accent-glow)' : 'transparent',
                color: activeCategory === cat ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: activeCategory === cat ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Free sessions */}
        {freeSessions.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 12 }}>
              FREE SESSIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {freeSessions.map(session => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          </div>
        )}

        {/* Premium sessions */}
        {premiumSessions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                PREMIUM SESSIONS
              </div>
              {!isPremium && (
                <button
                  onClick={() => navigate('/premium')}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  Unlock all →
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {premiumSessions.map(session => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
            <div>No sessions in this category yet</div>
          </div>
        )}
      </div>
    </div>
  )
}
