import { useState } from 'react'
import { useT } from '../context/LangContext'

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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-xs leading-relaxed text-muted sm:text-[13px]">
          {t('cookies.text')}{' '}
          <a href="/cookies/" className="text-accent underline underline-offset-2 hover:text-ink">
            {t('cookies.more')}
          </a>
        </p>
        <button onClick={accept} className="btn-accent shrink-0 self-start sm:self-auto">
          {t('cookies.accept')}
        </button>
      </div>
    </div>
  )
}
