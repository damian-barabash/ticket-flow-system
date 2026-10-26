import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Modal, Spinner } from './ui'
import { LogoMark } from './Logo'

// Public inquiry form for the Enterprise plan. Anyone (unauthenticated landing
// visitor) can submit; the row lands in `enterprise_inquiries` and is readable
// only by moderators (RLS). No auth required — uses the anon publishable key.
// Style: "Momentum" — underline inputs, square chips, red primary.
export function EnterpriseModal({ open, onClose, initialEmail = '' }) {
  const { t } = useT()
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [need, setNeed] = useState(-1)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // prefill the e-mail typed in the landing CTA
  useEffect(() => {
    if (open && initialEmail) setEmail((v) => v || initialEmail)
  }, [open, initialEmail])

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const needOpts = t('landing.enterpriseForm.needOpts')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!emailOk) {
      setError(t('landing.enterpriseForm.emailInvalid'))
      return
    }
    setBusy(true)
    try {
      const msg = [need >= 0 && Array.isArray(needOpts) ? `[${needOpts[need]}]` : '', message.trim()].filter(Boolean).join(' ')
      const { error: err } = await supabase.from('enterprise_inquiries').insert({
        company: company.trim() || null,
        name: name.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        message: msg || null,
      })
      if (err) throw new Error(err.message)
      setDone(true)
    } catch {
      setError(t('landing.enterpriseForm.error'))
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    // Reset so a re-open starts clean.
    setCompany('')
    setName('')
    setEmail('')
    setPhone('')
    setNeed(-1)
    setMessage('')
    setError('')
    setDone(false)
    onClose()
  }

  const label = 'mb-1 block text-[14px] font-medium text-ink'

  return (
    <Modal open={open} onClose={handleClose} title={t('landing.enterpriseForm.title')} width="max-w-xl">
      {done ? (
        <div className="py-6 text-center">
          <div className="mb-5 flex justify-center">
            <LogoMark size={52} />
          </div>
          <h3 className="display text-[34px] text-ink">{t('landing.enterpriseForm.successTitle')}</h3>
          <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-relaxed text-muted">{t('landing.enterpriseForm.successBody')}</p>
          <button onClick={handleClose} className="btn-accent mt-8">
            {t('landing.enterpriseForm.close')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="mb-7 text-[15px] leading-relaxed text-muted">{t('landing.enterpriseForm.sub')}</p>

          <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
            <label className="block">
              <span className={label}>{t('landing.enterpriseForm.company')}</span>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('landing.enterpriseForm.companyPlaceholder')}
                autoComplete="organization"
                className="field"
              />
            </label>
            <label className="block">
              <span className={label}>{t('landing.enterpriseForm.name')}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('landing.enterpriseForm.namePlaceholder')}
                autoComplete="name"
                className="field"
              />
            </label>
            <label className="block">
              <span className={label}>
                {t('landing.enterpriseForm.email')} <span className="text-accent">*</span>
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="field"
                aria-invalid={!!error && !emailOk}
              />
            </label>
            <label className="block">
              <span className={label}>
                {t('landing.enterpriseForm.phone')}{' '}
                <span className="text-[13px] font-normal text-faint">· {t('landing.enterpriseForm.phoneOptional')}</span>
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+48…"
                autoComplete="tel"
                inputMode="tel"
                className="field"
              />
            </label>
          </div>

          {Array.isArray(needOpts) && (
            <fieldset className="mt-7">
              <legend className={label}>{t('landing.enterpriseForm.need')}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {needOpts.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setNeed(need === i ? -1 : i)}
                    aria-pressed={need === i}
                    className={`chip ${need === i ? 'chip-accent' : ''}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <label className="mt-7 block">
            <span className={label}>{t('landing.enterpriseForm.message')}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={t('landing.enterpriseForm.messagePlaceholder')}
              className="field resize-y"
            />
          </label>

          {error && (
            <div role="alert" className="mt-6 border border-accent/50 bg-accentSoft px-3 py-2.5 text-[14px] text-ink">
              {error}
            </div>
          )}

          <a
            href="/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block text-[13px] text-faint underline decoration-line2 underline-offset-4 transition-colors hover:text-ink"
          >
            {t('landing.enterpriseForm.privacy')}
          </a>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleClose} className="btn-ghost">
              {t('landing.enterpriseForm.cancel')}
            </button>
            <button type="submit" disabled={busy || !email.trim()} className="btn-accent">
              {busy ? (
                <>
                  <Spinner /> {t('landing.enterpriseForm.sending')}
                </>
              ) : (
                t('landing.enterpriseForm.submit')
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
