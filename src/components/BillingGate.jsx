import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { entitlement } from '../lib/billing'
import { openCheckout, PRICE_LABEL } from '../lib/paddle'
import { LogoMark } from './Logo'
import { Spinner } from './ui'

// Blocking overlays shown when access has lapsed:
//   admin  → "account not paid" + pay button (trial banner lives in TopBar)
//   client → "account inactive, contact your admin" + admin email
// Moderators are never gated. Only shown on panel routes.
export function BillingGate() {
  const { session, profile, role, isAdmin, isModerator, signOut } = useAuth()
  const { t } = useT()
  const { pathname } = useLocation()
  const [clientBlockEmail, setClientBlockEmail] = useState(null)
  const [clientChecked, setClientChecked] = useState(false)
  const [paying, setPaying] = useState(false)

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

  const onPanel = /^\/(projects|workspaces|admin)/.test(pathname)
  if (!session || isModerator || !onPanel) return null

  async function pay() {
    setPaying(true)
    const r = await openCheckout({ email: profile?.email, profileId: profile?.id })
    setPaying(false)
    if (!r.ok && r.reason === 'not_configured') alert(t('billing.notConfigured'))
  }

  // Admin whose trial ended and isn't paid.
  if (isAdmin) {
    const ent = entitlement(profile)
    if (ent.active) return null
    return (
      <Overlay>
        <LogoMark size={44} />
        <h2 className="mt-5 text-xl font-semibold text-ink">{t('billing.unpaidTitle')}</h2>
        <p className="mx-auto mt-2 max-w-[380px] text-sm text-muted">{t('billing.unpaidBody')}</p>
        <button onClick={pay} disabled={paying} className="btn-accent mt-6 w-full max-w-[280px]">
          {paying ? <Spinner className="border-bg/40 border-t-bg" /> : t('billing.payCta')}
        </button>
        <p className="mt-2 text-xs text-faint">{t('billing.priceNote', { price: PRICE_LABEL })}</p>
        <button onClick={signOut} className="label mt-6 text-faint hover:text-ink transition-colors">
          {t('billing.signOut')}
        </button>
      </Overlay>
    )
  }

  // Client whose owner-admin(s) all lapsed.
  if (role === 'user') {
    if (!clientChecked) return null
    if (!clientBlockEmail) return null
    return (
      <Overlay>
        <LogoMark size={44} />
        <h2 className="mt-5 text-xl font-semibold text-ink">{t('billing.clientTitle')}</h2>
        <p className="mx-auto mt-2 max-w-[380px] text-sm text-muted">{t('billing.clientBody')}</p>
        <a href={`mailto:${clientBlockEmail}`} className="mt-3 block text-sm text-accent hover:underline">
          {clientBlockEmail}
        </a>
        <button onClick={signOut} className="label mt-6 text-faint hover:text-ink transition-colors">
          {t('billing.signOut')}
        </button>
      </Overlay>
    )
  }

  return null
}

function Overlay({ children }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/95 p-4 backdrop-blur-sm">
      <div className="dotgrid w-full max-w-[440px] border border-line bg-surface p-8 text-center shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        {children}
      </div>
    </div>
  )
}
