import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { entitlement } from '../lib/billing'
import { openCheckout, pollUntilActive } from '../lib/paddle'
import { Icon, Spinner } from './ui'
import { PlanButtons } from './PlanButtons'
import { LogoMark } from './Logo'

// Blocking overlays shown when access has lapsed:
//   admin  → "account not paid" + pay button (trial banner lives in TopBar)
//   client → "account inactive, contact your admin" + admin email
// Moderators are never gated. Only shown on panel routes.
export function BillingGate() {
  const { session, profile, role, isAdmin, isModerator, signOut, reloadProfile } = useAuth()
  const { t } = useT()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [clientBlockEmail, setClientBlockEmail] = useState(null)
  const [clientChecked, setClientChecked] = useState(false)
  const [paying, setPaying] = useState(false)
  const [activating, setActivating] = useState(false)
  const [notice, setNotice] = useState('')
  const profRef = useRef(profile)
  profRef.current = profile
  const stopPoll = useRef(null)
  useEffect(() => () => stopPoll.current?.(), [])

  // Client gating: block only if EVERY owner-admin of the client's projects has lapsed.
  useEffect(() => {
    if (role !== 'user') {
      setClientChecked(true)
      return
    }
    let alive = true
    ;(async () => {
      const { data: projs } = await supabase.from('projects').select('created_by').eq('archived', false)
      const adminIds = [...new Set((projs ?? []).map((p) => p.created_by).filter(Boolean))]
      if (!adminIds.length) {
        if (alive) { setClientBlockEmail(null); setClientChecked(true) }
        return
      }
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, email, subscription_status, subscription_ends_at, trial_ends_at')
        .in('id', adminIds)
      const anyActive = (admins ?? []).some((a) => entitlement(a).active)
      if (alive) {
        setClientBlockEmail(anyActive ? null : (admins ?? [])[0]?.email ?? null)
        setClientChecked(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [role, session?.user?.id])

  const onPanel = /^\/(projects|workspaces|admin|calendar)/.test(pathname)
  if (!session || isModerator || !onPanel) return null

  async function pay(plan) {
    setPaying(true)
    setNotice('')
    const r = await openCheckout({
      email: profile?.email,
      profileId: profile?.id,
      plan,
      // the webhook flips the profile a few seconds after payment → poll until it does
      onEvent: (e) => {
        if (e?.name !== 'checkout.completed') return
        setActivating(true)
        stopPoll.current?.()
        stopPoll.current = pollUntilActive(reloadProfile, () => entitlement(profRef.current).active)
      },
    })
    setPaying(false)
    if (!r.ok) setNotice(r.reason === 'not_configured' ? t('billing.notConfigured') : t('checkout.errorBody'))
  }

  // Admin whose trial ended and isn't paid.
  if (isAdmin) {
    const ent = entitlement(profile)
    if (ent.active) return null
    return (
      <Overlay>
        <LogoMark size={48} />
        <h2 className="display mt-6 text-[36px] text-ink">{activating ? t('panel.activating') : t('billing.unpaidTitle')}</h2>
        <p className="mx-auto mt-3 max-w-[380px] text-[15px] text-muted">{activating ? t('checkout.doneBody') : t('billing.unpaidBody')}</p>
        <div className="mt-7">
          {activating ? (
            <div className="flex items-center justify-center gap-3 text-[15px] text-muted">
              <Spinner /> {t('panel.activatingHint')}
            </div>
          ) : (
            <PlanButtons onPick={pay} busy={paying} />
          )}
        </div>
        {notice && <p className="mt-4 text-[14px] text-accent">{notice}</p>}
        <GateFooter onSignOut={signOut} onAccount={() => navigate('/account')} t={t} />
      </Overlay>
    )
  }

  // Client whose owner-admin(s) all lapsed.
  if (role === 'user') {
    if (!clientChecked) return null
    if (!clientBlockEmail) return null
    return (
      <Overlay>
        <LogoMark size={48} />
        <h2 className="display mt-6 text-[36px] text-ink">{t('billing.clientTitle')}</h2>
        <p className="mx-auto mt-3 max-w-[380px] text-[15px] text-muted">{t('billing.clientBody')}</p>
        <a href={`mailto:${clientBlockEmail}`} className="btn-link mt-4 text-[15px]">
          <Icon name="mail" size={16} /> {clientBlockEmail}
        </a>
        <GateFooter onSignOut={signOut} onAccount={() => navigate('/account')} t={t} />
      </Overlay>
    )
  }

  return null
}

// The gate covers the whole panel, so account deletion has to be reachable from
// inside it — otherwise a lapsed user could never delete their account (which
// Apple requires to be available in-app).
function GateFooter({ onSignOut, onAccount, t }) {
  return (
    <div className="mt-8 grid grid-cols-2 border-t border-line pt-5">
      <button onClick={onSignOut} className="btn-quiet btn-sm justify-center">
        <Icon name="logout" size={15} /> {t('billing.signOut')}
      </button>
      <button onClick={onAccount} className="btn-quiet btn-sm justify-center hover:!text-accent">
        <Icon name="user" size={15} /> {t('topbar.account')}
      </button>
    </div>
  )
}

function Overlay({ children }) {
  return (
    <div className="fade-in fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_120%,rgba(242,35,27,0.3),rgba(6,6,6,0.97)_60%)] p-4">
      <div className="pop w-full max-w-[460px] border border-line bg-surface p-7 text-center sm:p-9">
        {children}
      </div>
    </div>
  )
}
