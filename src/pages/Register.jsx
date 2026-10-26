import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { LogoMark } from '../components/Logo'
import { FormError, Icon, Spinner } from '../components/ui'
import { AuthShell } from './Login'

// ?email= (landing CTA) → fallback sessionStorage 'tf_prefill_email' (consumed once)
function prefillEmail(params) {
  const q = params.get('email')
  let s = null
  try {
    s = sessionStorage.getItem('tf_prefill_email')
    if (s) sessionStorage.removeItem('tf_prefill_email')
  } catch {
    /* ignore */
  }
  return (q || s || '').trim()
}

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
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Already signed in (e.g. the desktop app opens straight on /register) → panel.
  useEffect(() => {
    if (!authLoading && session) navigate('/projects', { replace: true })
  }, [authLoading, session, navigate])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(() => prefillEmail(params))
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
    console.warn('[register] start failed', c)
    return t('panel.errRegister')
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
      console.warn('[register] verify failed', r.errCode)
      return setError(t('panel.errRegister'))
    }
    // Email confirmed → sign in with the password we already have.
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: mail, password })
    setBusy(false)
    if (signErr) {
      console.warn('[register] sign-in failed', signErr)
      return setError(t('panel.errRegister'))
    }
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
    <AuthShell headline={t('panel.registerHeadline')} onBack={() => (step === 'code' ? (setStep('form'), setError('')) : navigate('/'))} backLabel={step === 'code' ? t('common.back') : t('panel.toSite')}>
      <div className="mb-8 lg:hidden">
        <LogoMark size={44} />
      </div>
      <span className="tag text-muted">{t('register.badge')}</span>
      <h1 className="display mt-3 text-[44px] text-ink sm:text-[52px]">{step === 'code' ? t('register.codeTitle') : t('register.title')}</h1>
      <p className="mt-3 text-[15px] text-muted">{step === 'code' ? t('register.codeSub', { email: mail }) : t('register.sub')}</p>

      {step === 'code' ? (
        <form onSubmit={onVerify} className="mt-8">
          <label className="field-label" htmlFor="reg-code">
            {t('register.codeLabel')}
          </label>
          <input
            id="reg-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="field num mb-6 text-center text-[28px] tracking-[0.4em]"
          />

          {resent && (
            <div className="mb-5 flex items-center gap-2 border border-ok/40 bg-ok/10 px-3 py-2.5 text-[14px] text-ink">
              <Icon name="check" size={16} className="text-ok" /> {t('register.resent')}
            </div>
          )}
          <FormError>{error}</FormError>

          <button type="submit" disabled={busy || code.length !== 6} className="btn-accent w-full">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="check" size={17} />}
            {t('register.verify')}
          </button>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('form')
                setError('')
              }}
              className="btn-quiet btn-sm -ml-3"
            >
              <Icon name="arrowLeft" size={15} /> {t('panel.changeEmail')}
            </button>
            <button type="button" onClick={resend} disabled={busy} className="btn-link text-[14px]">
              <Icon name="refresh" size={14} /> {t('register.resend')}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="mt-8">
          <label className="field-label" htmlFor="reg-name">
            {t('register.name')}
          </label>
          <input id="reg-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('register.namePlaceholder')} className="field mb-6" />

          <label className="field-label" htmlFor="reg-email">
            {t('register.email')}
          </label>
          <input
            id="reg-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="field mb-6"
          />

          <label className="field-label" htmlFor="reg-pass">
            {t('register.password')}
          </label>
          <input
            id="reg-pass"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="field mb-1.5"
          />
          <p className="mb-6 text-[13px] text-faint">{t('register.passwordHint')}</p>

          <label className="field-label" htmlFor="reg-confirm">
            {t('register.confirm')}
          </label>
          <input
            id="reg-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="field mb-7"
          />

          <FormError>{error}</FormError>

          <button type="submit" disabled={busy} className="btn-accent w-full">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="arrowRight" size={17} />}
            {t('register.submit')}
          </button>

          <p className="mt-8 text-[15px] text-muted">
            {t('register.haveAccount')}{' '}
            <button type="button" onClick={() => navigate('/login')} className="btn-link">
              {t('register.signin')}
            </button>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
