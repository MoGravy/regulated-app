import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100dvh' }}>
      <Toast />
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/" element={<><Home /><Navigation /></>} />
        <Route path="/sessions" element={<><Sessions /><Navigation /></>} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/sessions/:id/play" element={<SessionPlayer />} />
        <Route path="/custom" element={<><CustomAudio /><Navigation /></>} />
        <Route path="/premium" element={<><Premium /><Navigation /></>} />
        <Route path="/success" element={<Success />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
