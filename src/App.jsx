import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './hooks/useApp'
import { emailConfirmation, signInDestination } from './lib/signInFlow'
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
import Courses, { Course } from './pages/Courses'
import Care from './pages/Care'
import CareNotificationRouter from './components/CareNotificationRouter'
import DapPurchase from './pages/DapPurchase'
import SignIn from './pages/SignIn'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <CareNotificationRouter />
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  )
}

function AppShell() {
  // Keyed on the path so every screen change fades in (index.css .screen).
  const { pathname, hash } = useLocation()
  const { authReady, authUser, authError } = useApp()
  if (pathname !== '/signin' && emailConfirmation(hash)) {
    return <Navigate to={`/signin?next=${encodeURIComponent(signInDestination(pathname))}${hash}`} replace />
  }
  if (authReady && !authUser && authError && pathname !== '/signin') {
    return <Navigate to={`/signin?next=${encodeURIComponent(signInDestination(pathname))}`} replace />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100dvh' }}>
      <Toast />
      <div className="screen" key={pathname}>
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/" element={<><Home /><Navigation /></>} />
        <Route path="/program" element={<><Program /><Navigation /></>} />
        <Route path="/courses" element={<><Courses /><Navigation /></>} />
        <Route path="/courses/:courseId" element={<><Course /><Navigation /></>} />
        <Route path="/dap" element={<DapPurchase />} />
        <Route path="/care" element={<><Care /><Navigation /></>} />
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
