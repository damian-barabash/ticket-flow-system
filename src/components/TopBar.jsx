import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Wordmark } from './Logo'
import { Avatar } from './ui'
import { LangSwitch } from './LangSwitch'

export function TopBar() {
  const { profile, role, isStaff, isModerator, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newInquiries, setNewInquiries] = useState(0)

  const roleLabel = t(
    role === 'moderator' ? 'topbar.moderator' : role === 'admin' ? 'topbar.admin' : 'topbar.client'
  )

  // Moderators: live count of unhandled Enterprise inquiries for the nav badge.
  useEffect(() => {
    if (!isModerator) return
    let active = true
    const loadCount = async () => {
      const { count } = await supabase
        .from('enterprise_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
      if (active) setNewInquiries(count ?? 0)
    }
    loadCount()
    const ch = supabase
      .channel('topbar_inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enterprise_inquiries' }, loadCount)
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(ch)
    }
  }, [isModerator])

  // Close the mobile menu on Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4">
        <button onClick={() => navigate('/projects')} className="transition-opacity hover:opacity-80">
          <Wordmark />
        </button>

        <div className="flex items-center gap-3 sm:gap-5">
          {/* Desktop: full inline layout */}
          <span className="hidden items-center gap-2 sm:flex">
            <span className="inline-block h-1.5 w-1.5 bg-ok" />
            <span className="label">{roleLabel}</span>
          </span>
          {isModerator && (
            <button
              onClick={() => navigate('/admin/inquiries')}
              className="label relative hidden hover:text-ink transition-colors sm:block"
            >
              {t('topbar.inquiries')}
              {newInquiries > 0 && (
                <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center bg-accent px-1 font-mono text-[9px] leading-none text-bg">
                  {newInquiries}
                </span>
              )}
            </button>
          )}
          {isStaff && (
            <button
              onClick={() => navigate('/admin/users')}
              data-tour="users"
              className="label hidden hover:text-ink transition-colors sm:block"
            >
              {t('topbar.users')}
            </button>
          )}

          {/* Language switch — always visible (kept out of the burger by design) */}
          <LangSwitch />

          <div className="hidden items-center gap-2.5 sm:flex">
            <Avatar name={profile?.full_name} email={profile?.email} />
            <span className="hidden text-xs text-muted md:inline">{profile?.email}</span>
          </div>
          <button
            onClick={signOut}
            className="label hidden hover:text-accent transition-colors sm:block"
          >
            {t('topbar.signout')}
          </button>

          {/* Mobile: burger button */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t('topbar.menu')}
            aria-expanded={menuOpen}
            data-tour="users"
            className="flex h-9 w-9 items-center justify-center border border-line text-muted hover:text-ink transition-colors sm:hidden"
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/40 sm:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative z-30 border-t border-line bg-bg/95 backdrop-blur sm:hidden">
            <div className="flex flex-col gap-1 px-6 py-4">
              {/* Identity row */}
              <div className="flex items-center gap-3 border-b border-line pb-4">
                <Avatar name={profile?.full_name} email={profile?.email} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">
                    {profile?.full_name || profile?.email}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 bg-ok" />
                    <span className="label">{roleLabel}</span>
                  </div>
                </div>
              </div>

              {isModerator && (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/admin/inquiries')
                  }}
                  className="label flex items-center gap-2 py-3 text-left hover:text-ink transition-colors"
                >
                  {t('topbar.inquiries')}
                  {newInquiries > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center bg-accent px-1 font-mono text-[9px] leading-none text-bg">
                      {newInquiries}
                    </span>
                  )}
                </button>
              )}
              {isStaff && (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/admin/users')
                  }}
                  className="label py-3 text-left hover:text-ink transition-colors"
                >
                  {t('topbar.users')}
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  signOut()
                }}
                className="label py-3 text-left hover:text-accent transition-colors"
              >
                {t('topbar.signout')}
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
