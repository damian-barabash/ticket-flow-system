import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { entitlement } from '../lib/billing'
import { openCheckout, PRICE_LABEL } from '../lib/paddle'
import { PlanButtons } from './PlanButtons'
import { formatDay } from '../lib/format'
import { Modal, Spinner } from './ui'

// Admin subscription management: shows status, lets them subscribe or cancel.
// Cancel goes through the paddle-cancel Edge Function (secret key stays server-side).
export function BillingModal({ open, onClose }) {
  const { profile, reloadProfile } = useAuth()
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const ent = entitlement(profile)
  const endDate = profile?.subscription_ends_at ? formatDay(profile.subscription_ends_at) : ''
  const canCancel = ent.state === 'active' && !!profile?.paddle_subscription_id

  async function pay(plan) {
    setError('')
    const r = await openCheckout({ email: profile?.email, profileId: profile?.id, plan })
    if (!r.ok && r.reason === 'not_configured') setError(t('billing.notConfigured'))
  }

  async function cancel() {
    if (!confirm(t('billing.cancelConfirm'))) return
    setBusy(true)
    setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('paddle-cancel', { body: { action: 'cancel_self' } })
      if (err || data?.error) throw new Error(err?.message || data?.error)
      setMsg(t('billing.cancelDone', { date: endDate || '—' }))
      setTimeout(() => reloadProfile?.(), 1500)
    } catch {
      setError(t('billing.cancelError'))
    } finally {
      setBusy(false)
    }
  }

  const statusLabel =
    ent.state === 'active' ? t('billing.statusActive') : ent.state === 'trial' ? t('billing.statusTrial') : t('billing.statusInactive')
  const statusColor = ent.state === 'active' ? 'text-ok' : ent.state === 'trial' ? 'text-accent' : 'text-faint'
  const sub =
    ent.state === 'active'
      ? endDate && t('billing.activeUntil', { date: endDate })
      : ent.state === 'trial'
      ? t('billing.trialUntil', { n: ent.daysLeft })
      : ''

  return (
    <Modal open={open} onClose={onClose} title={t('billing.modalTitle')}>
      <div className="mb-6 border border-line bg-surface2 p-5">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 ${ent.state === 'active' ? 'bg-ok' : ent.state === 'trial' ? 'bg-accent' : 'bg-faint'}`} />
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
        </div>
        {sub && <p className="mt-1.5 text-xs text-faint">{sub}</p>}
        <p className="mt-3 font-mono text-[11px] uppercase tracking-label text-faint">{PRICE_LABEL}</p>
      </div>

      {msg && <div className="mb-5 border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{msg}</div>}
      {error && <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}

      {ent.state !== 'active' && !msg && (
        <div className="mb-6">
          <PlanButtons onPick={pay} busy={busy} />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">
          {t('common.close')}
        </button>
        {canCancel && (
          <button onClick={cancel} disabled={busy || !!msg} className="btn-solid">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : t('billing.cancelBtn')}
          </button>
        )}
      </div>
    </Modal>
  )
}
