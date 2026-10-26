import { useState } from 'react'
import { useT } from '../context/LangContext'
import { Icon } from './ui'

const KEY = 'tf_cookie_consent'

// Site-wide cookie notice. Shows once until accepted; the choice is persisted in
// localStorage so it never re-appears. We only use strictly-necessary / functional
// storage (auth session, language, theme), so a single "Accept" is enough.
export function CookieConsent() {
  const { t } = useT()
  // Lazy init from localStorage to avoid a flash for users who already accepted.
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'accepted'
    } catch {
      return true
    }
  })

  if (!visible) return null

  function accept() {
    try {
      localStorage.setItem(KEY, 'accepted')
    } catch {
      /* ignore (private mode / storage disabled) */
    }
    setVisible(false)
  }

  return (
    <div className="toast-in fixed inset-x-0 bottom-0 z-[45] border-t border-line2 bg-surface" role="dialog" aria-label={t('cookies.accept')} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-[14px] leading-relaxed text-muted">
          {t('cookies.text')}{' '}
          <a href="./cookies/" className="font-semibold text-accent underline underline-offset-4 hover:text-ink">
            {t('cookies.more')}
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={accept} className="btn-accent btn-sm flex-1 sm:flex-none">
            <Icon name="check" size={15} /> {t('cookies.accept')}
          </button>
          <button onClick={accept} className="icon-btn" aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
