import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { makeT, normalizeLang, DEFAULT_LANG, LANGUAGES, LANG_CODES } from '../lib/i18n'
import { setFormatLang } from '../lib/format'

const LangContext = createContext(null)
const CACHE_KEY = 'tf_lang'

// Source of truth for the language is profiles.language (backend). localStorage is
// only a pre-login cache so the login screen doesn't flash the wrong language and
// so a returning user sees their last choice instantly before the profile loads.
function initialLang() {
  // Returning visitors keep their last choice; everyone else defaults to Polish.
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached && LANG_CODES.includes(cached)) return cached
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG
}

export function LangProvider({ children }) {
  const { session, profile } = useAuth()
  const [lang, setLangState] = useState(initialLang)

  // Once the profile loads, its stored language wins (cross-device preference).
  useEffect(() => {
    if (profile?.language) {
      const l = normalizeLang(profile.language)
      setLangState(l)
      try {
        localStorage.setItem(CACHE_KEY, l)
      } catch {
        /* ignore */
      }
    }
  }, [profile?.language])

  // Keep the (non-React) formatters in sync during render so dates/sizes are
  // correct on the first paint, not one frame late.
  setFormatLang(lang)

  const setLang = useCallback(
    async (next) => {
      const l = normalizeLang(next)
      setLangState(l)
      setFormatLang(l)
      try {
        localStorage.setItem(CACHE_KEY, l)
      } catch {
        /* ignore */
      }
      // Persist to the backend profile when signed in (not localStorage-only).
      if (session?.user?.id) {
        await supabase.from('profiles').update({ language: l }).eq('id', session.user.id)
      }
    },
    [session?.user?.id],
  )

  const value = useMemo(
    () => ({ lang, setLang, t: makeT(lang), languages: LANGUAGES }),
    [lang, setLang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useT() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useT must be used within LangProvider')
  return ctx
}

export { DEFAULT_LANG }
