import { useState } from 'react'
import { useT } from '../../context/LangContext'
import { STATUS } from '../../lib/constants'
import { LogoMark } from '../../components/Logo'
import { Count, Head, R } from './kit'

// ── red marquee band + ticking stats ─────────────────────────────────────
export function TickerStats() {
  const { t } = useT()
  const words = t('landing.ticker')
  const stats = t('landing.stats')
  const loop = [...words, ...words]
  return (
    <section aria-label="Ticket Flow" className="relative mt-4">
      <div className="lp-ticker border-y border-[#ff4a40]/40 py-4">
        <div className="lp-ticker-track" aria-hidden="true">
          {loop.map((w, i) => (
            <span key={i} className="flex items-center whitespace-nowrap">
              <span className="lp-h px-6 text-[clamp(22px,2.4vw,32px)] leading-none">{w}</span>
              <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
                <path d="M0 0h4a3 3 0 006 0h4v18h-4a3 3 0 00-6 0H0z" fill="#060606" />
              </svg>
            </span>
          ))}
        </div>
      </div>
      <div className="lp-wrap">
        <div className="grid grid-cols-2 border-b border-[#262626] lg:grid-cols-4">
          {stats.map((s, i) => (
            <R
              key={i}
              d={i}
              className={`flex flex-col gap-3 border-[#262626] px-0 py-8 sm:py-10 ${i % 2 ? 'border-l pl-5 sm:pl-8' : 'pr-5'} ${
                i > 1 ? 'border-t lg:border-t-0' : ''
              } ${i === 2 ? 'lg:border-l lg:pl-8' : ''}`}
            >
              <span className="lp-h text-[clamp(56px,7vw,104px)] text-white">
                <Count to={s.v} pre={s.pre} suf={s.suf} />
              </span>
              <span className="max-w-[24ch] text-[14px] leading-snug text-[#a8a8a8]">{s.label}</span>
            </R>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── problem → solution ───────────────────────────────────────────────────
export function Problem() {
  const { t } = useT()
  const items = t('landing.problem.items')
  return (
    <section id="problem" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <Head tag={t('landing.problem.tag')} title={t('landing.problem.title')} sub={t('landing.problem.sub')} />
      <div className="border-t border-[#3a3a3a]">
        <div className="hidden grid-cols-[72px_1fr_1fr] gap-8 border-b border-[#262626] py-4 md:grid">
          <span />
          <span className="lp-label text-[#787878]">{t('landing.problem.before')}</span>
          <span className="lp-label text-[#f2231b]">{t('landing.problem.after')}</span>
        </div>
        {items.map(([bad, good], i) => (
          <R
            key={i}
            d={i}
            className="grid grid-cols-[44px_1fr] gap-x-4 gap-y-3 border-b border-[#262626] py-6 md:grid-cols-[72px_1fr_1fr] md:gap-8 md:py-8"
          >
            <span className="lp-mono pt-1 text-[14px] text-[#f2231b]">0{i + 1}</span>
            <p className="text-[16px] leading-snug text-[#8a8a8a] line-through decoration-[#f2231b] decoration-2 sm:text-[18px]">
              {bad}
            </p>
            <p className="col-start-2 flex items-start gap-3 text-[18px] font-semibold leading-snug text-white md:col-start-3 sm:text-[22px]">
              <svg width="22" height="22" viewBox="0 0 24 24" className="mt-1 shrink-0" aria-hidden="true">
                <path d="M2 2h20v20H2z" fill="#f2231b" />
                <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="square" />
              </svg>
              {good}
            </p>
          </R>
        ))}
      </div>
    </section>
  )
}

// ── interactive demo ticket ──────────────────────────────────────────────
const DEMO = ['new', 'in_progress', 'unclear', 'on_hold', 'done']
const PROGRESS = { new: 0.08, in_progress: 0.55, unclear: 0.3, on_hold: 0.45, done: 1 }

function Thumb({ i }) {
  const fills = ['#f2231b', '#1d1d1d', '#9d0b05']
  return (
    <svg viewBox="0 0 64 48" className="h-12 w-16 sm:h-14 sm:w-[74px]" aria-hidden="true">
      <rect width="64" height="48" fill={i === 1 ? '#d9d9d9' : '#e6e6e6'} />
      <path d={i === 2 ? 'M0 48L22 22l12 14 8-8 22 20z' : 'M0 48L18 28l14 12 12-16 20 24z'} fill={fills[i]} />
      <rect x={i === 0 ? 44 : 8} y="8" width="8" height="8" fill="#060606" />
    </svg>
  )
}

export function Demo() {
  const { t } = useT()
  const [s, setS] = useState('in_progress')
  const label = t('enum.status.' + s)
  return (
    <section id="demo" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <Head tag={t('landing.demo.tag')} title={t('landing.demo.title')} sub={t('landing.demo.sub')} />
      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr] lg:gap-10">
        {/* the ticket — light paper on black, side notches */}
        <R className="lp-ticket relative bg-[#f3f2ef] text-[#0b0b0b]">
          <div className="grid md:grid-cols-[1fr_260px]">
            <div className="p-6 sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <LogoMark size={20} />
                  <span className="lp-mono text-[14px] font-medium">#021</span>
                </span>
                <span
                  key={s}
                  className="lp-badge wipe inline-flex items-center gap-2 border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em]"
                  style={{ '--wipe': STATUS[s].dot, borderColor: STATUS[s].dot, color: '#0b0b0b' }}
                >
                  <span className="inline-block h-2.5 w-2.5" style={{ background: STATUS[s].dot }} />
                  {label}
                </span>
              </div>
              <h3 className="lp-h mt-6 text-[clamp(26px,2.6vw,36px)] !leading-[1.02]">{t('landing.demo.ticketTitle')}</h3>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-[#4a4a4a]">{t('landing.demo.ticketDesc')}</p>
              <div className="mt-6 flex gap-2">
                {[0, 1, 2].map((i) => (
                  <Thumb key={i} i={i} />
                ))}
              </div>
              <div className="mt-7">
                <div className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5a5a5a]">
                  <span>{t('landing.demo.progress')}</span>
                  <span className="lp-mono">{Math.round(PROGRESS[s] * 100)}%</span>
                </div>
                <div className="mt-2 h-2 w-full bg-[#dcdbd7]">
                  <div className="lp-bar h-full w-full" style={{ transform: `scaleX(${PROGRESS[s]})`, background: STATUS[s].dot }} />
                </div>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-[14px]">
                <span className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center bg-[#0b0b0b] text-[13px] font-bold text-white">A</span>
                  <span>
                    <span className="block text-[12px] text-[#6a6a6a]">{t('landing.demo.client')}</span>Anna
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center bg-[#f2231b] text-[13px] font-bold text-white">M</span>
                  <span>
                    <span className="block text-[12px] text-[#6a6a6a]">{t('landing.demo.assignee')}</span>Marek
                  </span>
                </span>
                <span className="flex items-center gap-2 self-end text-[13px] font-semibold text-[#3a3a3a]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 5h16v15H4zM4 9.5h16M8 3v4M16 3v4" strokeLinecap="square" />
                  </svg>
                  {t('landing.demo.due')}
                </span>
              </div>
            </div>
            {/* stub: thread */}
            <div className="relative border-t-2 border-dashed border-[#c9c8c4] p-6 sm:p-7 md:border-l-2 md:border-t-0">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#5a5a5a]">{t('landing.demo.thread')}</span>
              <div className="mt-4 space-y-3 text-[14px] leading-snug">
                <div className="max-w-[220px] bg-white p-3 shadow-[0_1px_0_#dcdbd7]">
                  <span className="block text-[12px] font-semibold text-[#6a6a6a]">Anna</span>
                  {t('landing.demo.msg1')}
                </div>
                <div className="ml-auto max-w-[220px] bg-[#0b0b0b] p-3 text-white">
                  <span className="block text-[12px] font-semibold text-[#ff6a62]">Marek</span>
                  {t('landing.demo.msg2')}
                </div>
                {s === 'done' && (
                  <div className="lp-pop flex items-center gap-2 text-[13px] font-semibold text-[#1f8a3a]">
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12.5l5 5 11-12" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="square" />
                    </svg>
                    #021 → {label}
                  </div>
                )}
              </div>
            </div>
          </div>
        </R>

        {/* controls + push preview */}
        <R d={1} className="flex flex-col">
          <span className="lp-label text-[#a8a8a8]">{t('landing.demo.hint')}</span>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {DEMO.map((k, i) => {
              const on = k === s
              return (
                <button
                  key={k}
                  onClick={() => setS(k)}
                  aria-pressed={on}
                  className={`group flex min-h-[52px] items-center gap-3 border px-4 text-left text-[15px] font-semibold transition-colors duration-150 ${
                    on ? 'border-white bg-white text-black' : 'border-[#3a3a3a] text-[#d0d0d0] hover:border-white hover:text-white'
                  }`}
                >
                  <span className="inline-block h-3 w-3 shrink-0" style={{ background: STATUS[k].dot }} />
                  <span className="flex-1">{t('enum.status.' + k)}</span>
                  <span className={`lp-mono text-[12px] ${on ? 'text-black/60' : 'text-[#787878]'}`}>0{i + 1}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-6 border border-[#262626] bg-[#0e0e0e] p-4" aria-live="polite">
            <div key={s} className="lp-slam flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center bg-[#161616]">
                <LogoMark size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-bold text-white">{t('landing.demo.pushTitle')}</span>
                  <span className="text-[12px] text-[#787878]">{t('landing.app.now')}</span>
                </div>
                <p className="mt-0.5 text-[14px] text-[#c8c8c8]">{t('landing.demo.pushBody', { status: label })}</p>
              </div>
            </div>
          </div>
        </R>
      </div>
    </section>
  )
}
