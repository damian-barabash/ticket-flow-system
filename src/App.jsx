import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Projects from './pages/Projects'
import { CookieConsent } from './components/CookieConsent'
import { DesktopNotify } from './components/DesktopNotify'
import { Splash } from './components/Splash'
import { BillingGate } from './components/BillingGate'
import { ToastProvider, ConfirmProvider, ErrorBoundary } from './components/ui'
import { loadProjectDetail } from './lib/prefetch'

// Heavy / rarely-used routes are split into their own chunks.
const Landing = lazy(() => import('./pages/Landing'))
const Register = lazy(() => import('./pages/Register'))
const ProjectDetail = lazy(loadProjectDetail)
const WorkspaceDetail = lazy(() => import('./pages/WorkspaceDetail'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const Inquiries = lazy(() => import('./pages/Inquiries'))
const Account = lazy(() => import('./pages/Account'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Calendar = lazy(() => import('./pages/Calendar'))

function LoginRoute() {
  const { session, loading, profileLoading } = useAuth()
  // wait for the profile too — otherwise the panel renders with role=null
  if (loading || profileLoading) return <Splash />
  return session ? <Navigate to="/projects" replace /> : <Login />
}

// Per-route boundary: a crash in one page never blanks the whole app, and
// navigating away resets it.
function RouteBoundary({ children }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<Splash />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

const panel = (el, opts = {}) => (
  <RouteBoundary>
    <ProtectedRoute {...opts}>{el}</ProtectedRoute>
  </RouteBoundary>
)

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LangProvider>
          <ToastProvider>
            <ConfirmProvider>
              <HashRouter>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <RouteBoundary>
                        <Landing />
                      </RouteBoundary>
                    }
                  />
                  <Route
                    path="/register"
                    element={
                      <RouteBoundary>
                        <Register />
                      </RouteBoundary>
                    }
                  />
                  <Route path="/login" element={<LoginRoute />} />
                  {/* Public on purpose: the desktop apps open it straight from the pay
                      button, and a lapsed account must be able to pay without signing in. */}
                  <Route
                    path="/checkout"
                    element={
                      <RouteBoundary>
                        <Checkout />
                      </RouteBoundary>
                    }
                  />
                  <Route path="/account" element={panel(<Account />)} />
                  <Route path="/projects" element={panel(<Projects />)} />
                  <Route path="/projects/:id" element={panel(<ProjectDetail />)} />
                  <Route path="/workspaces/:id" element={panel(<WorkspaceDetail />)} />
                  <Route path="/calendar" element={panel(<Calendar />)} />
                  <Route path="/admin/users" element={panel(<AdminUsers />, { staffOnly: true })} />
                  <Route path="/admin/inquiries" element={panel(<Inquiries />, { moderatorOnly: true })} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <BillingGate />
                <DesktopNotify />
                <CookieConsent />
              </HashRouter>
            </ConfirmProvider>
          </ToastProvider>
        </LangProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
