import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Register from './pages/Register'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import AdminUsers from './pages/AdminUsers'
import Inquiries from './pages/Inquiries'
import { Spinner } from './components/ui'

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
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
        </HashRouter>
      </LangProvider>
    </AuthProvider>
  )
}
