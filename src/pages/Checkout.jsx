import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../context/LangContext'
import { openCheckout, isPaddleConfigured, PRICE_LABELS } from '../lib/paddle'
import { LogoMark } from '../components/Logo'
import { Spinner } from '../components/ui'

// Landing pad for the desktop apps' "Subscribe" button.
//
// The app opens /#/checkout?plan=…&pid=…&email=… in the browser and this page
// opens the Paddle overlay immediately for that account — no signing in again.
// It's deliberately public: a user whose trial lapsed must be able to pay even
// if they never log in on the website.
export default function Checkout() {
  const { t } = useT()
  const [params] = useSearchParams()
  const [state, setState] = useState('opening') // opening | open | done | error
  const opened = useRef(false)

  const plan = params.get('plan') === 'yearly' ? 'yearly' : 'monthly'
  const profileId = params.get('pid') || undefined
  const email = params.get('email') || undefined

  async function launch() {
    setState('opening')
    const r = await openCheckout({
      email,
      profileId,
      plan,
      onEvent: (e) => {
        if (e?.name === 'checkout.completed') setState('done')
      },
    })
    setState(r.ok ? 'open' : 'error')
  }

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (!isPaddleConfigured()) {
      setState('error')
      return
    }
    launch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="dotgrid flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[440px] border border-line bg-surface p-8 text-center">
        <LogoMark size={44} />

        {state === 'done' ? (
          <>
            <h1 className="mt-5 text-xl font-semibold text-ok">{t('checkout.doneTitle')}</h1>
            <p className="mx-auto mt-2 max-w-[360px] text-sm text-muted">{t('checkout.doneBody')}</p>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className="mt-5 text-xl font-semibold text-ink">{t('checkout.errorTitle')}</h1>
            <p className="mx-auto mt-2 max-w-[360px] text-sm text-muted">{t('checkout.errorBody')}</p>
            {isPaddleConfigured() && (
              <button onClick={launch} className="btn-accent mt-6 w-full max-w-[280px]">
                {t('checkout.retry')}
              </button>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-5 text-xl font-semibold text-ink">{t('checkout.title')}</h1>
            <p className="mx-auto mt-2 max-w-[360px] text-sm text-muted">
              {t(plan === 'yearly' ? 'billing.payYearly' : 'billing.payMonthly', { price: PRICE_LABELS[plan] })}
            </p>
            {email && <p className="mt-1 font-mono text-xs text-faint">{email}</p>}
            <div className="mt-6 flex items-center justify-center gap-3 text-sm text-muted">
              <Spinner />
              {t('checkout.opening')}
            </div>
            {state === 'open' && (
              // The overlay can be dismissed by accident — leave a way back in.
              <button onClick={launch} className="label mt-6 text-faint hover:text-ink transition-colors">
                {t('checkout.retry')}
              </button>
            )}
          </>
        )}

        <Link to="/projects" className="label mt-8 block text-faint hover:text-ink transition-colors">
          {t('checkout.toPanel')}
        </Link>
      </div>
    </div>
  )
}
