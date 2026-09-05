import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider } from './hooks/useApp'
import Navigation from './components/Navigation'
import Toast from './components/Toast'
import Home from './pages/Home'
import Sessions from './pages/Sessions'
import SessionDetail from './pages/SessionDetail'
import SessionPlayer from './pages/SessionPlayer'
import CustomAudio from './pages/CustomAudio'
import Premium from './pages/Premium'
import Success from './pages/Success'
import Onboarding from './pages/Onboarding'
import Program from './pages/Program'
import SignIn from './pages/SignIn'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  )
}

function AppShell() {
  // Keyed on the path so every screen change fades in (index.css .screen).
  const { pathname } = useLocation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100dvh' }}>
      <Toast />
      <div className="screen" key={pathname}>
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/" element={<><Home /><Navigation /></>} />
        <Route path="/program" element={<><Program /><Navigation /></>} />
        <Route path="/sessions" element={<><Sessions /><Navigation /></>} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/sessions/:id/play" element={<SessionPlayer />} />
        <Route path="/custom" element={<CustomAudio />} />
        <Route path="/premium" element={<><Premium /><Navigation /></>} />
        <Route path="/success" element={<Success />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </div>
  )
}
