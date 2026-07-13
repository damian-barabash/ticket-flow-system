import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Register from './pages/Register'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import WorkspaceDetail from './pages/WorkspaceDetail'
import AdminUsers from './pages/AdminUsers'
import Inquiries from './pages/Inquiries'
import Account from './pages/Account'
import Checkout from './pages/Checkout'
import { CookieConsent } from './components/CookieConsent'
import { DesktopNotify } from './components/DesktopNotify'
import { Splash } from './components/Splash'
import { BillingGate } from './components/BillingGate'
import { Spinner } from './components/ui'

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  return session ? <Navigate to="/projects" replace /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <LangProvider>
        <HashRouter>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<LoginRoute />} />
          {/* Public on purpose: the desktop apps open it straight from the pay
              button, and a lapsed account must be able to pay without signing in. */}
          <Route path="/checkout" element={<Checkout />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workspaces/:id"
            element={
              <ProtectedRoute>
                <WorkspaceDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute staffOnly>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/inquiries"
            element={
              <ProtectedRoute moderatorOnly>
                <Inquiries />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BillingGate />
          <DesktopNotify />
          <CookieConsent />
        </HashRouter>
      </LangProvider>
    </AuthProvider>
  )
}
