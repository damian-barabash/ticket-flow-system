import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Modal, Spinner } from './ui'
import { LogoMark } from './Logo'

// Public inquiry form for the Enterprise plan. Anyone (unauthenticated landing
// visitor) can submit; the row lands in `enterprise_inquiries` and is readable
// only by moderators (RLS). No auth required — uses the anon publishable key.
export function EnterpriseModal({ open, onClose }) {
  const { t } = useT()
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!emailOk) {
      setError(t('landing.enterpriseForm.emailInvalid'))
      return
    }
    setBusy(true)
    try {
      const { error: err } = await supabase.from('enterprise_inquiries').insert({
        company: company.trim() || null,
        name: name.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        message: message.trim() || null,
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
    setMessage('')
    setError('')
    setDone(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('landing.enterpriseForm.title')} width="max-w-lg">
      {done ? (
        <div className="py-4 text-center">
          <div className="mb-4 flex justify-center">
            <LogoMark size={44} />
          </div>
          <h3 className="text-lg font-semibold text-ink">{t('landing.enterpriseForm.successTitle')}</h3>
          <p className="mx-auto mt-2 max-w-[360px] text-sm text-muted">{t('landing.enterpriseForm.successBody')}</p>
          <button onClick={handleClose} className="btn-solid mt-6">
            {t('landing.enterpriseForm.close')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="mb-5 text-sm text-faint">{t('landing.enterpriseForm.sub')}</p>

          <label className="label mb-2 block">{t('landing.enterpriseForm.company')}</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t('landing.enterpriseForm.companyPlaceholder')}
            className="field mb-5"
          />

          <label className="label mb-2 block">{t('landing.enterpriseForm.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('landing.enterpriseForm.namePlaceholder')}
            className="field mb-5"
          />

          <label className="label mb-2 block">{t('landing.enterpriseForm.email')}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="field mb-5"
          />

          <label className="label mb-2 block">
            {t('landing.enterpriseForm.phone')}{' '}
            <span className="text-faint normal-case tracking-normal">· {t('landing.enterpriseForm.phoneOptional')}</span>
          </label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48…" className="field mb-5" />

          <label className="label mb-2 block">{t('landing.enterpriseForm.message')}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={t('landing.enterpriseForm.messagePlaceholder')}
            className="field mb-5 resize-y"
          />

          {error && <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={handleClose} className="btn-ghost">
              {t('landing.enterpriseForm.close')}
            </button>
            <button type="submit" disabled={busy || !email.trim()} className="btn-accent">
              {busy ? <Spinner className="border-bg/40 border-t-bg" /> : t('landing.enterpriseForm.submit')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
