import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'

export function ProtectedRoute({ children, staffOnly = false }) {
  const { session, isStaff, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (staffOnly && !isStaff) return <Navigate to="/projects" replace />
  return children
}
