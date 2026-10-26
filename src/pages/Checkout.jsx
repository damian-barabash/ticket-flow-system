import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../context/LangContext'
import { openCheckout, isPaddleConfigured, PRICE_LABELS } from '../lib/paddle'
import { LogoMark } from '../components/Logo'
import { Icon, Spinner } from '../components/ui'

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
    <div className="grain flex min-h-screen items-center justify-center bg-[radial-gradient(120%_80%_at_50%_120%,rgba(242,35,27,0.35),#060606_60%)] p-5">
      <div className="page-in w-full max-w-[460px] border border-line bg-surface p-7 text-center sm:p-9">
        <div className="flex justify-center">
          <LogoMark size={48} />
        </div>

        {state === 'done' ? (
          <>
            <div className="mt-6 flex justify-center text-ok">
              <Icon name="checkCircle" size={36} />
            </div>
            <h1 className="display mt-4 text-[36px] text-ink">{t('checkout.doneTitle')}</h1>
            <p className="mx-auto mt-3 max-w-[360px] text-[15px] text-muted">{t('checkout.doneBody')}</p>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className="display mt-6 text-[32px] text-ink">{t('checkout.errorTitle')}</h1>
            <p className="mx-auto mt-3 max-w-[360px] text-[15px] text-muted">{t('checkout.errorBody')}</p>
            {isPaddleConfigured() && (
              <button onClick={launch} className="btn-accent mt-6 w-full">
                <Icon name="refresh" size={16} /> {t('checkout.retry')}
              </button>
            )}
          </>
        ) : (
          <>
            <h1 className="display mt-6 text-[36px] text-ink">{t('checkout.title')}</h1>
            <p className="mx-auto mt-3 max-w-[360px] text-[15px] text-muted">
              {t(plan === 'yearly' ? 'billing.payYearly' : 'billing.payMonthly', { price: PRICE_LABELS[plan] })}
            </p>
            {email && <p className="num mt-1 text-[13px] text-faint">{email}</p>}
            <div className="mt-6 flex items-center justify-center gap-3 text-[15px] text-muted">
              <Spinner />
              {t('checkout.opening')}
            </div>
            {state === 'open' && (
              // The overlay can be dismissed by accident — leave a way back in.
              <button onClick={launch} className="btn-ghost mt-6 w-full">
                <Icon name="card" size={16} /> {t('checkout.retry')}
              </button>
            )}
          </>
        )}

        <Link to="/projects" className="btn-link mt-8 text-[14px]">
          {t('checkout.toPanel')} <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </div>
  )
}
