import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LangContext'
import { STATUS } from '../../lib/constants'
import { LogoMark } from '../../components/Logo'
import { Icon } from '../../components/icons'
import { ArrowRight, Head, R, Lines, useInView } from './kit'

export const APP_STORE = 'https://apps.apple.com/app/id6791677760'
export const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=com.dbdcstudio.ticketflow'

// ── pricing ──────────────────────────────────────────────────────────────
export function Pricing({ go, onEnterprise }) {
  const { t } = useT()
  const [yearly, setYearly] = useState(false)
  const perks = t('landing.pricing.perks')
  const ent = t('landing.pricing.entPerks')
  return (
    <section id="pricing" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <Head tag={t('landing.pricing.tag')} title={t('landing.pricing.title')} sub={t('landing.pricing.sub')} />

      <R className="mb-8 flex flex-wrap items-center gap-4">
        <div className="inline-flex border border-[#3a3a3a]" role="group">
          {[false, true].map((y) => (
            <button
              key={String(y)}
              onClick={() => setYearly(y)}
              aria-pressed={yearly === y}
              className={`min-h-[44px] px-5 text-[13px] font-bold uppercase tracking-[0.06em] transition-colors duration-150 ${
                yearly === y ? 'bg-white text-black' : 'text-[#a8a8a8] hover:text-white'
              }`}
            >
              {y ? t('landing.pricing.yearly') : t('landing.pricing.monthly')}
            </button>
          ))}
        </div>
        <span className="border border-[#f2231b] px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-[#f2231b]">
          −17% · {t('landing.pricing.save')}
        </span>
      </R>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Pro — the red panel */}
        <R className="relative flex flex-col overflow-hidden bg-[linear-gradient(180deg,#ff3a2c,#f2231b_45%,#c3120a)] p-7 text-white sm:p-10">
          <div className="pointer-events-none absolute -bottom-28 -right-24 opacity-[0.09]">
            <svg width="460" height="460" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#000" d="M12.5 2H18.5A5.5 5.5 0 0 0 29.5 2H35.5V25.4A1.6 1.6 0 0 0 35.5 28.6V46H29.5A5.5 5.5 0 0 0 18.5 46H12.5V28.6A1.6 1.6 0 0 0 12.5 25.4Z" />
            </svg>
          </div>
          <div className="relative flex items-center justify-between gap-3">
            <span className="lp-h text-[28px]">{t('landing.pricing.planName')}</span>
            <span className="lp-tag text-white">{t('landing.pricing.planTag')}</span>
          </div>
          <div className="relative mt-8 flex items-end gap-3">
            <span key={yearly ? 'y' : 'm'} className="lp-pop lp-h text-[clamp(84px,11vw,148px)] leading-[0.82]">
              {yearly ? t('landing.pricing.curYearly') : t('landing.pricing.curMonthly')}
            </span>
            <span className="mb-2 text-[18px] font-semibold">{yearly ? t('landing.pricing.perYear') : t('landing.pricing.perMonth')}</span>
          </div>
          <p className="relative mt-4 text-[14px] font-medium text-white/90">
            {yearly ? t('landing.pricing.yearlyHint') : t('landing.pricing.guarantee')}
          </p>
          <ul className="relative mb-10 mt-8 grid gap-x-8 gap-y-3 border-t border-white/30 pt-7 sm:grid-cols-2">
            {perks.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-[15px] font-medium leading-snug">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-black" />
                {p}
              </li>
            ))}
          </ul>
          <button
            onClick={() => go('/register')}
            className="relative mt-auto inline-flex min-h-[56px] w-full items-center justify-center gap-3 bg-[#060606] px-6 text-[14px] font-bold uppercase tracking-[0.06em] text-white transition-transform duration-100 hover:bg-black active:scale-[0.98]"
          >
            {t('landing.pricing.cta')} <ArrowRight />
          </button>
        </R>

        {/* Enterprise */}
        <R d={1} className="flex flex-col border border-[#3a3a3a] bg-[#0b0b0b] p-7 sm:p-10">
          <div className="flex items-center justify-between gap-3">
            <span className="lp-h text-[28px] text-white">{t('landing.pricing.entName')}</span>
            <span className="lp-tag text-[#a8a8a8]">{t('landing.pricing.entTag')}</span>
          </div>
          <div className="mt-8 lp-h text-[clamp(48px,6vw,84px)] leading-[0.85] text-white">{t('landing.pricing.entPrice')}</div>
          <p className="mt-4 text-[14px] text-[#a8a8a8]">{t('landing.pricing.entPriceNote')}</p>
          <p className="mt-6 text-[16px] leading-relaxed text-[#d6d6d6]">{t('landing.pricing.entLead')}</p>
          <ul className="mt-7 space-y-3 border-t border-[#262626] pt-7">
            {ent.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-[15px] leading-snug text-[#d6d6d6]">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-[#f2231b]" />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-10">
            <button onClick={onEnterprise} className="lp-btn-ghost w-full !min-h-[56px]">
              {t('landing.pricing.entCta')} <ArrowRight />
            </button>
            <p className="mt-3 text-center text-[13px] text-[#787878]">{t('landing.pricing.entNote')}</p>
          </div>
        </R>
      </div>
    </section>
  )
}

