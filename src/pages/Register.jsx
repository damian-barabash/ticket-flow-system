import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { LogoMark } from '../components/Logo'
import { Spinner } from '../components/ui'
import { LangSwitch } from '../components/LangSwitch'

// Open self-registration → creates an ADMIN (isolated workspace). The handle_new_user
// trigger clamps signup metadata to admin|user, so 'moderator' can never be self-minted.
export default function Register() {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError(t('register.errMismatch'))
    if (password.length < 6) return setError(t('register.errWeak'))
    setBusy(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() || null, role: 'admin' } },
    })
    if (err) {
      setBusy(false)
      if (/already|registered|exists/i.test(err.message)) return setError(t('register.errExists'))
      return setError(t('register.errGeneric') + err.message)
    }
    // Persist the chosen UI language on the fresh profile (default would be 'ru').
    if (data.user?.id) {
      supabase.from('profiles').update({ language: lang }).eq('id', data.user.id)
    }
    setBusy(false)
    if (data.session) {
      // Auto-confirm on: we are signed in. AuthContext picks up the session.
      navigate('/projects', { replace: true })
    } else {
      // Email confirmation required.
      setNeedsConfirm(true)
    }
  }

  return (
    <div className="dotgrid relative flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="pointer-events-none absolute inset-5 brackets" />

      <div className="absolute inset-x-6 top-6 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="label hover:text-ink transition-colors">
          {t('register.toLanding')}
        </button>
        <LangSwitch />
      </div>

      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={48} />
          <span className="label mt-5">{t('register.badge')}</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{t('register.title')}</h1>
          <p className="mt-2 text-sm text-faint">{t('register.sub')}</p>
        </div>

        {needsConfirm ? (
          <div className="brackets relative border border-line bg-surface/60 px-7 py-9 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-ok/15 text-ok">✓</div>
            <h2 className="text-lg font-medium text-ink">{t('register.successTitle')}</h2>
            <p className="mt-2 text-sm text-faint">{t('register.checkEmail')}</p>
            <button onClick={() => navigate('/login')} className="btn-solid mt-6 w-full">
              {t('register.successCta')}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="brackets relative border border-line bg-surface/60 px-7 py-8">
            <label className="label mb-2 block">{t('register.name')}</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('register.namePlaceholder')}
              className="field mb-5"
            />

            <label className="label mb-2 block">{t('register.email')}</label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="field mb-5"
            />

            <label className="label mb-2 block">{t('register.password')}</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="field mb-1.5"
            />
            <p className="mb-4 text-[11px] text-faint">{t('register.passwordHint')}</p>

            <label className="label mb-2 block">{t('register.confirm')}</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="field mb-6"
            />

            {error && (
              <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>
            )}

            <button type="submit" disabled={busy} className="btn-accent w-full">
              {busy ? <Spinner className="border-white/40 border-t-white" /> : t('register.submit')}
            </button>

            <p className="mt-5 text-center text-xs text-faint">
              {t('register.haveAccount')}{' '}
              <button type="button" onClick={() => navigate('/login')} className="text-ink underline-offset-2 hover:underline">
                {t('register.signin')}
              </button>
            </p>
          </form>
        )}
      </div>

      <div className="absolute inset-x-6 bottom-6 flex items-center justify-between">
        <span className="label">MMXXVI / № 02</span>
        <span className="label">barabashflow.pl</span>
      </div>
    </div>
  )
}
