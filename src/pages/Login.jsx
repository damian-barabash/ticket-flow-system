import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { LogoMark } from '../components/Logo'
import { Spinner } from '../components/ui'
import { LangSwitch } from '../components/LangSwitch'

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const AUTH_ERRORS = {
    'Invalid login credentials': t('login.errInvalid'),
    'Email not confirmed': t('login.errUnconfirmed'),
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const err = await signIn(email, password)
    setBusy(false)
    if (err) setError(AUTH_ERRORS[err.message] || err.message)
  }

  return (
    <div className="dotgrid relative flex min-h-screen flex-col items-center justify-center px-5">
      {/* corner frame */}
      <div className="pointer-events-none absolute inset-5 brackets" />

      {/* top micro-labels */}
      <div className="absolute inset-x-6 top-6 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="label hover:text-ink transition-colors">
          {t('register.toLanding')}
        </button>
        <LangSwitch />
      </div>

      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={52} />
          <h1 className="mt-5 font-mono uppercase tracking-label text-[15px] text-ink">Ticket Flow</h1>
          <p className="mt-2 text-sm text-faint">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="brackets relative border border-line bg-surface/60 px-7 py-8">
          <label className="label mb-2 block">{t('common.email')}</label>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="field mb-6"
          />

          <label className="label mb-2 block">{t('login.password')}</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="field mb-7"
          />

          {error && (
            <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-solid w-full">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : t('login.submit')}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-faint">
          {t('login.noAccount')}{' '}
          <button onClick={() => navigate('/register')} className="text-ink underline-offset-2 hover:underline">
            {t('landing.hero.ctaPrimary')}
          </button>
        </p>
      </div>

      {/* bottom micro-labels */}
      <div className="absolute inset-x-6 bottom-6 flex items-center justify-between">
        <span className="label">MMXXVI / № 01</span>
        <span className="label">barabashflow.pl</span>
      </div>
    </div>
  )
}
