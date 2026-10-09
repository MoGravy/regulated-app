import { useLocation, useNavigate } from 'react-router-dom'
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
    <nav
      aria-label="Primary"
      style={{
        position: 'relative',
        flex: 'none',
        width: '100%',
        margin: '0 auto',
        maxWidth: 'var(--content-width, 480px)',
        display: 'flex',
        alignItems: 'stretch',
        height: 'calc(var(--nav-height) + var(--safe-bottom))',
        paddingBottom: 'calc(12px + var(--safe-bottom))',
        borderTop: '1px solid var(--line)',
        background: 'var(--surface)',
        zIndex: 100,
      }}
    >
      {TABS.map(tab => {
        const active = location.pathname === tab.path
          || (tab.path === '/courses' && location.pathname.startsWith('/courses/'))
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
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
            <span>{tab.label}</span>
            {active && (
              <span style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 'var(--r-pill)' }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
