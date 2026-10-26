import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Wordmark, LogoMark } from './Logo'
import { Avatar, CountBadge, Icon, useEsc } from './ui'
import { LangSwitch } from './LangSwitch'
import { entitlement } from '../lib/billing'
import { useChatUnread } from '../lib/chat'
import { channelName, useDebounced } from '../lib/realtime'
import { loadCalendar, prefetch } from '../lib/prefetch'

const BillingModal = lazy(() => import('./BillingModal').then((m) => ({ default: m.BillingModal })))

// Sticky square top bar for every panel page.
//   crumbs: [{ label, to?, mono? }] — rendered after the root "Projects" crumb
//   back:   explicit back target (path) — defaults to the parent crumb
export function TopBar({ crumbs = [], back }) {
  const { profile, profileError, reloadProfile, role, isStaff, isModerator, isAdmin, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const ent = isAdmin ? entitlement(profile) : null
  const [showBilling, setShowBilling] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [newInquiries, setNewInquiries] = useState(0)
  const { counts: chatCounts, total: chatTotal } = useChatUnread()

  const roleLabel = t(role === 'moderator' ? 'topbar.moderator' : role === 'admin' ? 'topbar.admin' : 'topbar.client')

  // Moderators: live count of unhandled Enterprise inquiries for the nav badge.
  const loadInq = useDebounced(async () => {
    const { count, error } = await supabase
      .from('enterprise_inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
    if (!error) setNewInquiries(count ?? 0)
  }, 250)
  useEffect(() => {
    if (!isModerator) return
    loadInq()
    const ch = supabase
      .channel(channelName('topbar_inquiries'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enterprise_inquiries' }, () => loadInq())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [isModerator, loadInq])

  // close menus on navigation
  useEffect(() => {
    setMenuOpen(false)
    setChatOpen(false)
  }, [pathname])
  useEsc(() => setMenuOpen(false), menuOpen)

  const onRoot = pathname === '/projects'
  const parent = [...crumbs].reverse().find((c, i) => i > 0 && c.to) // crumb before the current one
  const backTo = back ?? parent?.to ?? '/projects'

  const go = (to) => {
    setMenuOpen(false)
    navigate(to)
  }
  const doSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  const pageCrumbs = crumbs.length ? crumbs : pathname === '/calendar' ? [{ label: t('panel.calendar') }] : []
  const allCrumbs = [{ label: t('projects.heading'), to: '/projects' }, ...pageCrumbs]
  const current = allCrumbs[allCrumbs.length - 1]

  const navItems = [
    { key: 'calendar', icon: 'calendar', label: t('panel.calendar'), to: '/calendar', onHover: () => prefetch(loadCalendar) },
    isStaff && { key: 'users', icon: 'users', label: t('topbar.users'), to: '/admin/users', tour: 'users' },
    isModerator && { key: 'inq', icon: 'inbox', label: t('topbar.inquiries'), to: '/admin/inquiries', badge: newInquiries },
  ].filter(Boolean)

  return (
    <>
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
          {/* back */}
          {!onRoot && (
            <button
              onClick={() => navigate(backTo)}
              className="icon-btn press"
              aria-label={t('common.back')}
              title={t('common.back')}
            >
              <Icon name="arrowLeft" size={18} />
            </button>
          )}

          {/* brand */}
          <Link to="/projects" className="shrink-0 transition-opacity hover:opacity-80" aria-label="Ticket Flow">
            <span className="hidden md:block">
              <Wordmark />
            </span>
            <span className="md:hidden">
              <LogoMark size={26} />
            </span>
          </Link>

          {/* breadcrumbs (desktop) / current title (mobile) */}
          <nav className="ml-1 hidden min-w-0 flex-1 items-center gap-2 lg:flex" aria-label="breadcrumbs">
            <span className="h-5 w-px bg-line2" />
            {allCrumbs.map((c, i) => {
              const last = i === allCrumbs.length - 1
              return (
                <span key={i} className="flex min-w-0 items-center gap-2">
                  {i > 0 && <span className="text-faint">/</span>}
                  {c.to && !last ? (
                    <Link
                      to={c.to}
                      className={`truncate text-[14px] font-medium text-muted transition-colors hover:text-ink ${c.mono ? 'num' : ''}`}
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span className={`truncate text-[14px] font-semibold text-ink ${c.mono ? 'num' : ''}`}>{c.label}</span>
                  )}
                </span>
              )
            })}
          </nav>
          <div className="min-w-0 flex-1 lg:hidden">
            {!onRoot && (
              <span className={`block truncate text-[15px] font-semibold text-ink ${current.mono ? 'num' : ''}`}>
                {current.label}
              </span>
            )}
          </div>

          {/* desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((it) => (
              <button
                key={it.key}
                onClick={() => go(it.to)}
                onMouseEnter={it.onHover}
                data-tour={it.tour}
                title={it.label}
                className={`press relative flex h-10 items-center gap-2 px-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors hover:bg-surface2 hover:text-ink ${
                  pathname.startsWith(it.to) ? 'text-ink' : 'text-muted'
                }`}
              >
                <Icon name={it.icon} size={18} />
                <span className="hidden xl:inline">{it.label}</span>
                {it.badge > 0 && <CountBadge n={it.badge} className="absolute -right-0.5 top-0.5 xl:static" />}
              </button>
            ))}
          </div>

          {/* chat total (all sizes) */}
          <ChatMenu
            open={chatOpen}
            setOpen={setChatOpen}
            counts={chatCounts}
            total={chatTotal}
            onPick={(pid) => go(`/projects/${pid}?chat=1`)}
          />

          <div className="hidden items-center gap-2 md:flex">
            <LangSwitch />
            <button
              onClick={() => go('/account')}
              className={`press flex h-10 items-center gap-2 border px-1.5 pr-2.5 transition-colors hover:border-line2 ${
                pathname === '/account' ? 'border-ink' : 'border-line'
              }`}
              title={t('topbar.account')}
            >
              <Avatar name={profile?.full_name} email={profile?.email} size={26} />
              <span className="hidden max-w-[140px] truncate text-[13px] font-medium text-ink xl:inline">
                {profile?.full_name || profile?.email}
              </span>
            </button>
            <button onClick={doSignOut} className="icon-btn press" title={t('topbar.signout')} aria-label={t('topbar.signout')}>
              <Icon name="logout" size={18} />
            </button>
          </div>

          {/* mobile burger ↔ close */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? t('common.close') : t('topbar.menu')}
            aria-expanded={menuOpen}
            data-tour="users"
            className="icon-btn press md:hidden"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>

        {/* Free-trial strip (admin only, during the trial) */}
        {ent?.state === 'trial' && (
          <div className="border-t border-accent/30 bg-accentSoft">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center">
              <span className="text-[13px] font-medium text-ink">
                {t(ent.daysLeft === 1 ? 'billing.trialLeftOne' : 'billing.trialLeft', { n: ent.daysLeft })}
              </span>
              <button onClick={() => setShowBilling(true)} className="btn-link text-[13px]">
                {t('billing.trialCta')}
                <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* profile refresh failed but we still have the old one */}
        {profileError && profile && (
          <div className="border-t border-warn/30 bg-warn/10">
            <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-3 px-4 py-1.5 text-[13px] text-ink">
              <Icon name="alert" size={15} className="text-warn" />
              {t('errors.profileStale')}
              <button onClick={reloadProfile} className="btn-link text-[13px]">
                {t('common.retry')}
              </button>
            </div>
          </div>
        )}

        {/* mobile menu */}
        {menuOpen && (
          <>
            <div className="scrim-in fixed inset-0 top-16 z-30 bg-black/60 md:hidden" onClick={() => setMenuOpen(false)} />
            <div className="pop absolute inset-x-0 top-16 z-40 max-h-[calc(100dvh-64px)] overflow-y-auto border-b border-line bg-bg md:hidden">
              <div className="flex items-center gap-3 border-b border-line px-4 py-4">
                <Avatar name={profile?.full_name} email={profile?.email} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">{profile?.full_name || profile?.email}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="inline-block h-2 w-2 bg-ok" />
                    <span className="label">{roleLabel}</span>
                  </div>
                </div>
                <LangSwitch />
              </div>
              <nav className="flex flex-col py-1">
                <MenuRow icon="grid" label={t('projects.heading')} onClick={() => go('/projects')} active={onRoot} />
                {navItems.map((it) => (
                  <MenuRow
                    key={it.key}
                    icon={it.icon}
                    label={it.label}
                    badge={it.badge}
                    active={pathname.startsWith(it.to)}
                    onClick={() => go(it.to)}
                  />
                ))}
                <MenuRow icon="user" label={t('topbar.account')} onClick={() => go('/account')} active={pathname === '/account'} />
                {isAdmin && <MenuRow icon="card" label={t('billing.manage')} onClick={() => { setMenuOpen(false); setShowBilling(true) }} />}
                <div className="my-1 border-t border-line" />
                <MenuRow icon="logout" label={t('topbar.signout')} onClick={doSignOut} danger />
              </nav>
            </div>
          </>
        )}
      </header>
      <Suspense fallback={null}>{showBilling && <BillingModal open onClose={() => setShowBilling(false)} />}</Suspense>
    </>
  )
}

function MenuRow({ icon, label, onClick, badge, active, danger, tour }) {
  return (
    <button
      onClick={onClick}
      data-tour={tour}
      className={`press flex min-h-[52px] items-center gap-4 px-4 text-left text-[16px] font-medium transition-colors hover:bg-surface2 ${
        danger ? 'text-accent' : active ? 'text-ink' : 'text-muted'
      }`}
    >
      <span className={`h-5 w-[3px] ${active ? 'bg-accent' : 'bg-transparent'}`} />
      <Icon name={icon} size={20} />
      <span className="flex-1">{label}</span>
      <CountBadge n={badge} />
    </button>
  )
}

// Chat icon with the total unread badge → dropdown of projects with unread chat.
function ChatMenu({ open, setOpen, counts, total, onPick }) {
  const { t } = useT()
  const [names, setNames] = useState({})
  const ref = useRef(null)
  const ids = Object.keys(counts || {}).filter((k) => counts[k] > 0)

  useEffect(() => {
    if (!open || !ids.length) return
    const missing = ids.filter((id) => !names[id])
    if (!missing.length) return
    supabase
      .from('projects')
      .select('id, name')
      .in('id', missing)
      .then(({ data }) => {
        if (data) setNames((n) => ({ ...n, ...Object.fromEntries(data.map((p) => [p.id, p.name])) }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids.join(',')])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, setOpen])
  useEsc(() => setOpen(false), open)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`icon-btn press relative ${open ? 'border-ink text-ink' : ''}`}
        aria-label={t('panel.chat')}
        title={t('panel.chat')}
        aria-expanded={open}
      >
        <Icon name="chat" size={18} />
        {total > 0 && <CountBadge n={total} className="absolute -right-1.5 -top-1.5" />}
      </button>
      {open && (
        <div className="pop absolute right-0 top-12 z-50 w-[300px] max-w-[calc(100vw-24px)] border border-line2 bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="label">{t('panel.chatUnread')}</span>
            <button onClick={() => setOpen(false)} className="icon-btn-sm" aria-label={t('common.close')}>
              <Icon name="close" size={15} />
            </button>
          </div>
          {ids.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-muted">{t('panel.chatNoUnread')}</p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto py-1">
              {ids.map((id) => (
                <li key={id}>
                  <button
                    onClick={() => onPick(id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface2"
                  >
                    <Icon name="chat" size={16} className="text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{names[id] || '…'}</span>
                    <CountBadge n={counts[id]} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
