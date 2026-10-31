import { Link, useLocation, useNavigate } from 'react-router-dom'
import { courseCopy } from '../config/courseCopy'
import { careCopy } from '../config/careCopy'

// The You screen carries Custom audio, so it stays one tap away.
const TABS = [
  { path: '/', label: 'Today' },
  { path: '/sessions', label: 'Browse' },
  { path: '/courses', label: courseCopy.nav },
  { path: '/care', label: careCopy.nav },
  { path: '/premium', label: 'You' },
]

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
    {location.pathname === '/premium' && (
      <div style={{ flex: 'none', width: '100%', maxWidth: 'var(--content-width,480px)', margin: '0 auto', padding: '12px 24px', background: 'var(--surface)' }}>
        <Link to="/about" aria-label="About Matthew" className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 18px', border: '1px solid var(--control)', background: 'var(--control)', color: 'var(--on-control)', textDecoration: 'none' }}>
          <span>
            <span style={{ display: 'block', font: '500 22px/28px var(--font-ui)' }}>About Matthew</span>
            <span style={{ display: 'block', marginTop: 4, font: '400 15px/21px var(--font-ui)', color: 'inherit' }}>One-to-one programmes</span>
          </span>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
            <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    )}
    <nav
      aria-label="Primary"
      style={{
        position: 'relative',
        flex: 'none',
        width: '100%',
        margin: '0 auto',
        maxWidth: 'var(--content-width, 480px)',
        display: 'flex',
        flexWrap: 'wrap',
        rowGap: 8,
        alignItems: 'stretch',
        minHeight: 'calc(var(--nav-height) + var(--safe-bottom))',
        paddingTop: 8,
        paddingBottom: 'calc(12px + var(--safe-bottom))',
        borderTop: '1px solid var(--line)',
        background: 'var(--surface)',
        zIndex: 100,
      }}
    >
      {TABS.map(tab => {
        const active = location.pathname === tab.path
          || (tab.path === '/courses' && location.pathname.startsWith('/courses/'))
          || (tab.path === '/premium' && location.pathname === '/about')
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: '1 1 20%',
              minWidth: 'min-content',
              minHeight: 44,
              padding: '2px 4px',
              whiteSpace: 'normal',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--ink)' : 'var(--ink-muted)',
              font: `${active ? 500 : 400} 13px/18px var(--font-ui)`,
              transition: 'color var(--t-enter)',
            }}
          >
            <span style={{ maxWidth: '100%' }}>{tab.label}</span>
            {active && (
              <span style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 'var(--r-pill)' }} />
            )}
          </button>
        )
      })}
    </nav>
    </>
  )
}
