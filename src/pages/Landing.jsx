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

  const go = (path) => navigate(path)
  const navItems = [
    ['useCases', t('landing.useCases.label')],
    ['features', t('landing.features.label')],
    ['compare', t('landing.compare.label')],
    ['pricing', t('landing.pricing.label')],
    ['faq', t('landing.faq.label')],
  ]

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ───────────────────────── FIXED / FLOATING HEADER */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div
          className={`mx-auto flex items-center justify-between transition-all duration-300 ${
            scrolled
              ? 'mt-3 max-w-[1180px] rounded-2xl border border-line glass px-4 py-3 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)] mx-4 sm:mx-8'
              : 'mt-0 max-w-[1240px] rounded-none border-b border-line bg-bg/70 px-5 py-4 backdrop-blur sm:px-8'
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
          <div className="flex items-center gap-3 sm:gap-4">
            <LangSwitch />
            {session ? (
              <button onClick={() => go('/projects')} className="btn-accent !px-5 !py-2.5">
                {t('projects.heading')}
              </button>
            ) : (
              <>
                <button onClick={() => go('/login')} className="label hidden hover:text-ink transition-colors sm:block">
                  {t('landing.nav.login')}
                </button>
                <button onClick={() => go('/register')} className="btn-accent !px-5 !py-2.5">
                  {t('landing.nav.signup')}
                </button>
              </>
            )}
          </div>
        </div>
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
            <span className="inline-flex items-center gap-2.5 label">
              <LogoMark size={16} />
              <span className="inline-block h-1.5 w-1.5 bg-accent" />
              {t('landing.hero.badge')}
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[56px]">
              {t('landing.hero.line1')}{' '}
              <span className="grad-accent">{t('landing.hero.line2')}</span>
            </h1>
            <p className="mt-6 max-w-[540px] text-[15px] leading-relaxed text-muted">{t('landing.hero.sub')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={() => go('/register')} className="btn-accent">{t('landing.hero.ctaPrimary')}</button>
              <button onClick={() => go('/login')} className="btn-ghost">{t('landing.hero.ctaSecondary')}</button>
            </div>
            <p className="mt-5 label">{t('landing.hero.trust')}</p>
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
          <div key={feat} className="pop flex flex-col justify-center border border-line2 bg-surface p-8">
            <div className="flex h-11 w-11 items-center justify-center border border-line2 font-mono text-sm text-accent">
              {String(feat).padStart(2, '0')}
            </div>
            <h3 className="mt-5 text-xl font-medium text-ink">{t(`landing.features.f${feat}t`)}</h3>
            <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-muted">{t(`landing.features.f${feat}d`)}</p>
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
          {[1, 2, 3, 4, 5].map((i) => {
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

function Section({ id, children }) {
  return (
    <section id={id} className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-20 sm:px-8">
      {children}
    </section>
  )
}

function SectionHead({ label, title, sub }) {
  return (
    <div className="reveal mb-10 max-w-[680px]">
      <span className="flex items-center gap-2 label">
        <LogoMark size={13} />
        {label}
      </span>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  )
}
