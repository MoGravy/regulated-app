import { useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'
import { PROGRAM_MAP, programUnlocked, programAt, programWeeks } from '../config/program'
import DayDots from '../components/DayDots'

// Design board "PROGRAM WEEKS". The current week is the only card with a border
// shift and lift; the next week is flat; later weeks sink and carry a padlock.
//
// ponytail: no network on this screen. Week titles and blurbs are editorial
// copy that ships with the build, and day completion comes from the sessions
// already marked complete locally, so there is nothing to fetch.
export default function Program() {
  const navigate = useNavigate()
  const { programDay } = useApp()

  const { doneCount, total } = programAt(programDay)
  const weeks = programWeeks(doneCount)
  const pct = Math.round((doneCount / total) * 100)

  if (!programUnlocked()) return <ComingSoon onBack={() => navigate('/')} />

  return (
    <div className="page">
      <div className="status-bar"><Back onClick={() => navigate('/')} /><a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a></div>

      <div className="page-content" style={{ paddingTop: 8 }}>
        <h1 style={{ margin: '0 0 6px', font: '300 30px/36px var(--font-display)' }}>
          {PROGRAM_MAP.program.title}
        </h1>
        <p style={{ margin: '0 0 20px', font: '400 14px/21px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
          {PROGRAM_MAP.program.subtitle}
        </p>

        <div
          className="track track-lg track-program"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Program progress"
          style={{ marginBottom: 8 }}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <div style={{ font: '400 12px/16px var(--font-ui)', color: 'var(--ink-faint)', marginBottom: 22 }}>
          {doneCount} of {total} sessions complete
        </div>

        {weeks.map(w => (
          <WeekCard key={w.week} week={w} doneCount={doneCount} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}

function WeekCard({ week, doneCount, navigate }) {
  const heading = `Week ${week.week} · ${week.title}`

  if (week.status === 'current') {
    return (
      <div className="card card-current" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, font: '400 21px/28px var(--font-display)' }}>{heading}</h2>
          <span style={{ font: '400 12px/16px var(--font-ui)', color: 'var(--ink-muted)', flex: 'none' }}>In progress</span>
        </div>
        <p style={{ margin: '8px 0 16px', font: '400 14px/21px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
          {week.blurb}
        </p>
        <DayDots
          days={week.days}
          startIdx={week.start}
          doneCount={doneCount}
          onPick={d => navigate(`/sessions/${d.session_id}`)}
        />
      </div>
    )
  }

  if (week.status === 'complete') {
    return (
      <div className="card-flat" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, font: '400 19px/26px var(--font-display)' }}>{heading}</h2>
          <span style={{ font: '400 12px/16px var(--font-ui)', color: 'var(--ink-faint)', flex: 'none' }}>Complete</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <DayDots
            days={week.days}
            startIdx={week.start}
            doneCount={doneCount}
            onPick={d => navigate(`/sessions/${d.session_id}`)}
          />
        </div>
      </div>
    )
  }

  if (week.status === 'next') {
    return (
      <div className="card-flat" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, font: '400 19px/26px var(--font-display)' }}>{heading}</h2>
          <span style={{ font: '400 12px/16px var(--font-ui)', color: 'var(--ink-faint)', flex: 'none' }}>Up next</span>
        </div>
        <div style={{ marginTop: 6, font: '400 13px/19px var(--font-ui)', color: 'var(--ink-muted)' }}>
          {week.days.length} sessions
        </div>
      </div>
    )
  }

  return (
    <div className="card-locked" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ margin: 0, flex: 1, font: '400 19px/26px var(--font-display)', color: 'var(--ink-muted)' }}>
          {heading}
        </h2>
        <Padlock />
      </div>
    </div>
  )
}

function Padlock() {
  return (
    <svg width="11" height="14" viewBox="0 0 11 14" role="img" aria-label="Locked">
      <rect x="0.5" y="6" width="10" height="7.5" rx="1.5" fill="var(--ink-faint)" />
      <path d="M2.8 6V3.6a2.7 2.7 0 0 1 5.4 0V6" stroke="var(--ink-faint)" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function Back({ onClick }) {
  return (
    <button className="btn-icon" onClick={onClick} aria-label="Back" style={{ marginLeft: -12 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3l-5 5 5 5" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  )
}

// Reachable only by typing the URL while the sequencing is unreviewed. The mode
// switch never routes here in that state.
function ComingSoon({ onBack }) {
  return (
    <div className="page">
      <div className="status-bar"><Back onClick={onBack} /><a href="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</a></div>
      <div className="page-content" style={{ paddingTop: 8 }}>
        <h1 style={{ margin: '0 0 6px', font: '300 30px/36px var(--font-display)' }}>{PROGRAM_MAP.program.title}</h1>
        <p style={{ margin: '0 0 20px', font: '400 16px/25px var(--font-ui)', color: 'var(--ink-muted)', textWrap: 'pretty' }}>
          The six-week program is being finished. Every session in it is already in the library, so you can listen now and start the program when it opens.
        </p>
        <button className="btn-primary btn-lg" onClick={onBack}>Browse the library</button>
      </div>
    </div>
  )
}
