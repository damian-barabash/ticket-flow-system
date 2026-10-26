import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { entitlement } from '../lib/billing'
import { openCheckout, pollUntilActive, PRICE_LABELS } from '../lib/paddle'
import { PlanButtons } from './PlanButtons'
import { formatDay } from '../lib/format'
import { FormError, Icon, Modal, Spinner, useConfirm } from './ui'

// Admin subscription management: shows status, lets them subscribe or cancel.
// Cancel goes through the paddle-cancel Edge Function (secret key stays server-side).
export function BillingModal({ open, onClose }) {
  const { profile, reloadProfile } = useAuth()
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)
  const confirmDlg = useConfirm()
  const profRef = useRef(profile)
  profRef.current = profile
  const stopPoll = useRef(null)
  useEffect(() => () => stopPoll.current?.(), [])
  useEffect(() => {
    if (activating && entitlement(profile).state === 'active') setActivating(false)
  }, [activating, profile])

  const ent = entitlement(profile)
  const endDate = profile?.subscription_ends_at ? formatDay(profile.subscription_ends_at) : ''
  const canCancel = ent.state === 'active' && !!profile?.paddle_subscription_id

  async function pay(plan) {
    setError('')
    const r = await openCheckout({
      email: profile?.email,
      profileId: profile?.id,
      plan,
      onEvent: (e) => {
        if (e?.name !== 'checkout.completed') return
        setActivating(true)
        stopPoll.current?.()
        stopPoll.current = pollUntilActive(reloadProfile, () => entitlement(profRef.current).state === 'active')
      },
    })
    if (!r.ok) setError(r.reason === 'not_configured' ? t('billing.notConfigured') : t('checkout.errorBody'))
  }

  async function cancel() {
    const ok = await confirmDlg({ title: t('billing.cancelBtn'), body: t('billing.cancelConfirm'), danger: true, confirmLabel: t('billing.cancelBtn') })
    if (!ok) return
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
    <Modal open={open} onClose={onClose} title={t('billing.modalTitle')} width="max-w-md">
      <div className="mb-6 border border-line bg-surface2 p-5">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 ${ent.state === 'active' ? 'bg-ok' : ent.state === 'trial' ? 'bg-warn' : 'bg-accent'}`} />
          <span className={`text-[16px] font-semibold ${statusColor}`}>{statusLabel}</span>
        </div>
        {sub && <p className="mt-1.5 text-[14px] text-muted">{sub}</p>}
        <p className="num mt-3 text-[13px] text-faint">
          {PRICE_LABELS.monthly} / {PRICE_LABELS.yearly}
        </p>
      </div>

      {activating && (
        <div className="mb-5 flex items-center gap-3 border border-ok/40 bg-ok/10 px-3 py-2.5 text-[14px] text-ink">
          <Spinner size={13} /> {t('panel.activatingHint')}
        </div>
      )}
      {msg && (
        <div className="mb-5 flex items-center gap-2 border border-ok/40 bg-ok/10 px-3 py-2.5 text-[14px] text-ink">
          <Icon name="check" size={16} className="text-ok" /> {msg}
        </div>
      )}
      <FormError>{error}</FormError>

      {ent.state !== 'active' && !msg && !activating && (
        <div className="mb-6">
          <PlanButtons onPick={pay} busy={busy} />
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button onClick={onClose} className="btn-ghost">
          {t('common.close')}
        </button>
        {canCancel && (
          <button onClick={cancel} disabled={busy || !!msg} className="btn-danger">
            {busy ? <Spinner /> : <Icon name="close" size={16} />}
            {t('billing.cancelBtn')}
          </button>
        )}
      </div>
    </Modal>
  )
}
