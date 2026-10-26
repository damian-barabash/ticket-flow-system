import { useRef, useState } from 'react'
import { useT } from '../../context/LangContext'
import { ScribbleArrow } from '../../components/icons'
import { LogoMark } from '../../components/Logo'
import { ArrowRight, R, useInView, scrollToId } from './kit'
import { APP_STORE, GOOGLE_PLAY } from './Commerce'
import { NAV } from './Header'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── final CTA: "READY TO MOVE YOUR TICKETS?" + underline form ────────────
export function FinalCta({ go, onEnterprise, session }) {
  const { t } = useT()
  const lines = t('landing.final.lines')
  const opts = t('landing.final.teamOpts')
  const [email, setEmail] = useState('')
  const [team, setTeam] = useState(0)
  const [err, setErr] = useState('')
  const ref = useRef(null)
  const seen = useInView(ref)
  const ent = team === 3

  const submit = (e) => {
    e.preventDefault()
    const m = email.trim()
    if (m && !EMAIL_RE.test(m)) {
      setErr(t('landing.final.emailBad'))
      return
    }
    setErr('')
    if (ent) {
      onEnterprise(m)
      return
    }
    if (session) {
      go('/projects')
      return
    }
    try {
      if (m) sessionStorage.setItem('tf_prefill_email', m)
    } catch {
      /* ignore */
    }
    go(m ? `/register?email=${encodeURIComponent(m)}` : '/register')
  }

  return (
    <section id="start" className="lp-wrap scroll-mt-20 pb-24 pt-16 sm:pb-32 sm:pt-24">
      <div className="grid gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <div ref={ref}>
          <p className="lp-kicker">{t('landing.final.kicker')}</p>
          <h2 className={`lp-h mt-4 text-[#f2231b] ${seen ? 'in' : ''}`} style={{ fontSize: 'clamp(38px, 6.4vw, 100px)' }}>
            {lines.map((l, i) => (
              <span key={i} className="ll" style={{ '--d': i }}>
                <span>
                  {i === lines.length - 1 ? (
                    <>
                      {l.split(' ').slice(0, -1).join(' ')} {/* keep the last word glued to the arrow */}
                      <span className="whitespace-nowrap">
                        {l.split(' ').slice(-1)[0]}
                        <ScribbleArrow className="ml-[0.1em] inline-block h-auto w-[0.95em] align-[0.05em] text-white" />
                      </span>
                    </>
                  ) : (
                    l
                  )}
                </span>
              </span>
            ))}
          </h2>
          <div className="mt-6 flex max-w-[520px] justify-between gap-6 text-[13px] font-medium leading-snug text-[#f2231b]">
            <span className="max-w-[20ch]">{t('landing.final.capL')}</span>
            <span className="max-w-[20ch] text-right">{t('landing.final.capR')}</span>
          </div>
        </div>

        <R as="form" d={1} onSubmit={submit} className="flex flex-col justify-end" noValidate>
          <label className="block">
            <span className="text-[14px] font-medium text-white">{t('landing.final.email')}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (err) setErr('')
              }}
              placeholder={t('landing.final.emailPh')}
              className="lp-field mt-1"
              aria-invalid={!!err}
            />
          </label>
          {err && <span className="mt-2 text-[13px] font-medium text-[#ff5148]">{err}</span>}

          <fieldset className="mt-9 border-b border-[#5a5a5a] pb-5">
            <legend className="text-[14px] font-medium text-white">{t('landing.final.team')}</legend>
            <div className="mt-4 flex flex-wrap gap-2">
              {opts.map((o, i) => (
                <button key={i} type="button" onClick={() => setTeam(i)} aria-pressed={team === i} className="lp-chip red">
                  {o}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
            <p className="max-w-[26ch] text-[14px] leading-snug text-[#d6d6d6]">{t('landing.final.note')}</p>
            <button type="submit" className="lp-link text-[17px]">
              {ent ? t('landing.final.ctaEnt') : session ? t('landing.nav.projects') : t('landing.final.cta')} <ArrowRight />
            </button>
          </div>
        </R>
      </div>
    </section>
  )
}

// ── footer: black → red blaze, columns, nav row, giant wordmark ──────────
export function Footer({ go }) {
  const { t } = useT()
  const col = 'text-[13px] font-bold uppercase tracking-[0.04em] text-white'
  const lnk = 'text-[15px] text-white/85 underline-offset-4 transition-colors duration-150 hover:text-white hover:underline'
  return (
    <footer className="lp-blaze relative">
      <div className="lp-wrap pt-40 sm:pt-56">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <p className={col}>{t('landing.footer.discuss')}</p>
            <a href="mailto:dbdcstudio@gmail.com" className={`${lnk} mt-2 inline-block break-all`}>
              dbdcstudio@gmail.com
            </a>
          </div>
          <div>
            <p className={col}>{t('landing.footer.legal')}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <a href="/privacy/" className={lnk}>
                {t('landing.footer.privacy')}
              </a>
              <a href="/refund/" className={lnk}>
                {t('landing.footer.refund')}
              </a>
              <a href="/cookies/" className={lnk}>
                {t('landing.footer.cookies')}
              </a>
            </div>
          </div>
          <div className="sm:text-right">
            <p className={col}>{t('landing.footer.apps')}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className={lnk}>
                App Store
              </a>
              <a href={GOOGLE_PLAY} target="_blank" rel="noopener noreferrer" className={lnk}>
                Google Play
              </a>
              <button onClick={() => go('/login')} className={lnk}>
                Web
              </button>
            </div>
          </div>
        </div>

        <nav className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-b sm:justify-between border-white/70 pb-3" aria-label="Footer">
          {NAV.slice(0, 5).map((id) => (
            <button key={id} onClick={() => scrollToId(id)} className="text-[14px] text-white/90 transition-colors duration-150 hover:text-white">
              {t('landing.nav.' + id).toLowerCase()}
            </button>
          ))}
        </nav>

        <svg className="lp-word mt-4 sm:mt-6" viewBox="0 0 1000 132" role="img" aria-label="Ticket Flow">
          <text x="0" y="128" fill="#fff" fontSize="172" textLength="1000" lengthAdjust="spacingAndGlyphs">
            TICKET FLOW
          </text>
        </svg>

        <div className="flex flex-col gap-3 py-6 text-[12px] font-medium uppercase tracking-[0.04em] text-white sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center bg-white">
              <LogoMark size={16} />
            </span>
            {t('landing.footer.copy')}
          </span>
          <span>{t('landing.footer.designed')}</span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-left uppercase hover:underline sm:text-right">
            {t('landing.footer.top')} ↑
          </button>
        </div>
      </div>
    </footer>
  )
}