// ── apps ─────────────────────────────────────────────────────────────────
// Store badges: official marks (Apple, Google Play, Windows) in our square frame.
const APPLE = 'M16.37 12.6c-.02-2.23 1.82-3.3 1.9-3.35-1.04-1.52-2.65-1.73-3.22-1.75-1.37-.14-2.68.81-3.37.81-.7 0-1.77-.79-2.9-.77-1.49.02-2.87.87-3.64 2.2-1.55 2.69-.4 6.67 1.11 8.85.74 1.07 1.62 2.27 2.77 2.22 1.11-.04 1.53-.72 2.88-.72 1.34 0 1.72.72 2.9.7 1.2-.02 1.96-1.09 2.69-2.16.85-1.24 1.2-2.44 1.22-2.5-.03-.01-2.33-.9-2.34-3.53zM14.16 6.06c.61-.74 1.03-1.77.91-2.8-.88.04-1.95.59-2.58 1.33-.57.66-1.07 1.71-.93 2.72.98.08 1.99-.5 2.6-1.25z'
function MarkApple({ s = 30 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d={APPLE} />
    </svg>
  )
}
function MarkPlay({ s = 28 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.6 1.8C3.2 2 3 2.4 3 2.9v18.2c0 .5.2.9.6 1.1L13.4 12z" fill="#00A0FF" />
      <path d="M3.6 1.8c.3-.2.8-.2 1.3.1l11.7 6.7-3.2 3.4z" fill="#00F076" />
      <path d="M13.4 12l3.2 3.4-11.7 6.7c-.5.3-1 .3-1.3.1z" fill="#FF3A44" />
      <path d="M16.6 8.6l3.8 2.2c1 .6 1 1.8 0 2.4l-3.8 2.2-3.2-3.4z" fill="#FFD500" />
    </svg>
  )
}
function MarkWindows({ s = 22 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#fff" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 2h9v9H2zM13 2h9v9h-9zM2 13h9v9H2zM13 13h9v9h-9z" />
    </svg>
  )
}
const MARKS = {
  apple: <MarkApple />,
  play: <MarkPlay />,
  desktop: (
    <span className="flex items-center gap-2">
      <MarkApple s={24} />
      <MarkWindows />
    </span>
  ),
  web: <Icon name="globe" size={28} className="text-white" />,
}

