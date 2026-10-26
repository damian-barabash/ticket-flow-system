import { useState } from 'react'
import { useT } from '../../context/LangContext'
import { Icon } from '../../components/icons'
import { Head, R } from './kit'

// ── NEW in 1.1: chat + calendar spotlight ────────────────────────────────
function ChatMock() {
  const { t } = useT()
  const msgs = t('landing.spotlight.chat')
  return (
    <div className="flex h-full flex-col border border-[#262626] bg-[#0b0b0b]">
      <div className="flex items-center justify-between border-b border-[#262626] px-4 py-3">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
          <Icon name="chat" size={18} className="text-[#f2231b]" />
          {t('landing.spotlight.chatT')}
        </span>
        <span className="bg-[#f2231b] px-2 py-0.5 text-[12px] font-bold text-white">3</span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 p-4">
        {msgs.map((m, i) => (
          <R key={i} d={i + 1} className={`flex items-end gap-2 ${m.me ? 'flex-row-reverse' : ''}`}>
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center text-[13px] font-bold ${
                m.me ? 'bg-white text-black' : 'bg-[#262626] text-white'
              }`}
            >
              {m.who[0]}
            </span>
            <div className={`max-w-[78%] px-3 py-2 text-[14px] leading-snug ${m.me ? 'bg-[#f2231b] text-white' : 'bg-[#1a1a1a] text-[#e6e6e6]'}`}>
              {!m.me && <span className="block text-[12px] font-semibold text-[#a8a8a8]">{m.who}</span>}
              {m.text.split(/(#\d{3})/).map((part, k) =>
                /^#\d{3}$/.test(part) ? (
                  <span key={k} className={`lp-mono font-medium underline underline-offset-2 ${m.me ? 'text-white' : 'text-[#ff6a62]'}`}>
                    {part}
                  </span>
                ) : (
                  <span key={k}>{part}</span>
                ),
              )}
            </div>
          </R>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-[#262626] px-4 py-3">
        <Icon name="paperclip" size={18} className="text-[#787878]" />
        <span className="flex-1 border-b border-[#3a3a3a] pb-1 text-[14px] text-[#6f6f6f]">{t('landing.spotlight.chatInput')}</span>
        <span className="grid h-9 w-9 place-items-center bg-[#f2231b] text-white">
          <Icon name="send" size={16} />
        </span>
      </div>
    </div>
  )
}

function CalendarMock() {
  const { t } = useT()
  const ev = t('landing.spotlight.calEvents')
  // a 5-week month grid starting on Monday; day 1 sits on Thursday
  const cells = Array.from({ length: 35 }, (_, i) => i - 2)
  const marks = { 8: { c: '#f2231b', l: ev[0] }, 16: { c: '#B084FF', l: ev[1] }, 22: { c: '#E3B341', l: ev[2] } }
  const today = 14
  return (
    <div className="flex h-full flex-col border border-[#262626] bg-[#0b0b0b]">
      <div className="flex items-center justify-between border-b border-[#262626] px-4 py-3">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
          <Icon name="calendar" size={18} className="text-[#f2231b]" />
          {t('landing.spotlight.calT')}
        </span>
        <span className="flex gap-1">
          {['M', 'W', 'L'].map((v, i) => (
            <span key={v} className={`px-2 py-0.5 text-[12px] font-bold ${i === 0 ? 'bg-white text-black' : 'text-[#787878]'}`}>
              {v}
            </span>
          ))}
        </span>
      </div>
      <div className="grid flex-1 grid-cols-7 gap-px bg-[#1a1a1a] p-px">
        {cells.map((d, i) => {
          const m = marks[d]
          const valid = d >= 1 && d <= 31
          return (
            <div key={i} className="relative min-h-[46px] bg-[#0b0b0b] p-1.5 sm:min-h-[54px]">
              <span
                className={`lp-mono inline-grid h-6 min-w-[24px] place-items-center px-1 text-[12px] ${
                  d === today ? 'bg-[#f2231b] text-white' : valid ? 'text-[#a8a8a8]' : 'text-[#3a3a3a]'
                }`}
              >
                {valid ? d : d < 1 ? 30 + d : d - 31}
              </span>
              {m && (
                <span
                  className="absolute inset-x-1 bottom-1 hidden truncate px-1 text-[11px] font-semibold leading-[18px] text-black sm:block"
                  style={{ background: m.c }}
                >
                  {m.l}
                </span>
              )}
              {m && <span className="absolute bottom-1.5 left-1.5 h-2 w-2 sm:hidden" style={{ background: m.c }} />}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#262626] px-4 py-3">
        <span className="mr-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#787878]">{t('landing.spotlight.sync')}</span>
        {['Google', 'Apple', 'Outlook', '.ics'].map((n) => (
          <span key={n} className="border border-[#3a3a3a] px-2 py-1 text-[12px] font-semibold text-[#d6d6d6]">
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Spotlight() {
  const { t } = useT()
  return (
    <section id="new" className="relative scroll-mt-20 overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,rgba(242,35,27,.22),transparent_70%)]" />
      <div className="lp-wrap relative">
        <Head tag={t('landing.spotlight.tag')} title={t('landing.spotlight.title')} />
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {[
            ['chatT', 'chatD', <ChatMock key="c" />],
            ['calT', 'calD', <CalendarMock key="k" />],
          ].map(([tt, dd, mock], i) => (
            <R key={tt} d={i} className="flex flex-col">
              <div className="mb-5 flex items-baseline gap-4">
                <span className="lp-mono text-[14px] text-[#f2231b]">0{i + 1}</span>
                <h3 className="lp-h lp-h3 text-white">{t('landing.spotlight.' + tt)}</h3>
                <span className="bg-[#f2231b] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                  {t('landing.features.newLabel')}
                </span>
              </div>
              <p className="mb-6 max-w-[56ch] text-[16px] leading-relaxed text-[#a8a8a8]">{t('landing.spotlight.' + dd)}</p>
              <div className="flex-1">{mock}</div>
            </R>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── features grid ────────────────────────────────────────────────────────
const F_ICONS = ['image', 'flag', 'reply', 'userPlus', 'bell', 'version', 'target', 'globe']

export function Features() {
  const { t } = useT()
  const items = t('landing.features.items')
  return (
    <section id="features" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <Head tag={t('landing.features.tag')} title={t('landing.features.title')} />
      <div className="grid grid-cols-1 gap-px border border-[#262626] bg-[#262626] sm:grid-cols-2 lg:grid-cols-4">
        {items.map((f, i) => (
          <R key={i} d={i % 4} className="lp-card flex flex-col bg-[#060606] p-6 sm:min-h-[240px] sm:p-7">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center border border-[#3a3a3a] text-[#f2231b]">
                <Icon name={F_ICONS[i]} size={22} stroke={1.9} />
              </span>
              {f.isNew ? (
                <span className="bg-[#f2231b] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                  {t('landing.features.newLabel')}
                </span>
              ) : (
                <span className="lp-mono text-[13px] text-[#5a5a5a]">{String(i + 1).padStart(2, '0')}</span>
              )}
            </div>
            <h3 className="lp-h mt-auto pt-6 text-[22px] sm:pt-10 !leading-[1.02] text-white">{f.t}</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-[#a8a8a8]">{f.d}</p>
          </R>
        ))}
      </div>
    </section>
  )
}

// ── use cases (tabs) ─────────────────────────────────────────────────────
export function UseCases() {
  const { t } = useT()
  const tabs = t('landing.useCases.tabs')
  const [i, setI] = useState(0)
  const cur = tabs[i]
  return (
    <section id="useCases" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <Head tag={t('landing.useCases.tag')} title={t('landing.useCases.title')} />
      <R className="grid grid-cols-1 border border-[#262626] sm:grid-cols-3" role="tablist">
        {tabs.map((tb, k) => {
          const on = k === i
          return (
            <button
              key={k}
              role="tab"
              aria-selected={on}
              onClick={() => setI(k)}
              className={`flex min-h-[64px] items-center gap-4 px-5 text-left text-[15px] font-semibold transition-colors duration-150 sm:text-[16px] ${
                k ? 'border-t border-[#262626] sm:border-l sm:border-t-0' : ''
              } ${on ? 'bg-[#f2231b] text-white' : 'text-[#c8c8c8] hover:bg-[#111] hover:text-white'}`}
            >
              <span className={`lp-mono text-[13px] ${on ? 'text-white/80' : 'text-[#787878]'}`}>0{k + 1}</span>
              {tb.tab}
            </button>
          )
        })}
      </R>
      <div key={i} className="lp-pop grid gap-10 border-x border-b border-[#262626] p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <h3 className="lp-h text-[clamp(32px,4.4vw,60px)] text-white">{cur.title}</h3>
          <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-[#b4b4b4] sm:text-[17px]">{cur.desc}</p>
        </div>
        <ul className="flex flex-col justify-center">
          {cur.points.map((p, k) => (
            <li key={k} className="flex items-center gap-4 border-t border-[#262626] py-5 text-[16px] font-medium text-white last:border-b sm:text-[18px]">
              <span className="h-3 w-3 shrink-0 bg-[#f2231b]" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ── comparison table ─────────────────────────────────────────────────────
export function Compare() {
  const { t } = useT()
  const rows = t('landing.compare.rows')
  return (
    <section id="compare" className="lp-wrap scroll-mt-20 py-20 sm:py-28">
      <Head tag={t('landing.compare.tag')} title={t('landing.compare.title')} />
      <R className="border border-[#262626]">
        <div className="grid grid-cols-[1.5fr_1fr_1fr] text-[12px] font-bold uppercase tracking-[0.06em] sm:text-[13px]">
          <div className="px-3 py-4 sm:px-6" />
          <div className="flex items-center justify-center gap-2 bg-[#f2231b] px-2 py-4 text-center text-white">
            {t('landing.compare.us')}
          </div>
          <div className="px-2 py-4 text-center text-[#787878]">{t('landing.compare.them')}</div>
        </div>
        {rows.map(([f, u, x], i) => (
          <div key={i} className="grid grid-cols-[1.5fr_1fr_1fr] border-t border-[#262626] text-[14px] sm:text-[15px]">
            <div className="px-3 py-4 font-medium text-white sm:px-6">{f}</div>
            <div className="flex items-center justify-center gap-2 bg-[#f2231b]/[0.07] px-2 py-4 text-center font-semibold text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" className="hidden shrink-0 text-[#f2231b] sm:block" aria-hidden="true">
                <path d="M4 12.5l5 5 11-12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="square" />
              </svg>
              {u}
            </div>
            <div className="flex items-center justify-center px-2 py-4 text-center text-[#8a8a8a]">{x}</div>
          </div>
        ))}
      </R>
    </section>
  )
}
