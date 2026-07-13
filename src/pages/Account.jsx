import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { entitlement } from '../lib/billing'
import { formatDay } from '../lib/format'
import { TopBar } from '../components/TopBar'
import { BillingModal } from '../components/BillingModal'
import { LogoMark } from '../components/Logo'
import { Avatar, Spinner } from '../components/ui'

// Account page: who you are, your subscription, and account deletion.
// Deleting is required by App Store guideline 5.1.1(v) — it has to be reachable
// in-app, not only by emailing support — so the same screen exists in every app.
export default function Account() {
  const { profile, role, isAdmin, isModerator, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()

  const [showBilling, setShowBilling] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ent = entitlement(profile)
  const roleLabel = t(role === 'moderator' ? 'topbar.moderator' : role === 'admin' ? 'topbar.admin' : 'topbar.client')
  const statusLabel =
    ent.state === 'active' ? t('billing.statusActive') : ent.state === 'trial' ? t('billing.statusTrial') : t('billing.statusInactive')

  const emailMatches = confirm.trim().toLowerCase() === String(profile?.email ?? '').trim().toLowerCase()

  async function remove() {
    if (!emailMatches || busy) return
    if (!confirm.length || !window.confirm(t('account.deleteConfirm'))) return
    setBusy(true)
    setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('delete-account', {
        body: { confirm_email: profile.email },
      })
      // supabase-js puts the error body on error.context — read the real reason.
      const detail = data?.error ?? (err ? await err.context?.json?.().then((b) => b?.error).catch(() => null) : null)
      if (err || detail) throw new Error(detail || err.message)
      await signOut()
      navigate('/', { replace: true })
    } catch (e) {
      setError(String(e.message) === 'moderator_self_delete' ? t('account.deleteModerator') : t('account.deleteError'))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <TopBar />
      <main className="mx-auto max-w-[720px] px-6 py-10">
        <p className="label">{t('account.label')}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{t('account.heading')}</h1>

        {/* Identity */}
        <section className="mt-8 border border-line bg-surface p-6">
          <div className="flex items-center gap-4">
            <Avatar name={profile?.full_name} email={profile?.email} size={44} />
            <div className="min-w-0">
              <div className="truncate text-base text-ink">{profile?.full_name || profile?.email}</div>
              <div className="mt-1 truncate text-sm text-muted">{profile?.email}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 bg-ok" />
                <span className="label">{roleLabel}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Subscription (tenant admins only — moderators aren't billed, clients inherit) */}
        {isAdmin && (
          <section className="mt-5 border border-line bg-surface p-6">
            <p className="label">{t('billing.manage')}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 ${
                      ent.state === 'active' ? 'bg-ok' : ent.state === 'trial' ? 'bg-accent' : 'bg-faint'
                    }`}
                  />
                  <span className="text-sm text-ink">{statusLabel}</span>
                </div>
                <p className="mt-1 text-xs text-faint">
                  {ent.state === 'active'
                    ? profile?.subscription_ends_at
                      ? t('billing.activeUntil', { date: formatDay(profile.subscription_ends_at) })
                      : ''
                    : ent.state === 'trial'
                    ? t('billing.trialUntil', { n: ent.daysLeft })
                    : ''}
                </p>
              </div>
              <button onClick={() => setShowBilling(true)} className="btn-solid">
                {t('billing.modalTitle')}
              </button>
            </div>
          </section>
        )}

        {/* Danger zone */}
        <section className="mt-5 border border-accent/40 bg-accentSoft/40 p-6">
          <div className="flex items-center gap-3">
            <LogoMark size={22} />
            <p className="label text-accent">{t('account.dangerLabel')}</p>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-ink">{t('account.deleteTitle')}</h2>
          <p className="mt-2 text-sm text-muted">{t('account.deleteBody')}</p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>— {t('account.deleteItem1')}</li>
            <li>— {t('account.deleteItem2')}</li>
            <li>— {t('account.deleteItem3')}</li>
          </ul>

          {isModerator ? (
            <p className="mt-5 text-sm text-faint">{t('account.deleteModerator')}</p>
          ) : (
            <>
              <label className="label mt-6 block" htmlFor="confirm-email">
                {t('account.deleteConfirmLabel', { email: profile?.email ?? '' })}
              </label>
              <input
                id="confirm-email"
                type="email"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                placeholder={profile?.email ?? ''}
                className="field mt-2 w-full max-w-[360px]"
              />
              {error && <p className="mt-3 text-sm text-accent">{error}</p>}
              <button
                onClick={remove}
                disabled={!emailMatches || busy}
                className="btn-accent mt-5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Spinner className="border-bg/40 border-t-bg" /> : t('account.deleteCta')}
              </button>
            </>
          )}
        </section>
      </main>

      <BillingModal open={showBilling} onClose={() => setShowBilling(false)} />
    </div>
  )
}
