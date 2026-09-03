import { useLocation, useNavigate } from 'react-router-dom'

// Three tabs, label-only with a 16x2 underline on the active one — design 1b/1d.
// "You" is the premium/account screen, which carries the Custom audio card, so
// /custom stays one tap away without a fourth tab the design does not have.
const TABS = [
  { path: '/', label: 'Today' },
  { path: '/sessions', label: 'Browse' },
  { path: '/premium', label: 'You' },
]

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        margin: '0 auto',
        maxWidth: 480,
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
