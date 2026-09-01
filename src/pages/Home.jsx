import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { getAllSessions } from '../lib/supabase'
import { HARDCODED_SESSIONS } from '../lib/hardcodedSessions'
import { categoryOf, tint, chipStyle } from '../lib/categories'
import { programUnlocked, programAt, programWeeks } from '../config/program'
import DayDots from '../components/DayDots'
import SessionRow from '../components/SessionRow'
import Texture from '../components/Texture'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function whenLabel() {
  const d = new Date()
  const day = d.toLocaleDateString('en-AU', { weekday: 'long' })
  const h = d.getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `${day} ${part}`
}

export default function Home() {
  const navigate = useNavigate()
  const { onboardingDone, lastInProgress, mode, setMode, programDay } = useApp()
  const [sessions, setSessions] = useState(HARDCODED_SESSIONS)
  const [loading, setLoading] = useState(true)
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (!onboardingDone && !hasRedirected.current) {
      hasRedirected.current = true
      navigate('/welcome', { replace: true })
      return
    }
    loadSessions()
  }, [onboardingDone])

  async function loadSessions() {
    try {
      const data = await getAllSessions()
      if (data.length) setSessions(data)
    } catch (err) {
      console.error('[Home] getAllSessions failed:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    } finally {
      setLoading(false)
    }
  }

  const resume = lastInProgress(sessions)

  // Program mode only renders when the sequencing has been approved; until then
  // the switch is disabled and Browse is all there is.
  const unlocked = programUnlocked()
  const programMode = unlocked && mode === 'program'
  const { today, doneCount, finished } = programAt(programDay)
  const currentWeek = programWeeks(doneCount).find(w => w.status === 'current')
  const todaySession = today && sessions.find(s => String(s.id) === String(today.session_id))

  // Category tiles, biggest families first — "Where you are today".
  const families = Object.entries(
    sessions.reduce((acc, s) => {
      const key = s.category || 'Other'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const newest = [...sessions]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]

  return (
    <div className="page">
      <div className="status-bar"><span /><span>Regulated</span></div>

      <div className="page-content" style={{ paddingTop: 8 }}>
        <div className="t-caption">{whenLabel()}</div>
        <h1 style={{ margin: '4px 0 20px', font: '300 32px/38px var(--font-display)', letterSpacing: '-0.01em' }}>
          {greeting()}
        </h1>

        <div className="segmented" role="tablist" aria-label="Mode" style={{ marginBottom: 24 }}>
          <button
            role="tab"
            className="segmented-item"
            aria-selected={programMode}
            disabled={!unlocked}
            onClick={() => setMode('program')}
            title={unlocked ? undefined : 'Coming soon'}
          >
            Program{unlocked ? '' : ' · soon'}
          </button>
          <button
            role="tab"
            className="segmented-item"
            aria-selected={!programMode}
            onClick={() => setMode('browse')}
          >
            Browse
          </button>
        </div>

        {programMode && (
          <Today
            day={today}
            session={todaySession}
            week={currentWeek}
            doneCount={doneCount}
            finished={finished}
            navigate={navigate}
          />
        )}

        {resume?.session && (
          <>
            <div className="t-section" style={{ marginBottom: 10 }}>Continue listening</div>
            <ResumeCard resume={resume} onPlay={() => navigate(`/sessions/${resume.session.id}`)} />
          </>
        )}

        {!programMode && !!families.length && (
          <>
            <div className="t-section" style={{ margin: '26px 0 10px' }}>Where you are today</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {families.map(([name, count]) => (
                <CategoryTile
                  key={name}
                  name={name}
                  count={count}
                  onClick={() => navigate(`/sessions?category=${encodeURIComponent(name)}`)}
                />
              ))}
            </div>
          </>
        )}

        {!programMode && newest && (
          <>
            <div className="t-section" style={{ margin: '26px 0 10px' }}>New this month</div>
            <SessionRow session={newest} />
          </>
        )}

        {loading && <div className="t-caption" style={{ marginTop: 20 }}>Loading your library…</div>}
      </div>
    </div>
  )
}

function ResumeCard({ resume, onPlay }) {
  const { session, position, duration } = resume
  const { ink, label } = categoryOf(session.category)
  const pct = Math.round((position / duration) * 100)
  const minsLeft = Math.max(1, Math.round((duration - position) / 60))
  const total = Math.round(duration / 60)

  return (
    <div className="card texture" style={{ padding: 18 }}>
      <Texture ink={ink} variant="card" />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          className="btn-play"
          style={{ width: 52, height: 52 }}
          onClick={onPlay}
          aria-label={`Resume ${session.title}`}
        >
          <svg width="15" height="18" viewBox="0 0 15 18" aria-hidden="true">
            <polygon points="2,1 14,9 2,17" fill="var(--on-control)" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '400 22px/28px var(--font-display)', color: 'var(--ink)' }}>{session.title}</div>
          <div className="t-caption">{label} · {minsLeft} min left of {total}</div>
          <div className="track" style={{ marginTop: 8 }}><span style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    </div>
  )
}

