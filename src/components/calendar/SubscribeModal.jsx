import { useEffect, useState } from 'react'
import { useT } from '../../context/LangContext'
import { feedLinks, getFeedToken } from '../../lib/calendar'
import { downloadText } from '../../lib/ics'
import { ErrorState, Icon, Modal, Spinner, useConfirm } from '../ui'

// Personal iCal subscription: copy URL, one-click subscribe in Google / Apple /
// Outlook, download a snapshot .ics, or rotate the secret link.
export function SubscribeModal({ open, onClose }) {
  const { t } = useT()
  const [token, setToken] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState('')
  const confirm = useConfirm()

  async function load(reset = false) {
    if (!reset) setState('loading')
    try {
      const tok = await getFeedToken(reset)
      setToken(tok)
      setState('ready')
    } catch {
      setState('error')
    }
  }
  useEffect(() => {
    if (open && !token) load()
  }, [open])

  const links = token ? feedLinks(token) : null

  async function copy() {
    try {
      await navigator.clipboard.writeText(links.https)
    } catch {
      const el = document.getElementById('feed-url')
      el?.select()
      document.execCommand?.('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  async function download() {
    setBusy('ics')
    try {
      const r = await fetch(links.https)
      if (!r.ok) throw new Error()
      downloadText(await r.text(), 'ticket-flow.ics')
    } catch {
      window.open(links.https, '_blank', 'noreferrer')
    } finally {
      setBusy('')
    }
  }
  async function reset() {
    if (!(await confirm({ title: t('cal.sub.reset'), body: t('cal.sub.resetConfirm'), confirmLabel: t('cal.sub.reset'), danger: true }))) return
    setBusy('reset')
    await load(true)
    setBusy('')
  }

  const Btn = ({ href, icon, label, sub, onClick, loading }) => {
    const cls = 'group flex items-center gap-3 border border-line bg-bg px-4 py-3 text-left transition-colors hover:border-ink'
    const inner = (
      <>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line2 text-ink group-hover:border-accent group-hover:text-accent">
          {loading ? <Spinner /> : <Icon name={icon} size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{label}</span>
          <span className="block text-[13px] text-faint">{sub}</span>
        </span>
        <Icon name={href ? 'external' : 'download'} size={16} className="text-faint" />
      </>
    )
    return href ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    ) : (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={t('cal.sub.title')} width="max-w-xl">
      {state === 'loading' ? (
        <div className="flex justify-center py-14">
          <Spinner size={22} />
        </div>
      ) : state === 'error' ? (
        <ErrorState onRetry={() => load()} onClose={onClose} />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] text-muted">{t('cal.sub.intro')}</p>
          <div>
            <label className="field-label mb-1.5">{t('cal.sub.url')}</label>
            <div className="flex">
              <input id="feed-url" readOnly value={links.https} onFocus={(e) => e.target.select()} className="input-box num min-w-0 flex-1 text-[13px]" />
              <button onClick={copy} className={`btn-sm btn min-h-[46px] border border-l-0 ${copied ? 'border-ok bg-ok text-bg' : 'border-line bg-ink text-bg hover:bg-white'}`}>
                <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? t('cal.sub.copied') : t('cal.sub.copy')}
              </button>
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-faint">
              <Icon name="lock" size={14} className="mt-[3px]" /> {t('cal.sub.private')}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Btn href={links.google} icon="globe" label="Google Calendar" sub={t('cal.sub.google')} />
            <Btn href={links.webcal} icon="calendar" label="Apple Calendar" sub={t('cal.sub.apple')} />
            <Btn href={links.outlook} icon="mail" label="Outlook" sub={t('cal.sub.outlook')} />
            <Btn onClick={download} icon="download" label={t('cal.sub.download')} sub={t('cal.sub.downloadHint')} loading={busy === 'ics'} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="max-w-sm text-[13px] text-faint">{t('cal.sub.resetHint')}</p>
            <button onClick={reset} className="btn-danger btn-sm" disabled={busy === 'reset'}>
              {busy === 'reset' ? <Spinner /> : <Icon name="refresh" size={15} />} {t('cal.sub.reset')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
