import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { LogoMark } from '../components/Logo'
import { Spinner } from '../components/ui'
import { LangSwitch } from '../components/LangSwitch'

// Invoke an Edge Function and pull out our { error: code } even on non-2xx
// (supabase-js puts the body on error.context, not data, for error responses).
async function callFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let code = 'generic'
    try {
      code = (await error.context.json())?.error || 'generic'
    } catch {
      /* ignore */
    }
    return { errCode: code }
  }
  if (data?.error) return { errCode: data.error }
  return { data }
}

// Open self-registration → creates an ADMIN and verifies the email with a 6-digit
// code sent from system@ticketflow.pl. handle_new_user clamps role to admin|user.
export default function Register() {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('form') // 'form' | 'code'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  const mail = email.trim().toLowerCase()

  function mapStartError(c) {
    if (c === 'email_exists') return t('register.errExists')
    if (c === 'weak_password') return t('register.errWeak')
    if (c === 'invalid_email') return t('register.errEmail')
    if (c === 'mail_failed') return t('register.errMail')
    return t('register.errGeneric') + c
  }

  async function start() {
    return callFn('register-start', { email: mail, password, full_name: fullName.trim() || null, language: lang })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError(t('register.errMismatch'))
    if (password.length < 6) return setError(t('register.errWeak'))
    setBusy(true)
    const r = await start()
    setBusy(false)
    if (r.errCode) return setError(mapStartError(r.errCode))
    setStep('code')
  }

  async function onVerify(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const r = await callFn('register-verify', { email: mail, code: code.trim() })
    if (r.errCode) {
      setBusy(false)
      if (r.errCode === 'wrong_code') return setError(t('register.errCode'))
      if (r.errCode === 'expired' || r.errCode === 'no_code' || r.errCode === 'too_many')
        return setError(t('register.errExpired'))
      return setError(t('register.errGeneric') + r.errCode)
    }
    // Email confirmed → sign in with the password we already have.
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: mail, password })
    setBusy(false)
    if (signErr) return setError(t('register.errGeneric') + signErr.message)
    navigate('/projects', { replace: true })
  }

  async function resend() {
    setError('')
    setResent(false)
    setBusy(true)
    const r = await start()
    setBusy(false)
    if (r.errCode) return setError(mapStartError(r.errCode))
    setResent(true)
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

        {step === 'code' ? (
          <form onSubmit={onVerify} className="brackets relative border border-line bg-surface/60 px-7 py-8">
            <h2 className="text-center text-lg font-medium text-ink">{t('register.codeTitle')}</h2>
            <p className="mx-auto mb-6 mt-2 max-w-[320px] text-center text-sm text-faint">
              {t('register.codeSub', { email: mail })}
            </p>

            <label className="label mb-2 block">{t('register.codeLabel')}</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="field mb-6 text-center font-mono text-2xl tracking-[0.4em]"
            />

            {resent && <div className="mb-4 border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{t('register.resent')}</div>}
            {error && <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}

            <button type="submit" disabled={busy || code.length !== 6} className="btn-accent w-full">
              {busy ? <Spinner className="border-white/40 border-t-white" /> : t('register.verify')}
            </button>

            <div className="mt-5 flex items-center justify-between text-xs text-faint">
              <button
                type="button"
                onClick={() => {
                  setStep('form')
                  setError('')
                }}
                className="hover:text-ink transition-colors"
              >
                {t('common.back')}
              </button>
              <button type="button" onClick={resend} disabled={busy} className="text-ink underline-offset-2 hover:underline">
                {t('register.resend')}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="brackets relative border border-line bg-surface/60 px-7 py-8">
            <label className="label mb-2 block">{t('register.name')}</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('register.namePlaceholder')} className="field mb-5" />

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

            {error && <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}

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
        <span className="label">ticketflow.pl</span>
      </div>
    </div>
  )
}
