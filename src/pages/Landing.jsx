import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { LogoMark, Wordmark } from '../components/Logo'
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

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// curated demo statuses with a "progress" feel for the interactive ticket
const DEMO_STATUSES = ['new', 'in_progress', 'unclear', 'on_hold', 'done']
const DEMO_PROGRESS = { new: 8, in_progress: 55, unclear: 30, on_hold: 45, done: 100 }

export default function Landing() {
  const { t } = useT()
  const { session } = useAuth()
  const navigate = useNavigate()
  useReveal()

  const [demoStatus, setDemoStatus] = useState('new')
  const [yearly, setYearly] = useState(false)
  const [faqOpen, setFaqOpen] = useState(0)

  const go = (path) => navigate(path)
  const navItems = [
    ['features', t('landing.nav.features')],
    ['compare', t('landing.nav.compare')],
    ['pricing', t('landing.nav.pricing')],
    ['faq', t('landing.nav.faq')],
  ]

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ───────────────────────── NAV */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8">
          <button onClick={() => go('/')} className="transition-opacity hover:opacity-80">
            <Wordmark />
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

      {/* ───────────────────────── HERO */}
      <section className="dotgrid relative overflow-hidden">
        {/* aurora backdrop */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora absolute -left-[10%] top-[-20%] h-[520px] w-[520px] rounded-full bg-accent/20 blur-[120px]" />
          <div className="aurora absolute right-[-10%] top-[10%] h-[460px] w-[460px] rounded-full bg-legend/15 blur-[130px]" style={{ animationDelay: '-6s' }} />
        </div>

        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <div className="reveal flex flex-col items-start justify-center">
            <span className="inline-flex items-center gap-2 border border-line px-3 py-1.5 label">
              <span className="inline-block h-1.5 w-1.5 bg-accent" />
              {t('landing.hero.badge')}
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[56px]">
              {t('landing.hero.line1')}{' '}
              <span className="text-accent">{t('landing.hero.line2')}</span>
            </h1>
            <p className="mt-6 max-w-[540px] text-[15px] leading-relaxed text-muted">{t('landing.hero.sub')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={() => go('/register')} className="btn-accent">{t('landing.hero.ctaPrimary')}</button>
              <button onClick={() => go('/login')} className="btn-ghost">{t('landing.hero.ctaSecondary')}</button>
            </div>
            <p className="mt-5 label">{t('landing.hero.trust')}</p>
          </div>

          {/* floating ticket mock */}
          <div className="reveal flex items-center justify-center">
            <div className="relative w-full max-w-[400px]">
              <div className="brackets relative border border-line2 bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
                <div className="flex items-center justify-between">
                  <span className="label">{t('landing.hero.demoTag')}</span>
                  <span className="inline-flex items-center gap-1.5 label" style={{ color: STATUS.new.text }}>
                    <span className="inline-block h-1.5 w-1.5" style={{ background: STATUS.new.dot }} />
                    {t('landing.hero.demoNew')}
                  </span>
                </div>
                <div className="perforation my-4" />
                <h3 className="text-[15px] font-medium text-ink">{t('landing.hero.demoTitle')}</h3>
                <p className="mt-2 text-xs leading-relaxed text-faint">{t('landing.hero.demoDesc')}</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-12 w-12 dotgrid border border-line" />
                  <div className="h-12 w-12 dotgrid border border-line" />
                  <span className="label">+2</span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
                  <span className="label">RU · PL · EN</span>
                  <span className="label" style={{ color: STATUS.in_progress.text }}>● realtime</span>
                </div>
              </div>
              <div className="absolute -bottom-5 -right-4 hidden border border-line2 bg-bg px-4 py-3 sm:block">
                <span className="label">{t('deadlines.heading')}</span>
                <div className="mt-1 text-sm font-medium text-legend">3 дн</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── PROBLEM */}
      <Section id="problem">
        <SectionHead label={t('landing.problem.label')} title={t('landing.problem.title')} sub={t('landing.problem.sub')} />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="reveal border border-line bg-surface p-6">
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
              <span className="label">{t('landing.hero.demoTag').replace('014', '021')}</span>
              <h3 className="mt-2 text-lg font-medium text-ink">{t('landing.demo.ticketTitle')}</h3>
              <p className="mt-1.5 max-w-[460px] text-sm text-faint">{t('landing.demo.ticketDesc')}</p>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-2 border px-3 py-1.5 label"
              style={{ color: STATUS[demoStatus].text, borderColor: STATUS[demoStatus].dot + '66' }}
            >
              <span className="inline-block h-2 w-2" style={{ background: STATUS[demoStatus].dot }} />
              {t('enum.status.' + demoStatus)}
            </span>
          </div>

          {/* progress bar */}
          <div className="mt-6 h-1.5 w-full overflow-hidden bg-surface2">
            <div
              className="h-full transition-all duration-500"
              style={{ width: DEMO_PROGRESS[demoStatus] + '%', background: STATUS[demoStatus].dot }}
            />
          </div>

          {/* clickable status pills */}
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

      {/* ───────────────────────── FEATURES */}
      <Section id="features">
        <SectionHead label={t('landing.features.label')} title={t('landing.features.title')} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="reveal group border border-line bg-surface p-6 transition-colors hover:border-line2">
              <div className="flex h-9 w-9 items-center justify-center border border-line2 font-mono text-xs text-accent transition-colors group-hover:bg-accentSoft">
                {String(i).padStart(2, '0')}
              </div>
              <h3 className="mt-4 text-[15px] font-medium text-ink">{t(`landing.features.f${i}t`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-faint">{t(`landing.features.f${i}d`)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ───────────────────────── WHY / DIFFERENTIATION */}
      <Section id="why">
        <SectionHead label={t('landing.why.label')} title={t('landing.why.title')} sub={t('landing.why.sub')} />
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="reveal bg-surface p-7">
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
            <div className="px-4 py-3 label sm:px-6" />
            <div className="px-3 py-3 text-center sm:px-6">
              <span className="font-mono text-[11px] uppercase tracking-label text-accent">{t('landing.compare.colUs')}</span>
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

        {/* monthly / yearly toggle */}
        <div className="reveal mb-8 flex items-center justify-center">
          <div className="inline-flex border border-line p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-4 py-2 font-mono text-[11px] uppercase tracking-label transition-colors ${
                !yearly ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
              }`}
            >
              {t('landing.pricing.monthly')}
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-4 py-2 font-mono text-[11px] uppercase tracking-label transition-colors ${
                yearly ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
              }`}
            >
              {t('landing.pricing.yearly')}
            </button>
          </div>
        </div>

        <div className="reveal mx-auto max-w-[460px]">
          <div className="brackets relative border border-accent/40 bg-surface p-8 shadow-[0_0_60px_-20px_rgba(255,46,46,0.4)]">
            <div className="flex items-center justify-between">
              <span className="label">{t('landing.pricing.planName')}</span>
              <span className="border border-accent/40 bg-accentSoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                {t('landing.pricing.planTag')}
              </span>
            </div>

            <div className="mt-6 flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-tight text-ink">
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
                {open && (
                  <div className="px-5 pb-5 text-sm leading-relaxed text-faint sm:px-6">{t(`landing.faq.a${i}`)}</div>
                )}
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
    <section id={id} className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8">
      {children}
    </section>
  )
}

function SectionHead({ label, title, sub }) {
  return (
    <div className="reveal mb-10 max-w-[680px]">
      <span className="label">{label}</span>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  )
}
