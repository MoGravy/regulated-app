import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../hooks/useApp'

const navItems = [
  {
    path: '/',
    label: 'Home',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    path: '/sessions',
    label: 'Sessions',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="10 8 16 12 10 16 10 8" fill={active ? 'var(--bg-deep)' : 'currentColor'}/>
      </svg>
    ),
  },
  {
    path: '/custom',
    label: 'Custom',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" fill={active ? 'currentColor' : 'none'}/>
      </svg>
    ),
  },
  {
    path: '/premium',
    label: 'Premium',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
]

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isPremium } = useApp()

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(13, 35, 48, 0.95)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      height: 'calc(var(--nav-height) + var(--safe-bottom))',
      paddingBottom: 'var(--safe-bottom)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-around',
      padding: '8px 0 calc(8px + var(--safe-bottom))',
    }}>
      {navItems.map(item => {
        const active = location.pathname === item.path
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '6px 20px',
              background: 'none',
              border: 'none',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'color 0.2s ease',
              position: 'relative',
              minWidth: 60,
            }}
          >
            {item.path === '/premium' && !isPremium && (
              <span style={{
                position: 'absolute',
                top: 4,
                right: 14,
                width: 8,
                height: 8,
                background: 'var(--accent)',
                borderRadius: '50%',
                border: '1.5px solid var(--bg-deep)',
              }} />
            )}
            {item.icon(active)}
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.04em' }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