function StoreTile({ href, mark, small, name, status, live, onClick }) {
  const Tag = href ? 'a' : onClick ? 'button' : 'div'
  const props = href ? { href, target: '_blank', rel: 'noopener noreferrer' } : onClick ? { onClick, type: 'button' } : {}
  const active = !!(href || onClick)
  return (
    <Tag
      {...props}
      className={`group relative flex min-h-[76px] items-center justify-between gap-4 border bg-black px-5 py-3 transition-colors duration-150 ${
        active ? 'border-[#4a4a4a] hover:border-white hover:bg-[#0d0d0d]' : 'border-[#2a2a2a]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-4">
        <span className={`flex w-[52px] shrink-0 justify-center ${active ? '' : 'opacity-80'}`}>{MARKS[mark]}</span>
        <span className="min-w-0 text-left leading-none">
          {small && <span className="block text-[12px] font-medium text-[#b4b4b4]">{small}</span>}
          <span className="mt-1 block whitespace-nowrap text-[20px] font-semibold tracking-[-0.01em] text-white">{name}</span>
        </span>
      </span>
      <span className={`absolute right-3 top-2.5 text-[11px] font-bold uppercase tracking-[0.1em] ${live ? 'text-[#46C864]' : 'text-[#f2231b]'}`}>{status}</span>
      <span className="flex shrink-0 items-center self-end pb-1">
        {active && (
          <span className="text-[#787878] transition-transform duration-150 group-hover:translate-x-1 group-hover:text-white">
            <ArrowRight />
          </span>
        )}
      </span>
    </Tag>
  )
}

function PhoneMock() {
  const { t } = useT()
  const ref = useRef(null)
  const seen = useInView(ref)
  const [push, setPush] = useState(false)
  useEffect(() => {
    if (!seen) return
    const id = setTimeout(() => setPush(true), 500)
    return () => clearTimeout(id)
  }, [seen])
  const rows = t('landing.hero.panels').slice(1, 5)
  return (
    <div ref={ref} className="lp-phone relative mx-auto w-[288px] border-[10px] border-[#151515] bg-[#060606] sm:w-[310px]">
      <div className="flex items-center justify-between border-b border-[#262626] px-4 pb-3 pt-5">
        <span className="flex items-center gap-2">
          <LogoMark size={18} />
          <span className="font-display text-[14px] font-extrabold uppercase text-white">Ticket Flow</span>
        </span>
        <Icon name="bell" size={18} className="text-[#a8a8a8]" />
      </div>
      <div className="flex gap-1 px-4 pt-3">
        {[t('enum.status.new'), t('enum.status.in_progress'), t('enum.status.done')].map((l, i) => (
          <span key={i} className={`px-2 py-1 text-[12px] font-semibold ${i === 0 ? 'bg-white text-black' : 'text-[#a8a8a8]'}`}>
            {l}
          </span>
        ))}
      </div>
      <div className="space-y-2 p-4">
        {rows.map((r) => (
          <div key={r.n} className="flex border border-[#262626] bg-[#0e0e0e]">
            <span className="w-1 shrink-0" style={{ background: STATUS[r.status].dot }} />
            <div className="min-w-0 flex-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="lp-mono text-[12px] text-[#787878]">#{r.n}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: STATUS[r.status].text }}>
                  {t('enum.status.' + r.status)}
                </span>
              </div>
              <p className="mt-1 truncate text-[14px] font-medium text-white">{r.title}</p>
            </div>
          </div>
        ))}
        <div className="flex min-h-[44px] items-center justify-center gap-2 bg-[#f2231b] text-[13px] font-bold uppercase tracking-[0.06em] text-white">
          <Icon name="plus" size={16} /> #016
        </div>
      </div>
      {push && (
        <div className="lp-slam absolute inset-x-3 top-3 z-10 flex items-start gap-3 border border-[#3a3a3a] bg-[#1a1a1a]/95 p-3 shadow-[0_20px_40px_-10px_rgba(0,0,0,.8)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-[#060606]">
            <LogoMark size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-bold text-white">{t('landing.app.pushTitle')}</span>
              <span className="text-[11px] text-[#a8a8a8]">{t('landing.app.now')}</span>
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-[#d0d0d0]">{t('landing.app.pushBody')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function Apps({ go }) {
  const { t } = useT()
  const points = t('landing.app.points')
  return (
    <section id="app" className="relative scroll-mt-20 overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_55%_at_75%_55%,rgba(242,35,27,.28),transparent_70%)]" />
      <div className="lp-wrap relative grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <Head small tag={t('landing.app.tag')} title={t('landing.app.title')} sub={t('landing.app.sub')} />
          <ul className="mb-10 space-y-3">
            {points.map((p, i) => (
              <R as="li" key={i} d={i} className="flex items-center gap-4 text-[16px] font-medium text-white sm:text-[17px]">
                <span className="lp-mono text-[13px] text-[#f2231b]">0{i + 1}</span>
                {p}
              </R>
            ))}
          </ul>
          <R className="grid gap-3 xl:grid-cols-2">
            <StoreTile href={APP_STORE} mark="apple" small={t('landing.app.dlApple')} name={t('landing.app.appStore')} status={t('landing.app.live')} live />
            <StoreTile href={GOOGLE_PLAY} mark="play" small={t('landing.app.dlPlay')} name={t('landing.app.googlePlay')} status={t('landing.app.soon')} />
            <StoreTile mark="desktop" small={t('landing.app.dlDesktop')} name="macOS · Windows" status={t('landing.app.soon')} />
            <StoreTile mark="web" small="ticketflow.pl" name={t('landing.app.web')} status={t('landing.app.live')} live onClick={() => go('/register')} />
          </R>
        </div>
        <R d={1} className="py-4">
          <PhoneMock />
        </R>
      </div>
    </section>
  )
}

// ── FAQ ──────────────────────────────────────────────────────────────────
export function Faq() {
  const { t } = useT()
  const items = t('landing.faq.items')
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <div className="lg:sticky lg:top-28">
            <span className="lp-tag text-white">{t('landing.faq.tag')}</span>
            <Lines lines={[t('landing.faq.title')]} className="lp-h lp-h2 mt-6 text-white" />
          </div>
        </div>
        <div className="border-t border-[#3a3a3a]">
          {items.map(([q, a], i) => {
            const on = open === i
            return (
              <R key={i} d={i} className="border-b border-[#262626]">
                <button
                  onClick={() => setOpen(on ? -1 : i)}
                  aria-expanded={on}
                  className="flex w-full items-center justify-between gap-6 py-6 text-left"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="lp-mono text-[13px] text-[#f2231b]">0{i + 1}</span>
                    <span className="text-[17px] font-semibold leading-snug text-white sm:text-[19px]">{q}</span>
                  </span>
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center border transition-colors duration-150 ${
                      on ? 'border-[#f2231b] bg-[#f2231b] text-white' : 'border-[#3a3a3a] text-white'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" className={`lp-plus ${on ? 'open' : ''}`} aria-hidden="true">
                      <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </span>
                </button>
                {on && <p className="lp-pop max-w-[62ch] pb-7 pl-9 text-[16px] leading-relaxed text-[#b4b4b4]">{a}</p>}
              </R>
            )
          })}
        </div>
      </div>
    </section>
  )
}
