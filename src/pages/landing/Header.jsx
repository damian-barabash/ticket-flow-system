import { useEffect, useState } from 'react'
import { LogoMark } from '../../components/Logo'
import { useT } from '../../context/LangContext'
import { LangPills, scrollToId } from './kit'

export const NAV = ['features', 'useCases', 'compare', 'pricing', 'app', 'faq']

function useScrolled(threshold = 24) {
  const [s, setS] = useState(false)
  useEffect(() => {
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setS(window.scrollY > threshold)
      })
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [threshold])
  return s
}

export function Header({ session, go }) {
  const { t } = useT()
  const scrolled = useScrolled()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const section = (id) => {
    setOpen(false)
    // wait one frame so the body scroll lock is released before scrolling
    requestAnimationFrame(() => scrollToId(id))
  }
  const nav = (path) => {
    setOpen(false)
    go(path)
  }

  return (
    <>
      <header className={`lp-hdr fixed inset-x-0 top-0 z-50 ${scrolled || open ? 'solid' : ''}`}>
        <div className="lp-wrap flex h-16 items-center justify-between gap-4">
          <button
            onClick={() => (open ? setOpen(false) : window.scrollTo({ top: 0, behavior: 'smooth' }))}
            className="flex items-center gap-2.5"
            aria-label="Ticket Flow"
          >
            <LogoMark size={26} />
            <span className="whitespace-nowrap font-display text-[16px] font-extrabold uppercase leading-none tracking-[-0.01em] text-white">
              Ticket Flow
            </span>
          </button>

          <nav className="lp-nav hidden items-center gap-7 xl:flex" aria-label="Main">
            {NAV.map((id) => (
              <button
                key={id}
                onClick={() => section(id)}
                className="u text-[13px] font-semibold uppercase tracking-[0.06em] text-[#c8c8c8] transition-colors duration-150 hover:text-white"
              >
                {t('landing.nav.' + id)}
              </button>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-4 md:flex xl:ml-0">
            <LangPills className="hidden xl:flex" />
            {session ? (
              <button onClick={() => nav('/projects')} className="lp-btn !min-h-[40px] !px-5 !text-[13px]">
                {t('landing.nav.projects')}
              </button>
            ) : (
              <>
                <button
                  onClick={() => nav('/login')}
                  className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#c8c8c8] transition-colors duration-150 hover:text-white"
                >
                  {t('landing.nav.login')}
                </button>
                <button onClick={() => nav('/register')} className="lp-btn !min-h-[40px] !px-5 !text-[13px]">
                  {t('landing.nav.signup')}
                </button>
              </>
            )}
          </div>

          {/* mobile: burger ↔ always-visible close */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t('landing.nav.close') : t('landing.nav.menu')}
            aria-expanded={open}
            className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#3a3a3a] text-white transition-colors duration-150 hover:border-white xl:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              ) : (
                <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {open && (
        <div className="lp-menu fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-[#060606] xl:hidden" role="dialog" aria-modal="true">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(242,35,27,.35))]" />
          <div className="lp-wrap relative flex min-h-full flex-col pb-8 pt-6">
            <nav className="flex flex-col">
              {NAV.map((id, i) => (
                <button
                  key={id}
                  onClick={() => section(id)}
                  className="lp-menu-item lp-h flex items-center justify-between border-b border-[#1f1f1f] py-3 text-left text-[34px] text-white"
                  style={{ '--d': i }}
                >
                  {t('landing.nav.' + id)}
                  <span className="lp-mono text-[13px] font-normal text-[#f2231b]">0{i + 1}</span>
                </button>
              ))}
            </nav>
            <div className="mt-8 flex items-center justify-between gap-3">
              <span className="lp-label text-[#a8a8a8]">{t('topbar.lang')}</span>
              <LangPills />
            </div>
            <div className="mt-auto flex flex-col gap-3 pt-10">
              {session ? (
                <button onClick={() => nav('/projects')} className="lp-btn w-full">
                  {t('landing.nav.projects')}
                </button>
              ) : (
                <>
                  <button onClick={() => nav('/register')} className="lp-btn w-full">
                    {t('landing.hero.ctaPrimary')}
                  </button>
                  <button onClick={() => nav('/login')} className="lp-btn-ghost w-full">
                    {t('landing.nav.login')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
