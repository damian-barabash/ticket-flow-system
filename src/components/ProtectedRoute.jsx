import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Splash } from './Splash'

export function ProtectedRoute({ children, staffOnly = false, moderatorOnly = false }) {
  const { session, isStaff, isModerator, loading } = useAuth()

  if (loading) {
    return <Splash />
  }
  if (!session) return <Navigate to="/login" replace />
  if (moderatorOnly && !isModerator) return <Navigate to="/projects" replace />
  if (staffOnly && !isStaff) return <Navigate to="/projects" replace />
  return children
}
