import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Wordmark } from './Logo'
import { Avatar } from './ui'
import { LangSwitch } from './LangSwitch'

export function TopBar() {
  const { profile, isAdmin, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4">
        <button onClick={() => navigate('/projects')} className="transition-opacity hover:opacity-80">
          <Wordmark />
        </button>

        <div className="flex items-center gap-5">
          <span className="hidden items-center gap-2 sm:flex">
            <span className="inline-block h-1.5 w-1.5 bg-ok" />
            <span className="label">{isAdmin ? t('topbar.admin') : t('topbar.client')}</span>
          </span>
          {isAdmin && (
            <button
              onClick={() => navigate('/admin/users')}
              data-tour="users"
              className="label hover:text-ink transition-colors"
            >
              {t('topbar.users')}
            </button>
          )}
          <LangSwitch />
          <div className="flex items-center gap-2.5">
            <Avatar name={profile?.full_name} email={profile?.email} />
            <span className="hidden text-xs text-muted md:inline">{profile?.email}</span>
          </div>
          <button onClick={signOut} className="label hover:text-accent transition-colors">
            {t('topbar.signout')}
          </button>
        </div>
      </div>
    </header>
  )
}
