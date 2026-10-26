import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { LogoMark, Wordmark } from '../components/Logo'
import { FormError, Icon, Spinner } from '../components/ui'
import { LangSwitch } from '../components/LangSwitch'
import { errText } from '../lib/errors'

const ForgotPasswordModal = lazy(() => import('../components/ForgotPasswordModal').then((m) => ({ default: m.ForgotPasswordModal })))

// Shared split layout for auth screens: red blaze panel (desktop) + form.
export function AuthShell({ children, headline, onBack, backLabel }) {
  const { t } = useT()
  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="grain blaze relative hidden w-[46%] max-w-[720px] flex-col justify-between overflow-hidden p-10 lg:flex">
        <Wordmark size={26} />
        <div>
          <span className="tag text-white/80">{t('login.tagline')}</span>
          <h2 className="display mt-4 text-[64px] text-white xl:text-[88px]">{headline}</h2>
        </div>
        <span className="display pointer-events-none -mb-6 select-none text-[150px] leading-none text-black/25 xl:text-[180px]">TF</span>
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <button onClick={onBack} className="btn-quiet btn-sm -ml-2">
            <Icon name="arrowLeft" size={16} /> {backLabel}
          </button>
          <LangSwitch />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-4">
          <div className="page-in w-full max-w-[420px]">{children}</div>
        </div>
        <div className="flex items-center justify-between px-4 pb-5 text-[13px] text-faint sm:px-8">
          <span>© Ticket Flow</span>
          <a href="https://ticketflow.pl" className="hover:text-ink">
            ticketflow.pl
          </a>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forgot, setForgot] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    const err = await signIn(email, password)
    setBusy(false)
    if (!err) return
    const m = String(err.message || '')
    if (m.includes('Invalid login credentials')) setError(t('login.errInvalid'))
    else if (m.includes('Email not confirmed')) setError(t('login.errUnconfirmed'))
    else setError(errText(t, err))
  }

  return (
    <AuthShell headline={t('panel.loginHeadline')} onBack={() => navigate('/')} backLabel={t('panel.toSite')}>
      <div className="mb-8 lg:hidden">
        <LogoMark size={44} />
      </div>
      <span className="tag text-muted">{t('login.subtitle')}</span>
      <h1 className="display mt-3 text-[48px] text-ink sm:text-[56px]">{t('login.submit')}</h1>

      <form onSubmit={onSubmit} className="mt-8">
        <label className="field-label" htmlFor="login-email">
          {t('common.email')}
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="field mb-6"
        />

        <div className="flex items-baseline justify-between">
          <label className="field-label" htmlFor="login-pass">
            {t('login.password')}
          </label>
          <button type="button" onClick={() => setForgot(true)} className="text-[13px] font-semibold text-accent underline-offset-4 hover:underline">
            {t('reset.link')}
          </button>
        </div>
        <div className="relative mb-7">
          <input
            id="login-pass"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="field pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted hover:text-ink"
            aria-label={t('panel.showPassword')}
            title={t('panel.showPassword')}
          >
            <Icon name="eye" size={17} />
          </button>
        </div>

        <FormError>{error}</FormError>

        <button type="submit" disabled={busy} className="btn-accent w-full">
          {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="arrowRight" size={17} />}
          {t('login.submit')}
        </button>
      </form>

      <p className="mt-8 text-[15px] text-muted">
        {t('login.noAccount')}{' '}
        <button onClick={() => navigate('/register')} className="btn-link">
          {t('panel.createAccount')}
        </button>
      </p>

      <Suspense fallback={null}>{forgot && <ForgotPasswordModal open onClose={() => setForgot(false)} initialEmail={email} />}</Suspense>
    </AuthShell>
  )
}
