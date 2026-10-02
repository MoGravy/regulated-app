import { Capacitor } from '@capacitor/core'
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
import AccountDeletion from './pages/AccountDeletion'

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
  const showNavigation = ['/', '/program', '/courses', '/care', '/sessions', '/premium'].includes(pathname)
    || pathname.startsWith('/courses/')
  const isPlayer = pathname.startsWith('/sessions/') && pathname.endsWith('/play')
  return (
    <div className={`app-shell${showNavigation ? ' app-shell-with-nav' : ''}${isPlayer ? ' app-shell-player' : ''}`}>
      <Toast />
      <div className="screen" key={pathname}>
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/delete-account" element={<AccountDeletion />} />
        <Route path="/" element={<Home />} />
        <Route path="/program" element={<Program />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:courseId" element={<Course />} />
        <Route path="/dap" element={Capacitor.isNativePlatform() ? <Navigate to="/premium" replace /> : <DapPurchase />} />
        <Route path="/care" element={<Care />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/sessions/:id/play" element={<SessionPlayer />} />
        <Route path="/custom" element={Capacitor.isNativePlatform() ? <Navigate to="/premium" replace /> : <CustomAudio />} />
        <Route path="/premium" element={<Premium />} />
        <Route path="/success" element={Capacitor.isNativePlatform() ? <Navigate to="/premium" replace /> : <Success />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
      {showNavigation && <Navigation />}
    </div>
  )
}
