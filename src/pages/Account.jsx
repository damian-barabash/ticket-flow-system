import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { entitlement } from '../lib/billing'
import { formatDay } from '../lib/format'
import { TopBar } from '../components/TopBar'
import { LangSwitch } from '../components/LangSwitch'
import { NotificationSettings } from '../components/NotificationSettings'
import { Avatar, FormError, Icon, Spinner, useConfirm } from '../components/ui'
import { PageHeader } from './Projects'

const BillingModal = lazy(() => import('../components/BillingModal').then((m) => ({ default: m.BillingModal })))

function Section({ title, icon, children, tone }) {
  return (
    <section className={`border p-5 sm:p-6 ${tone === 'danger' ? 'border-accent/45 bg-accent/[0.04]' : 'border-line bg-surface'}`}>
      <h2 className={`mb-4 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] ${tone === 'danger' ? 'text-accent' : 'text-muted'}`}>
        {icon && <Icon name={icon} size={16} />} {title}
      </h2>
      {children}
    </section>
  )
}

// Account: identity, language, notifications, subscription, account deletion.
// Deleting is required by App Store guideline 5.1.1(v) — reachable in-app.
export default function Account() {
  const { profile, role, isAdmin, isModerator, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [showBilling, setShowBilling] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ent = entitlement(profile)
  const roleLabel = t(role === 'moderator' ? 'topbar.moderator' : role === 'admin' ? 'topbar.admin' : 'topbar.client')
  const statusLabel =
    ent.state === 'active' ? t('billing.statusActive') : ent.state === 'trial' ? t('billing.statusTrial') : t('billing.statusInactive')
  const emailMatches = typed.trim().toLowerCase() === String(profile?.email ?? '').trim().toLowerCase()

  async function remove() {
    if (!emailMatches || busy) return
    const ok = await confirm({ title: t('account.deleteTitle'), body: t('account.deleteConfirm'), danger: true, confirmLabel: t('account.deleteCta') })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('delete-account', { body: { confirm_email: profile.email } })
      const detail = data?.error ?? (err ? await err.context?.json?.().then((b) => b?.error).catch(() => null) : null)
      if (err || detail) throw new Error(detail || err.message)
      await signOut()
      navigate('/', { replace: true })
    } catch (e) {
      console.warn('[account] delete failed', e)
      setError(String(e.message) === 'moderator_self_delete' ? t('account.deleteModerator') : t('account.deleteError'))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <TopBar crumbs={[{ label: t('topbar.account') }]} />
      <main className="mx-auto max-w-[820px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <PageHeader tag={t('account.label')} title={t('account.heading')} />

        <div className="space-y-4">
          {/* identity */}
          <Section title={t('panel.profile')} icon="user">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={profile?.full_name} email={profile?.email} size={56} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[22px] font-bold tracking-tight text-ink">{profile?.full_name || profile?.email}</div>
                <div className="mt-0.5 truncate text-[15px] text-muted">{profile?.email}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 bg-ok" />
                  <span className="label">{roleLabel}</span>
                </div>
              </div>
              <button onClick={() => signOut().then(() => navigate('/login', { replace: true }))} className="btn-ghost btn-sm">
                <Icon name="logout" size={16} /> {t('topbar.signout')}
              </button>
            </div>
          </Section>

          {/* language */}
          <Section title={t('topbar.lang')} icon="globe">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15px] text-muted">{t('panel.langHint')}</p>
              <LangSwitch />
            </div>
          </Section>

          {/* notifications */}
          <NotificationSettings />

          {/* subscription (tenant admins only) */}
          {isAdmin && (
            <Section title={t('billing.manage')} icon="card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 ${ent.state === 'active' ? 'bg-ok' : ent.state === 'trial' ? 'bg-warn' : 'bg-accent'}`} />
                    <span className="text-[16px] font-semibold text-ink">{statusLabel}</span>
                  </div>
                  <p className="mt-1 text-[14px] text-muted">
                    {ent.state === 'active'
                      ? profile?.subscription_ends_at
                        ? t('billing.activeUntil', { date: formatDay(profile.subscription_ends_at) })
                        : ''
                      : ent.state === 'trial'
                      ? t('billing.trialUntil', { n: ent.daysLeft })
                      : ''}
                  </p>
                </div>
                <button onClick={() => setShowBilling(true)} className={ent.state === 'active' ? 'btn-ghost' : 'btn-accent'}>
                  <Icon name="card" size={16} /> {t('billing.modalTitle')}
                </button>
              </div>
            </Section>
          )}

          {/* danger zone */}
          <Section title={t('account.dangerLabel')} icon="alert" tone="danger">
            <h3 className="font-display text-[22px] font-bold uppercase tracking-tight text-ink">{t('account.deleteTitle')}</h3>
            <p className="mt-2 text-[15px] text-muted">{t('account.deleteBody')}</p>
            <ul className="mt-3 space-y-1.5 text-[15px] text-muted">
              {['deleteItem1', 'deleteItem2', 'deleteItem3'].map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <Icon name="minus" size={16} className="mt-1 text-accent" /> {t('account.' + k)}
                </li>
              ))}
            </ul>

            {isModerator ? (
              <p className="mt-5 text-[14px] text-faint">{t('account.deleteModerator')}</p>
            ) : (
              <>
                <label className="field-label mt-6" htmlFor="confirm-email">
                  {t('account.deleteConfirmLabel', { email: profile?.email ?? '' })}
                </label>
                <input
                  id="confirm-email"
                  type="email"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  placeholder={profile?.email ?? ''}
                  className="field mb-5 max-w-[380px]"
                />
                <FormError>{error}</FormError>
                <button onClick={remove} disabled={!emailMatches || busy} className="btn-accent">
                  {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="trash" size={16} />}
                  {t('account.deleteCta')}
                </button>
              </>
            )}
          </Section>
        </div>
      </main>

      <Suspense fallback={null}>{showBilling && <BillingModal open onClose={() => setShowBilling(false)} />}</Suspense>
    </div>
  )
}
