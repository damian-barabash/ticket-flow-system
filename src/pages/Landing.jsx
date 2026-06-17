import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { LogoMark } from '../components/Logo'
import { LangSwitch } from '../components/LangSwitch'
import { STATUS } from '../lib/constants'

// Scroll-reveal: toggle .is-in on every .reveal as it enters the viewport.
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'))
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.12 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// true once the page is scrolled — drives the floating "matte" header.
function useScrolled(threshold = 16) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const DEMO_STATUSES = ['new', 'in_progress', 'unclear', 'on_hold', 'done']
const DEMO_PROGRESS = { new: 8, in_progress: 55, unclear: 30, on_hold: 45, done: 100 }

export default function Landing() {
  const { t } = useT()
  const { session } = useAuth()
  const navigate = useNavigate()
  useReveal()
  const scrolled = useScrolled()

  const [demoStatus, setDemoStatus] = useState('new')
  const [yearly, setYearly] = useState(false)
  const [faqOpen, setFaqOpen] = useState(0)
  const [useCase, setUseCase] = useState(1)
  const [feat, setFeat] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  // Light theme lives ONLY on the landing (the panel stays dark). Persisted locally.
  const [light, setLight] = useState(() => {
    try {
      return localStorage.getItem('tf_landing_theme') === 'light'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('tf_landing_theme', light ? 'light' : 'dark')
    } catch {
      /* ignore */
    }
  }, [light])

  // Close the mobile menu on Esc; lock body scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const go = (path) => {
    setMenuOpen(false)
    navigate(path)
  }
  const goSection = (id) => {
    setMenuOpen(false)
    scrollTo(id)
  }
  const navItems = [
    ['useCases', t('landing.useCases.label')],
    ['features', t('landing.features.label')],
    ['compare', t('landing.compare.label')],
    ['pricing', t('landing.pricing.label')],
    ['app', t('landing.app.label')],
    ['faq', t('landing.faq.label')],
  ]

  return (
    <div className={`relative min-h-screen overflow-x-hidden bg-bg text-ink ${light ? 'theme-light' : ''}`}>
      {/* ───────────────────────── FIXED / FLOATING HEADER */}
      <header className="fixed inset-x-0 top-0 z-50">
        {/* outer layer adds side/top insets when scrolled; inner stays centred (mx-auto) */}
        <div className={`transition-all duration-300 ${scrolled ? 'px-3 pt-3 sm:px-8' : 'px-0 pt-0'}`}>
        <div
          className={`mx-auto flex items-center justify-between transition-all duration-300 ${
            scrolled
              ? 'max-w-[1160px] rounded-2xl border border-line glass px-5 py-3 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]'
              : 'max-w-[1240px] rounded-none border-b border-line bg-bg/70 px-5 py-4 backdrop-blur sm:px-8'
          }`}
        >
          <button onClick={() => go('/')} className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <LogoMark size={24} />
            <span className="font-mono uppercase tracking-label text-[13px] text-ink">Ticket Flow</span>
          </button>
          <nav className="hidden items-center gap-7 md:flex">
            {navItems.map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="label hover:text-ink transition-colors">
                {label}
              </button>
            ))}
          </nav>

          {/* Desktop: full inline cluster */}
          <div className="hidden items-center gap-3 md:flex md:gap-4">
            <ThemeToggle light={light} onToggle={() => setLight((v) => !v)} />
            <LangSwitch />
            {session ? (
              <button onClick={() => go('/projects')} className="btn-accent !px-5 !py-2.5">
                {t('projects.heading')}
              </button>
            ) : (
              <>
                <button onClick={() => go('/login')} className="label hover:text-ink transition-colors">
                  {t('landing.nav.login')}
                </button>
                <button onClick={() => go('/register')} className="btn-accent !px-5 !py-2.5">
                  {t('landing.nav.signup')}
                </button>
              </>
            )}
          </div>

          {/* Mobile: burger button */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t('topbar.menu')}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center border border-line text-muted transition-colors hover:text-ink md:hidden"
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            )}
          </button>
        </div>
        </div>

        {/* Mobile dropdown panel */}
        {menuOpen && (
          <div className="md:hidden">
            <div className="fixed inset-0 top-0 -z-10 bg-black/50" onClick={() => setMenuOpen(false)} />
            <div className="mx-3 mt-2 rounded-2xl border border-line glass p-4 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]">
              <nav className="flex flex-col">
                {navItems.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => goSection(id)}
                    className="label py-2.5 text-left hover:text-ink transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="my-3 border-t border-line" />

              <div className="flex items-center justify-between">
                <span className="label">{t('topbar.lang')}</span>
                <div className="flex items-center gap-3">
                  <LangSwitch />
                  <ThemeToggle light={light} onToggle={() => setLight((v) => !v)} />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {session ? (
                  <button onClick={() => go('/projects')} className="btn-accent w-full">
                    {t('projects.heading')}
                  </button>
                ) : (
                  <>
                    <button onClick={() => go('/register')} className="btn-accent w-full">
                      {t('landing.nav.signup')}
                    </button>
                    <button onClick={() => go('/login')} className="btn-ghost w-full">
                      {t('landing.nav.login')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
      <div aria-hidden className="h-[72px]" />

      {/* ───────────────────────── HERO */}
      <section className="dotgrid relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora absolute -left-[10%] top-[-20%] h-[520px] w-[520px] rounded-full bg-accent/20 blur-[120px]" />
          <div className="aurora absolute right-[-10%] top-[6%] h-[460px] w-[460px] rounded-full bg-legend/15 blur-[130px]" style={{ animationDelay: '-6s' }} />
        </div>
        {/* faint oversized logo watermark */}
        <div className="pointer-events-none absolute -right-10 bottom-0 -z-10 opacity-[0.04]">
          <LogoMark size={420} />
        </div>

        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <div className="reveal flex flex-col items-start justify-center">
            <LogoMark size={40} />
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[56px]">
              {t('landing.hero.line1')}{' '}
              <span className="grad-accent">{t('landing.hero.line2')}</span>
            </h1>
            <p className="mt-6 max-w-[540px] text-[15px] leading-relaxed text-muted">{t('landing.hero.sub')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={() => go('/register')} className="btn-accent">{t('landing.hero.ctaPrimary')}</button>
              <button onClick={() => go('/login')} className="btn-ghost">{t('landing.hero.ctaSecondary')}</button>
            </div>
            <p className="mt-6 text-xs text-muted">{t('landing.hero.trust')}</p>
          </div>

          {/* floating ticket mock */}
          <div className="reveal flex items-center justify-center" style={{ transitionDelay: '120ms' }}>
            <div className="float relative w-full max-w-[400px]">
              <div className="relative border border-line2 bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 label">
                    <LogoMark size={14} />
                    {t('landing.hero.demoTag')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 label" style={{ color: STATUS.new.text }}>
                    <span className="inline-block h-1.5 w-1.5" style={{ background: STATUS.new.dot }} />
                    {t('landing.hero.demoNew')}
                  </span>
                </div>
                <div className="perforation my-4" />
                <h3 className="text-[15px] font-medium text-ink">{t('landing.hero.demoTitle')}</h3>
                <p className="mt-2 text-xs leading-relaxed text-faint">{t('landing.hero.demoDesc')}</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="dotgrid h-12 w-12 border border-line" />
                  <div className="dotgrid h-12 w-12 border border-line" />
                  <span className="label">+2</span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
                  <span className="label">RU · PL · EN</span>
                  <span className="label" style={{ color: STATUS.in_progress.text }}>● realtime</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── USE CASES (interactive) */}
      <Section id="useCases">
        <SectionHead label={t('landing.useCases.label')} title={t('landing.useCases.title')} sub={t('landing.useCases.sub')} />
        <div className="reveal grid gap-5 lg:grid-cols-[320px_1fr]">
          {/* clickable tabs */}
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => {
              const active = useCase === i
              return (
                <button
                  key={i}
                  onClick={() => setUseCase(i)}
                  className={`flex items-center gap-3 border px-4 py-4 text-left transition-colors ${
                    active ? 'border-accent bg-accentSoft' : 'border-line hover:border-line2'
                  }`}
                >
                  <span className={`font-mono text-sm ${active ? 'text-accent' : 'text-faint'}`}>0{i}</span>
                  <span className={`text-sm ${active ? 'text-ink' : 'text-muted'}`}>{t(`landing.useCases.tab${i}`)}</span>
                </button>
              )
            })}
          </div>
          {/* detail panel */}
          <div key={useCase} className="pop flex flex-col justify-center border border-line2 bg-surface p-8">
            <LogoMark size={26} />
            <h3 className="mt-4 text-xl font-medium text-ink">{t(`landing.useCases.t${useCase}t`)}</h3>
            <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-muted">{t(`landing.useCases.t${useCase}d`)}</p>
          </div>
        </div>
      </Section>

      {/* ───────────────────────── PROBLEM (static, no hover) */}
      <Section id="problem">
        <SectionHead label={t('landing.problem.label')} title={t('landing.problem.title')} sub={t('landing.problem.sub')} />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="reveal border border-line bg-surface p-6" style={{ transitionDelay: `${i * 80}ms` }}>
              <div className="font-mono text-2xl text-accent">0{i}</div>
              <h3 className="mt-3 text-[15px] font-medium text-ink">{t(`landing.problem.p${i}t`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-faint">{t(`landing.problem.p${i}d`)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ───────────────────────── INTERACTIVE DEMO */}
      <Section id="demo">
        <SectionHead label={t('landing.demo.label')} title={t('landing.demo.title')} sub={t('landing.demo.sub')} />
        <div className="reveal mx-auto max-w-[760px] border border-line2 bg-surface p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="flex items-center gap-2 label">
                <LogoMark size={14} />
                {t('landing.hero.demoTag').replace('014', '021')}
              </span>
              <h3 className="mt-2 text-lg font-medium text-ink">{t('landing.demo.ticketTitle')}</h3>
              <p className="mt-1.5 max-w-[460px] text-sm text-faint">{t('landing.demo.ticketDesc')}</p>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-2 border px-3 py-1.5 label transition-colors"
              style={{ color: STATUS[demoStatus].text, borderColor: STATUS[demoStatus].dot + '66' }}
            >
              <span className="inline-block h-2 w-2 transition-colors" style={{ background: STATUS[demoStatus].dot }} />
              {t('enum.status.' + demoStatus)}
            </span>
          </div>

          <div className="mt-6 h-1.5 w-full overflow-hidden bg-surface2">
            <div className="h-full transition-all duration-500" style={{ width: DEMO_PROGRESS[demoStatus] + '%', background: STATUS[demoStatus].dot }} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="label mr-1">{t('landing.demo.hint')} →</span>
            {DEMO_STATUSES.map((s) => {
              const active = s === demoStatus
              return (
                <button
                  key={s}
                  onClick={() => setDemoStatus(s)}
                  className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-label transition-all ${
                    active ? 'text-bg' : 'text-muted hover:border-line2'
                  }`}
                  style={active ? { background: STATUS[s].dot, borderColor: STATUS[s].dot } : { borderColor: '#262629' }}
                >
                  {t('enum.status.' + s)}
                </button>
              )
            })}
          </div>
        </div>
      </Section>

      {/* ───────────────────────── FEATURES (interactive selector) */}
      <Section id="features">
        <SectionHead label={t('landing.features.label')} title={t('landing.features.title')} />
        <div className="reveal grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {[1, 2, 3, 4, 5, 6].map((i) => {
              const active = feat === i
              return (
                <button
                  key={i}
                  onClick={() => setFeat(i)}
                  className={`flex items-center gap-3 border px-4 py-3 text-left transition-colors ${
                    active ? 'border-accent bg-accentSoft' : 'border-line hover:border-line2'
                  }`}
                >
                  <span className={`font-mono text-xs ${active ? 'text-accent' : 'text-faint'}`}>{String(i).padStart(2, '0')}</span>
                  <span className={`text-sm ${active ? 'text-ink' : 'text-muted'}`}>{t(`landing.features.f${i}t`)}</span>
                </button>
              )
            })}
          </div>
          <div key={feat} className="pop flex flex-col border border-line2 bg-surface p-6">
            <FeatureViz index={feat} />
            <h3 className="mt-6 text-xl font-medium text-ink">{t(`landing.features.f${feat}t`)}</h3>
            <p className="mt-2 max-w-[460px] text-[15px] leading-relaxed text-muted">{t(`landing.features.f${feat}d`)}</p>
          </div>
        </div>
      </Section>

      {/* ───────────────────────── WHY (static, no hover) */}
      <Section id="why">
        <SectionHead label={t('landing.why.label')} title={t('landing.why.title')} sub={t('landing.why.sub')} />
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="reveal bg-surface p-7" style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-block h-2 w-2 shrink-0 bg-accent" />
                <div>
                  <h3 className="text-base font-medium text-ink">{t(`landing.why.w${i}t`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-faint">{t(`landing.why.w${i}d`)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ───────────────────────── COMPARE */}
      <Section id="compare">
        <SectionHead label={t('landing.compare.label')} title={t('landing.compare.title')} sub={t('landing.compare.sub')} />
        <div className="reveal overflow-hidden border border-line">
          <div className="grid grid-cols-[1.6fr_1fr_1fr] bg-surface2">
            <div className="px-4 py-3 sm:px-6" />
            <div className="px-3 py-3 text-center sm:px-6">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-accent">
                <LogoMark size={13} />
                {t('landing.compare.colUs')}
              </span>
            </div>
            <div className="px-3 py-3 text-center sm:px-6">
              <span className="label">{t('landing.compare.colThem')}</span>
            </div>
          </div>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="grid grid-cols-[1.6fr_1fr_1fr] border-t border-line">
              <div className="px-4 py-4 text-[13px] text-ink sm:px-6">{t(`landing.compare.r${i}f`)}</div>
              <div className="flex items-center justify-center px-3 py-4 text-center text-[13px] font-medium text-ok sm:px-6">
                <span className="mr-1.5 text-ok">✓</span>{t(`landing.compare.r${i}u`)}
              </div>
              <div className="flex items-center justify-center px-3 py-4 text-center text-[13px] text-faint sm:px-6">
                {t(`landing.compare.r${i}x`)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ───────────────────────── PRICING */}
      <Section id="pricing">
        <SectionHead label={t('landing.pricing.label')} title={t('landing.pricing.title')} sub={t('landing.pricing.sub')} />

        <div className="reveal mb-8 flex items-center justify-center">
          <div className="inline-flex border border-line p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-4 py-2 font-mono text-[11px] uppercase tracking-label transition-colors ${!yearly ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {t('landing.pricing.monthly')}
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-4 py-2 font-mono text-[11px] uppercase tracking-label transition-colors ${yearly ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {t('landing.pricing.yearly')}
            </button>
          </div>
        </div>

        <div className="reveal mx-auto max-w-[460px]">
          <div className="relative border border-accent/40 bg-surface p-8 shadow-[0_0_60px_-20px_rgba(255,46,46,0.4)]">
            {/* faint logo watermark in the card */}
            <div className="pointer-events-none absolute right-4 top-4 opacity-[0.06]">
              <LogoMark size={120} />
            </div>
            <div className="flex items-center justify-between">
              <span className="label">{t('landing.pricing.planName')}</span>
              <span className="border border-accent/40 bg-accentSoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                {t('landing.pricing.planTag')}
              </span>
            </div>

            <div className="mt-6 flex items-end gap-2">
              <span key={yearly ? 'y' : 'm'} className="pop text-5xl font-semibold tracking-tight text-ink">
                {yearly ? t('landing.pricing.curYearly') : t('landing.pricing.curMonthly')}
              </span>
              <span className="mb-2 text-sm text-faint">
                {yearly ? t('landing.pricing.perYear') : t('landing.pricing.perMonth')}
              </span>
            </div>
            {yearly ? (
              <p className="mt-2 text-xs text-ok">★ {t('landing.pricing.save')} — {t('landing.pricing.yearlyHint')}</p>
            ) : (
              <p className="mt-2 text-xs text-faint">{t('landing.pricing.guarantee')}</p>
            )}

            <div className="perforation my-6" />

            <ul className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
                  <span className="mt-0.5 text-ok">✓</span>
                  {t(`landing.pricing.i${i}`)}
                </li>
              ))}
            </ul>

            <button onClick={() => go('/register')} className="btn-accent mt-8 w-full">
              {t('landing.pricing.cta')}
            </button>
          </div>
        </div>
      </Section>

      {/* ───────────────────────── FAQ */}
      <Section id="faq">
        <SectionHead label={t('landing.faq.label')} title={t('landing.faq.title')} />
        <div className="reveal mx-auto max-w-[760px] divide-y divide-line border border-line">
          {[1, 2, 3, 4].map((i) => {
            const open = faqOpen === i
            return (
              <div key={i}>
                <button
                  onClick={() => setFaqOpen(open ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface2 sm:px-6"
                >
                  <span className="text-[15px] text-ink">{t(`landing.faq.q${i}`)}</span>
                  <span className={`shrink-0 font-mono text-accent transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
                </button>
                {open && <div className="pop px-5 pb-5 text-sm leading-relaxed text-faint sm:px-6">{t(`landing.faq.a${i}`)}</div>}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ───────────────────────── FINAL CTA */}
      <section className="dotgrid relative overflow-hidden border-y border-line">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]" />
        </div>
        <div className="reveal mx-auto max-w-[760px] px-5 py-24 text-center sm:px-8">
          <div className="mb-6 flex justify-center">
            <LogoMark size={52} />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t('landing.final.title')}</h2>
          <p className="mt-4 text-[15px] text-muted">{t('landing.final.sub')}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => go('/register')} className="btn-accent">{t('landing.final.cta')}</button>
            <button onClick={() => go('/login')} className="btn-ghost">{t('landing.final.secondary')}</button>
          </div>
        </div>
      </section>

      {/* ───────────────────────── MOBILE APP */}
      <Section id="app">
        <SectionHead label={t('landing.app.label')} title={t('landing.app.title')} sub={t('landing.app.sub')} />
        <div className="reveal grid items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <ul className="space-y-4">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 inline-block h-2 w-2 shrink-0 bg-accent" />
                  <span className="text-[15px] leading-relaxed text-muted">{t(`landing.app.p${i}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <StoreBadge src="./appstore-badge.svg" alt="App Store" soon={t('landing.app.soon')} />
              <StoreBadge src="./googleplay-badge.png" alt="Google Play" soon={t('landing.app.soon')} />
            </div>
            <p className="mt-4 font-mono uppercase tracking-label text-[10px] text-faint">{t('landing.app.note')}</p>
          </div>
          <div className="flex justify-center">
            <PhoneMockup t={t} />
          </div>
        </div>
      </Section>

      {/* ───────────────────────── FOOTER */}
      <footer className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row sm:px-8">
        <div className="flex items-center gap-3">
          <LogoMark size={28} />
          <span className="max-w-[360px] text-xs text-faint">{t('landing.footer.tagline')}</span>
        </div>
        <span className="label">{t('landing.footer.copy')}</span>
      </footer>
    </div>
  )
}

// Sun / moon toggle for the landing-only light theme.
function ThemeToggle({ light, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label="theme"
      className="flex h-9 w-9 items-center justify-center border border-line text-muted transition-colors hover:text-ink"
    >
      {light ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

function Cursor({ className = '' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 3l14 7-6 2-2 6-6-15z" fill="#EDEDED" stroke="#0A0A0B" strokeWidth="1.2" />
    </svg>
  )
}

// Official store badge image (placeholder — not linked yet, "soon" chip).
function StoreBadge({ src, alt, soon }) {
  return (
    <div className="relative cursor-default select-none">
      <img src={src} alt={alt} draggable={false} className="h-[52px] w-auto" />
      <span className="absolute -right-2 -top-2 border border-accent/50 bg-bg px-1.5 py-0.5 font-mono uppercase tracking-label text-[8px] text-accent">
        {soon}
      </span>
    </div>
  )
}

// Faux phone showing a mini ticket board — brand-consistent app preview.
function PhoneMockup({ t }) {
  const rows = [
    { n: '014', s: 'new', title: t('landing.hero.demoTitle') },
    { n: '012', s: 'in_progress', title: t('landing.demo.ticketTitle') },
    { n: '009', s: 'done', title: t('landing.app.title') },
  ]
  return (
    <div className="float relative">
      <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[80px] bg-accent/10 blur-[70px]" />
      <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[80px] bg-legend/10 blur-[80px]" style={{ transform: 'translateX(20px)' }} />
      <div className="relative w-[264px] rounded-[46px] border border-line2 bg-bg p-3 shadow-[0_45px_100px_-30px_rgba(0,0,0,0.85)]">
        <div className="absolute left-1/2 top-[18px] z-10 h-5 w-28 -translate-x-1/2 rounded-full bg-line/90" />
        <div className="dotgrid min-h-[560px] overflow-hidden rounded-[36px] border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 pb-3 pt-8">
            <span className="flex items-center gap-2">
              <LogoMark size={15} />
              <span className="font-mono uppercase tracking-label text-[9px] text-ink">Ticket Flow</span>
            </span>
            <span className="font-mono uppercase tracking-label text-[8px] text-accent">PL</span>
          </div>
          <div className="space-y-2.5 p-4">
            <span className="font-mono uppercase tracking-label text-[8px] text-faint">{t('project.tabActive')}</span>
            {rows.map((tk, i) => (
              <div key={i} className="flex overflow-hidden border border-line bg-bg">
                <span className="w-[3px] shrink-0" style={{ background: STATUS[tk.s].dot }} />
                <div className="min-w-0 flex-1 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8px] text-faint">№ {tk.n}</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: STATUS[tk.s].text }}>
                      <span className="inline-block h-1 w-1" style={{ background: STATUS[tk.s].dot }} />
                      <span className="font-mono uppercase tracking-label text-[7px]">{t('enum.status.' + tk.s)}</span>
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-ink">{tk.title}</p>
                </div>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-center gap-1.5 border border-dashed border-line2 py-2 text-faint">
              <span className="text-[12px]">＋</span>
              <span className="font-mono uppercase tracking-label text-[8px]">{t('project.newTicket')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Per-feature ambient animation shown in the right panel of the Features selector.
function FeatureViz({ index }) {
  const { t } = useT()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1300)
    return () => clearInterval(id)
  }, [])

  const box = 'relative grid h-[200px] place-items-center overflow-hidden border border-line bg-bg/40'

  // 01 — drag a photo into a dropzone, mouse cursor follows
  if (index === 1) {
    return (
      <div className={box}>
        <div className="grid h-20 w-28 place-items-center border border-dashed border-line2">
          <div className="viz-land dotgrid h-12 w-12 border border-accent/50" />
        </div>
        <div className="viz-drag absolute left-1/2 top-1/2 -ml-6 -mt-6">
          <div className="dotgrid h-12 w-12 border border-accent/60 bg-surface shadow-lg" />
          <Cursor className="absolute -bottom-2 -right-2" />
        </div>
      </div>
    )
  }

  // 02 — status cycling with progress
  if (index === 2) {
    const s = DEMO_STATUSES[tick % DEMO_STATUSES.length]
    return (
      <div className={box}>
        <div className="flex flex-col items-center gap-4">
          <span
            key={s}
            className="pop inline-flex items-center gap-2 border px-4 py-2 font-mono text-xs uppercase tracking-label"
            style={{ color: STATUS[s].text, borderColor: STATUS[s].dot + '66' }}
          >
            <span className="h-2 w-2" style={{ background: STATUS[s].dot }} />
            {t('enum.status.' + s)}
          </span>
          <div className="h-1 w-40 overflow-hidden bg-surface2">
            <div className="h-full transition-all duration-500" style={{ width: DEMO_PROGRESS[s] + '%', background: STATUS[s].dot }} />
          </div>
        </div>
      </div>
    )
  }

  // 03 — thread bubbles appearing
  if (index === 3) {
    const n = (tick % 3) + 1
    const bubbles = [
      { me: false, w: 'w-32' },
      { me: true, w: 'w-24' },
      { me: false, w: 'w-28' },
    ]
    return (
      <div className={`${box} !block p-5`}>
        <div className="flex h-full flex-col justify-end gap-2">
          {bubbles.slice(0, n).map((b, i) => (
            <div key={`${tick}-${i}`} className={`pop h-7 rounded-md ${b.w} ${b.me ? 'self-end bg-accent/80' : 'self-start bg-surface2'}`} />
          ))}
        </div>
      </div>
    )
  }

  // 04 — release download progress
  if (index === 4) {
    return (
      <div className={box}>
        <div className="w-full max-w-[260px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-ink">build-v1.2.0.zip</span>
            <span className="text-accent">↓</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden bg-surface2">
            <div className="viz-fill h-full bg-accent" />
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-faint">v1.2.0 · 3 / 4</div>
        </div>
      </div>
    )
  }

  // 05 — goal countdown
  if (index === 5) {
    const days = 6 - (tick % 7)
    const color = days <= 1 ? '#FF2E2E' : days <= 3 ? '#E3B341' : '#A974FF'
    return (
      <div className={box}>
        <div className="w-full max-w-[240px] border p-4" style={{ borderColor: color + '66', boxShadow: `0 0 40px -18px ${color}` }}>
          <div className="font-mono text-[10px] uppercase tracking-label text-faint">{t('deadlines.heading')}</div>
          <div className="mt-1 text-sm text-ink">Launch v1.0</div>
          <div key={days} className="pop mt-3 text-4xl font-semibold" style={{ color }}>
            {days}
            <span className="text-base text-faint"> dni</span>
          </div>
        </div>
      </div>
    )
  }

  // 06 — language switch
  const langs = ['ru', 'pl', 'en']
  const hello = { ru: 'Привет', pl: 'Cześć', en: 'Hello' }
  const li = tick % 3
  return (
    <div className={box}>
      <div className="flex flex-col items-center gap-4">
        <div key={li} className="pop text-3xl font-semibold text-ink">{hello[langs[li]]}</div>
        <div className="flex gap-2">
          {langs.map((l, i) => (
            <span
              key={l}
              className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label ${i === li ? 'border-accent text-accent' : 'border-line text-faint'}`}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Section({ id, children }) {
  return (
    <section id={id} className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-20 sm:px-8">
      {children}
    </section>
  )
}

function SectionHead({ title, sub }) {
  return (
    <div className="reveal mb-10 max-w-[680px]">
      <LogoMark size={22} />
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  )
}
