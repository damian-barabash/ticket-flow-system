import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import AdminUsers from './pages/AdminUsers'
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
              <ProtectedRoute adminOnly>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </HashRouter>
      </LangProvider>
    </AuthProvider>
  )
}
