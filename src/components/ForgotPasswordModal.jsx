import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Icon, Modal, Spinner } from './ui'

// supabase-js puts a non-2xx body on error.context (a Response)
async function invokeReset(body) {
  const { data, error } = await supabase.functions.invoke('password-reset', { body })
  if (!error) return data || { ok: true }
  try {
    const j = await error.context?.json?.()
    if (j) return j
  } catch {
    /* ignore */
  }
  return { error: 'network' }
}

// Steps: email → code + new password → done (auto sign-in → /projects)
export function ForgotPasswordModal({ open, onClose, initialEmail = '' }) {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

  useEffect(() => {
    if (open) {
      setStep('email')
      setEmail(initialEmail || '')
      setCode('')
      setPw('')
      setPw2('')
      setErr('')
    }
  }, [open])
  useEffect(() => {
    if (!cooldown) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const ERR = {
    wrong_code: t('reset.err.wrong_code'),
    expired: t('reset.err.expired'),
    no_code: t('reset.err.expired'),
    too_many: t('reset.err.too_many'),
    weak_password: t('reset.err.weak_password'),
    network: t('common.error'),
  }

  async function start(e) {
    e?.preventDefault()
    const em = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(em)) return setErr(t('reset.err.email'))
    setBusy(true)
    setErr('')
    const r = await invokeReset({ action: 'start', email: em, lang })
    setBusy(false)
    if (r?.error && r.error !== 'network' && !ERR[r.error]) return setErr(t('common.error'))
    if (r?.error === 'network') return setErr(ERR.network)
    if (r?.error) return setErr(ERR[r.error])
    setStep('code')
    setCooldown(45)
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  async function verify(e) {
    e?.preventDefault()
    if (!/^\d{6}$/.test(code)) return setErr(t('reset.err.codeFormat'))
    if (pw.length < 8) return setErr(t('reset.err.weak_password'))
    if (pw !== pw2) return setErr(t('reset.err.mismatch'))
    setBusy(true)
    setErr('')
    const r = await invokeReset({ action: 'verify', email: email.trim(), code, password: pw })
    if (r?.error || !r?.ok) {
      setBusy(false)
      return setErr(ERR[r?.error] || t('common.error'))
    }
    setStep('done')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (!error) {
      setTimeout(() => {
        onClose?.()
        navigate('/projects', { replace: true })
      }, 900)
    }
  }

  const back = () => {
    setErr('')
    if (step === 'code') setStep('email')
    else onClose?.()
  }

  const stepNo = step === 'email' ? 1 : step === 'code' ? 2 : 3

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('reset.title')}
      width="max-w-md"
      z="z-[90]"
      footer={
        step !== 'done' && (
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn-quiet btn-sm" onClick={back}>
              <Icon name="back" size={15} /> {step === 'email' ? t('common.cancel') : t('common.back')}
            </button>
            <button type="submit" form="reset-form" className="btn-accent btn-sm" disabled={busy}>
              {busy ? <Spinner className="border-white/40 border-t-white" /> : step === 'email' ? t('reset.sendCode') : t('reset.setPassword')}
            </button>
          </div>
        )
      }
    >
      <div className="mb-5 flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-[3px] flex-1 transition-colors duration-200 ${n <= stepNo ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </div>

      {step === 'email' && (
        <form id="reset-form" onSubmit={start} className="flex flex-col gap-5">
          <p className="text-[15px] text-muted">{t('reset.emailIntro')}</p>
          <div>
            <label className="field-label">{t('common.email')}</label>
            <input type="email" autoFocus autoComplete="username" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
          {err && <Err text={err} />}
        </form>
      )}

      {step === 'code' && (
        <form id="reset-form" onSubmit={verify} className="flex flex-col gap-5">
          <p className="text-[15px] text-muted">{t('reset.codeIntro', { email: email.trim() })}</p>
          <div>
            <label className="field-label">{t('reset.code')}</label>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="field num text-center text-[28px] tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
            />
            <div className="mt-2 flex justify-end">
              <button type="button" className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline disabled:no-underline disabled:opacity-50" disabled={cooldown > 0 || busy} onClick={start}>
                {cooldown > 0 ? t('reset.resendIn', { n: cooldown }) : t('reset.resend')}
              </button>
            </div>
          </div>
          <div>
            <label className="field-label">{t('reset.newPassword')}</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} autoComplete="new-password" className="field pr-10" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
              <button type="button" className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-faint hover:text-ink" onClick={() => setShow((v) => !v)} aria-label={t('reset.showPassword')}>
                <Icon name="eye" size={17} />
              </button>
            </div>
            <p className="mt-1.5 text-[13px] text-faint">{t('reset.pwHint')}</p>
          </div>
          <div>
            <label className="field-label">{t('reset.confirmPassword')}</label>
            <input type={show ? 'text' : 'password'} autoComplete="new-password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </div>
          {err && <Err text={err} />}
        </form>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center bg-ok text-bg">
            <Icon name="check" size={28} stroke={2.5} />
          </span>
          <div className="display mt-5 text-[28px] text-ink">{t('reset.doneTitle')}</div>
          <p className="mt-2 text-[14px] text-muted">{busy ? t('reset.signingIn') : t('reset.doneHint')}</p>
          {busy ? (
            <Spinner className="mt-5" />
          ) : (
            <button className="btn-solid btn-sm mt-6" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

function Err({ text }) {
  return (
    <div className="flex items-start gap-2 border border-accent/40 bg-accentSoft px-3 py-2 text-[14px] text-accent" role="alert">
      <Icon name="alert" size={16} className="mt-0.5" /> {text}
    </div>
  )
}

export default ForgotPasswordModal
