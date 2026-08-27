import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider } from './hooks/useApp'
import { trackPageView } from './lib/ga'
import Navigation from './components/Navigation'
import Toast from './components/Toast'
import Home from './pages/Home'
import Sessions from './pages/Sessions'
import SessionPlayer from './pages/SessionPlayer'
import CustomAudio from './pages/CustomAudio'
import Premium from './pages/Premium'
import Success from './pages/Success'
import Onboarding from './pages/Onboarding'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <RouteTracker />
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  )
}

function RouteTracker() {
  const location = useLocation()
  useEffect(() => {
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])
  return null
}

function AppShell() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100dvh' }}>
      <Toast />
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/" element={<><Home /><Navigation /></>} />
        <Route path="/sessions" element={<><Sessions /><Navigation /></>} />
        <Route path="/sessions/:id" element={<SessionPlayer />} />
        <Route path="/custom" element={<><CustomAudio /><Navigation /></>} />
        <Route path="/premium" element={<><Premium /><Navigation /></>} />
        <Route path="/success" element={<Success />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