function CategoryTile({ name, count, onClick }) {
  const { ink, icon: Icon } = categoryOf(name)
  return (
    <button
      onClick={onClick}
      className="texture"
      style={{
        height: 96,
        borderRadius: 'var(--r-card)',
        background: tint(ink, 0.09),
        border: `1px solid ${tint(ink, 0.18)}`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Texture ink={ink} variant="tile" />
      {Icon && (
        <Icon
          size={18}
          weight="light"
          color={ink}
          aria-hidden="true"
          style={{ position: 'absolute', right: 12, top: 12, opacity: 0.5 }}
        />
      )}
      <span style={{ position: 'relative', font: '400 19px/24px var(--font-display)', color: 'var(--ink)' }}>{name}</span>
      <span style={{ position: 'relative', font: '400 12px/16px var(--font-ui)', color: 'var(--ink-muted)' }}>
        {count} session{count === 1 ? '' : 's'}
      </span>
    </button>
  )
}

// Design board "HOME navy, program mode". Amber appears exactly twice on this
// screen, as the design requires: the play control and the progress fill.
function Today({ day, session, week, doneCount, finished, navigate }) {
  const seeAll = (
    <button className="btn-ghost" style={{ marginTop: 14 }} onClick={() => navigate('/program')}>
      See all six weeks
    </button>
  )

  if (finished) {
    return (
      <>
        <div className="card" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: '0 0 6px', font: '400 26px/32px var(--font-display)' }}>Six weeks done</h2>
          <p style={{ margin: 0, font: '400 15px/23px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
            You have finished every session in the program. Anything in it can be listened to again whenever you want it.
          </p>
        </div>
        {seeAll}
        <div style={{ height: 26 }} />
      </>
    )
  }

  // The map points at a session id the library does not have. Rather than draw
  // a card with nothing behind it, send them to the week view.
  if (!session) {
    return (
      <>
        <div className="card" style={{ marginBottom: 4 }}>
          <p style={{ margin: 0, font: '400 15px/23px var(--font-ui)', color: 'var(--ink-muted)' }}>
            Today&rsquo;s session is not in your library yet.
          </p>
        </div>
        {seeAll}
        <div style={{ height: 26 }} />
      </>
    )
  }

  const { ink, label } = categoryOf(session.category)

  return (
    <>
      <div className="t-section" style={{ marginBottom: 10 }}>
        Today · Week {day.week}, day {day.day}
      </div>

      <div className="card texture" style={{ padding: 20 }}>
        <Texture ink={ink} variant="card" />
        <div style={{ position: 'relative' }}>
          {label && (
            <span
              className="chip"
              style={{ ...chipStyle(session.category), display: 'inline-flex', pointerEvents: 'none' }}
            >
              {label}
            </span>
          )}
          <h2 style={{ margin: '12px 0 6px', font: '400 26px/32px var(--font-display)' }}>{session.title}</h2>
          <div className="t-caption">{session.duration} minutes</div>
          {session.description && (
            <p style={{ margin: '12px 0 18px', font: '400 15px/23px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
              {session.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="btn-play"
              style={{ width: 56, height: 56 }}
              onClick={() => navigate(`/sessions/${session.id}`)}
              aria-label={`Start today's session, ${session.title}`}
            >
              <svg width="17" height="20" viewBox="0 0 17 20" aria-hidden="true">
                <polygon points="2,1 16,10 2,19" fill="var(--on-control)" />
              </svg>
            </button>
            <div style={{ font: '500 15px/20px var(--font-ui)', color: 'var(--ink)' }}>Start today&rsquo;s session</div>
          </div>
        </div>
      </div>

      {week && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '26px 0 10px' }}>
            <div className="t-section">This week</div>
            <div style={{ font: '400 13px/18px var(--font-ui)', color: 'var(--ink-faint)' }}>
              {week.doneInWeek} of {week.days.length} done
            </div>
          </div>
          <DayDots
            days={week.days}
            startIdx={week.start}
            doneCount={doneCount}
            onPick={d => navigate(`/sessions/${d.session_id}`)}
          />
        </>
      )}

      {seeAll}
      <div style={{ height: 26 }} />
    </>
  )
}
