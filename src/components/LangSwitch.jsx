import { useT } from '../context/LangContext'

// Compact RU / PL / EN segmented switcher. Writes the choice to the backend
// profile (via LangContext.setLang) for signed-in users.
export function LangSwitch({ className = '' }) {
  const { lang, setLang, languages, t } = useT()
  return (
    <div className={`flex h-10 items-stretch border border-line ${className}`} role="group" aria-label={t('topbar.lang')}>
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.name}
          className={`press px-2.5 font-mono text-[12px] font-medium uppercase transition-colors ${
            lang === l.code ? 'bg-ink text-bg' : 'text-muted hover:bg-surface2 hover:text-ink'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
