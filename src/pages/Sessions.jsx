import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { getAllSessions } from '../lib/supabase'
import SessionCard from '../components/SessionCard'

const DEMO_SESSIONS = [
  { id: '1',  title: 'Deep Sleep Reset',                          category: 'Sleep',        duration: 22, free: true,  description: 'Gentle somatic unwinding to guide your nervous system into deep, restorative sleep.', audio_url: null },
  { id: '2',  title: 'Stress Off Switch',                         category: 'Stress',       duration: 18, free: true,  description: 'Rapid deactivation of the stress response. Reset your baseline in under 20 minutes.', audio_url: null },
  { id: '3',  title: 'Gut Brain Reset',                           category: 'IBS',          duration: 25, free: true,  description: 'Direct dialogue with the gut-brain axis to calm inflammation and reduce IBS symptoms.', audio_url: null },
  { id: '4',  title: 'Daily Regulation',                          category: 'Reset',        duration: 12, free: true,  description: 'Morning or evening reset. Build a regulated nervous system baseline one day at a time.', audio_url: null },
  { id: '5',  title: 'Anxiety Release',                           category: 'Anxiety',      duration: 20, free: false, description: 'Dissolve the root patterns driving chronic anxiety and hypervigilance.', audio_url: null },
  { id: '6',  title: 'Deep Focus',                                category: 'Focus',        duration: 15, free: false, description: 'Neurological priming for peak mental performance and sustained focus.', audio_url: null },
  { id: '7',  title: 'Unshakeable Confidence',                    category: 'Confidence',   duration: 24, free: false, description: 'Reprogram limiting beliefs around your worth, capability, and identity.', audio_url: null },
  { id: '8',  title: 'Grief Processing',                          category: 'Grief',        duration: 28, free: false, description: 'A safe, guided space to process loss and begin moving through grief.', audio_url: null },
  { id: '9',  title: 'Panic Attack Protocol',                     category: 'Anxiety',      duration: 10, free: false, description: 'Rapid response for acute panic. Brings you back to baseline fast.', audio_url: null },
  { id: '10', title: 'Morning Activation',                        category: 'Reset',        duration: 14, free: false, description: 'Start each day from a place of groundedness and regulated energy.', audio_url: null },
  { id: '11', title: 'Relationship Patterns',                     category: 'Confidence',   duration: 26, free: false, description: 'Identify and dissolve the nervous system patterns driving relationship struggles.', audio_url: null },
  { id: '12', title: 'Night Terror Relief',                       category: 'Sleep',        duration: 18, free: false, description: 'Gentle processing of the subconscious patterns behind night terrors and nightmares.', audio_url: null },
  { id: '13', title: 'VGB 1: The Surgery',             category: 'Weight Loss', duration: 12, free: false, description: 'The core hypnotic gastric band installation session. Your subconscious undergoes the full virtual surgical procedure.', audio_url: null },
  { id: '14', title: 'VGB 2: Surgery Backup Session',  category: 'Weight Loss', duration: 15, free: false, description: 'Reinforcement and deep anchoring of the virtual gastric band. Strengthens the installation for lasting results.', audio_url: null },
  { id: '15', title: 'VGB 3: Emotional Eating Reset',  category: 'Weight Loss', duration: 16, free: false, description: 'Targets the emotional triggers behind overeating at the root — dissolving the patterns that drive eating for comfort.', audio_url: null },
]

const categories = ['All', 'Sleep', 'Stress', 'IBS', 'Reset', 'Anxiety', 'Focus', 'Confidence', 'Grief', 'Weight Loss']

export default function Sessions() {
  const navigate = useNavigate()
  const { isPremium, completedSessions } = useApp()
  const [sessions, setSessions] = useState(DEMO_SESSIONS)
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    try {
      const data = await getAllSessions()
      if (data.length) setSessions(data)
    } catch {
      // Use demo data
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
