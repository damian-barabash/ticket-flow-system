import { useT } from '../context/LangContext'

// Compact RU / PL / EN segmented switcher. Writes the choice to the backend
// profile (via LangContext.setLang) for signed-in users.
export function LangSwitch({ className = '' }) {
  const { lang, setLang, languages, t } = useT()
  return (
    <div
      className={`flex items-center border border-line ${className}`}
      role="group"
      aria-label={t('topbar.lang')}
    >
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.name}
          className={`px-2 py-1 font-mono uppercase tracking-label text-[10px] transition-colors ${
            lang === l.code ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
