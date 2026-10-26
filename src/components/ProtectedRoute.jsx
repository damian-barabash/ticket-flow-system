import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTOptional } from '../context/LangContext'
import { Splash } from './Splash'
import { ErrorState } from './ui'

export function ProtectedRoute({ children, staffOnly = false, moderatorOnly = false }) {
  const { session, profile, profileError, isStaff, isModerator, loading, reloadProfile, signOut } = useAuth()
  const { t } = useTOptional()

  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  // Never render the panel before the role is known (staff would see client UI).
  if (!profile) {
    if (!profileError) return <Splash />
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <ErrorState message={t('errors.profile')} onRetry={reloadProfile} onClose={signOut} closeLabel={t('topbar.signout')} />
      </div>
    )
  }
  if (moderatorOnly && !isModerator) return <Navigate to="/projects" replace />
  if (staffOnly && !isStaff) return <Navigate to="/projects" replace />
  return children
}
