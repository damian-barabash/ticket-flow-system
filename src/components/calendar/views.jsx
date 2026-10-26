import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../context/LangContext'
import { STATUS } from '../../lib/constants'
import { addDays, hm, isClosed, isOverdue, parseYmd, startOfDay, todayKey, ymd } from '../../lib/calendar'
import { Icon } from '../ui'

export const LEGEND = '#B084FF'
const num = (n) => '#' + String(n ?? 0).padStart(3, '0')

export function localeOf(lang) {
  return lang === 'en' ? 'en-GB' : lang === 'pl' ? 'pl-PL' : 'ru-RU'
}
export function weekdayNames(lang, style = 'short') {
  const base = new Date(2024, 0, 1) // Monday
  return Array.from({ length: 7 }, (_, i) => addDays(base, i).toLocaleDateString(localeOf(lang), { weekday: style }))
}

// One calendar item → compact bar (month / all-day row)
export const ItemBar = memo(function ItemBar({ item, onClick, projectName, dense }) {
  const { t } = useT()
  const base = `flex w-full min-w-0 items-center gap-1.5 text-left text-[12px] leading-[18px] transition-[filter,transform] duration-100 active:scale-[.98] ${dense ? 'px-1.5 py-[1px]' : 'px-2 py-1'}`
  const title = projectName ? `${projectName} · ` : ''
  if (item.kind === 'event') {
    const ev = item.data
    return (
      <button
        type="button"
        onClick={(e) => (e.stopPropagation(), onClick(item))}
        className={`${base} bg-accent font-medium text-white hover:brightness-110`}
        title={title + ev.title}
      >
        {!ev.all_day && <span className="num shrink-0 text-[11px] opacity-85">{hm(new Date(ev.starts_at))}</span>}
        <span className="truncate">{ev.title}</span>
      </button>
    )
  }
  if (item.kind === 'goal') {
    const g = item.data
    return (
      <button
        type="button"
        onClick={(e) => (e.stopPropagation(), onClick(item))}
        className={`${base} border font-medium hover:brightness-125 ${g.done ? 'line-through opacity-60' : ''}`}
        style={{ color: LEGEND, borderColor: LEGEND + '66', background: LEGEND + '1A' }}
        title={title + t('cal.goal') + ': ' + g.title}
      >
        <Icon name="target" size={12} />
        <span className="truncate">{g.title}</span>
      </button>
    )
  }
  const tk = item.data
  const s = STATUS[tk.status] || STATUS.new
  const overdue = isOverdue(tk)
  const closed = isClosed(tk.status)
  return (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), onClick(item))}
      className={`${base} border bg-surface2 hover:border-line2 hover:bg-[#1d1d1d] ${overdue ? 'border-accent/70' : 'border-line'} ${closed ? 'text-faint line-through' : 'text-ink'}`}
      title={`${title}${num(tk.number)} ${tk.title}`}
    >
      <span className="h-2 w-2 shrink-0" style={{ background: s.dot }} />
      <span className={`num shrink-0 text-[11px] ${overdue ? 'text-accent' : 'text-faint'}`}>{num(tk.number)}</span>
      <span className="truncate">{tk.title}</span>
    </button>
  )
})

// ── MONTH ────────────────────────────────────────────────────────────────
export function MonthView({ anchor, from, to, byDay, selected, onSelect, onCreate, onItem, projName, lang }) {
  const { t } = useT()
  const days = []
  for (let d = new Date(from); d < to; d = addDays(d, 1)) days.push(d)
  const today = todayKey()
  const wd = weekdayNames(lang)
  const weeks = days.length / 7
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-t border-line">
      <div className="grid grid-cols-7">
        {wd.map((w, i) => (
          <div key={i} className={`label border-b border-r border-line px-2 py-2 ${i >= 5 ? 'text-faint' : ''}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const k = ymd(d)
          const items = byDay[k] || []
          const inMonth = d.getMonth() === anchor.getMonth()
          const isToday = k === today
          const isSel = k === selected
          const max = 3
          return (
            <div
              key={k}
              role="button"
              tabIndex={-1}
              onClick={() => onSelect(k)}
              onDoubleClick={() => onCreate(k)}
              className={`group relative flex min-h-[64px] min-w-0 cursor-pointer flex-col gap-[3px] border-b border-r p-1 transition-colors sm:min-h-[108px] sm:p-1.5 ${
                isSel ? 'border-line bg-surface2 outline outline-1 -outline-offset-1 outline-ink' : 'border-line hover:bg-surface'
              } ${inMonth ? '' : 'bg-[#090909]'}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`num inline-flex h-6 min-w-6 items-center justify-center px-1 text-[13px] ${
                    isToday ? 'bg-accent font-bold text-white' : inMonth ? 'text-ink' : 'text-faint'
                  }`}
                >
                  {d.getDate()}
                </span>
                <button
                  type="button"
                  onClick={(e) => (e.stopPropagation(), onCreate(k))}
                  className="hidden h-6 w-6 items-center justify-center text-faint opacity-0 transition-opacity hover:bg-accent hover:text-white group-hover:opacity-100 sm:flex"
                  aria-label={t('cal.newEvent')}
                  title={t('cal.newEvent')}
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
              {/* desktop: bars; mobile: squares */}
              <div className="hidden min-w-0 flex-col gap-[3px] sm:flex">
                {items.slice(0, max).map((it) => (
                  <ItemBar key={it.key} item={it} onClick={onItem} projectName={projName(it.data.project_id)} dense />
                ))}
                {items.length > max && (
                  <span className="px-1 text-[12px] font-medium text-muted">{t('cal.more', { n: items.length - max })}</span>
                )}
              </div>
              {items.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-[3px] sm:hidden">
                  {items.slice(0, 6).map((it) => (
                    <span key={it.key} className="h-[6px] w-[6px]" style={{ background: dotColor(it) }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function dotColor(it) {
  if (it.kind === 'event') return '#F2231B'
  if (it.kind === 'goal') return LEGEND
  if (isOverdue(it.data)) return '#F2231B'
  return (STATUS[it.data.status] || STATUS.new).dot
}

// ── WEEK (time grid) ─────────────────────────────────────────────────────
const HOUR = 48
export function WeekView({ from, byDay, timedByDay, selected, onSelect, onSlot, onItem, projName, lang }) {
  const { t } = useT()
  const scroller = useRef(null)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  useLayoutEffect(() => {
    const n = new Date()
    const target = Math.max(0, Math.min(HOUR * 7.5, HOUR * (n.getHours() - 1.5)))
    const set = () => scroller.current && (scroller.current.scrollTop = n.getHours() >= 9 ? HOUR * (n.getHours() - 1.5) : target || HOUR * 7.5)
    set()
    const id = requestAnimationFrame(set)
    return () => cancelAnimationFrame(id)
  }, [])
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const today = todayKey()
  const wd = weekdayNames(lang)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  function slotClick(e, d) {
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    const mins = Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / (HOUR / 2)) * 30))
    const s = new Date(d)
    s.setHours(0, mins, 0, 0)
    onSlot(s)
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-t border-line">
      {/* header */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: '52px repeat(7, minmax(0,1fr))' }}>
        <div className="border-r border-line" />
        {days.map((d, i) => {
          const k = ymd(d)
          return (
            <button
              key={k}
              onClick={() => onSelect(k)}
              className={`flex flex-col items-center border-r border-line py-2 transition-colors hover:bg-surface ${k === selected ? 'bg-surface2' : ''}`}
            >
              <span className={`label ${i >= 5 ? 'text-faint' : ''}`}>{wd[i]}</span>
              <span className={`num mt-1 inline-flex h-7 min-w-7 items-center justify-center px-1 text-[15px] ${k === today ? 'bg-accent font-bold text-white' : 'text-ink'}`}>
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>
      {/* all-day row */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: '52px repeat(7, minmax(0,1fr))' }}>
        <div className="flex items-start justify-end border-r border-line px-1.5 py-1.5">
          <span className="label-sm text-right">{t('cal.allDay')}</span>
        </div>
        {days.map((d) => {
          const k = ymd(d)
          const items = (byDay[k] || []).filter((it) => it.kind !== 'event' || it.data.all_day || it.multi)
          return (
            <div key={k} className="flex max-h-[120px] min-h-[34px] min-w-0 flex-col gap-[3px] overflow-y-auto border-r border-line p-1">
              {items.map((it) => (
                <ItemBar key={it.key} item={it} onClick={onItem} projectName={projName(it.data.project_id)} dense />
              ))}
            </div>
          )
        })}
      </div>
      {/* time grid */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, minmax(0,1fr))', height: HOUR * 24 }}>
          <div className="relative border-r border-line">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="num absolute right-1.5 -translate-y-1/2 text-[11px] text-faint" style={{ top: h * HOUR }}>
                {h ? String(h).padStart(2, '0') + ':00' : ''}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const k = ymd(d)
            const evs = timedByDay[k] || []
            return (
              <div
                key={k}
                className="relative cursor-cell border-r border-line"
                onClick={(e) => slotClick(e, d)}
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--c-line)) 0, rgb(var(--c-line)) 1px, transparent 1px, transparent ${HOUR}px)`,
                }}
              >
                {layoutDay(evs, d).map(({ it, top, height, col, cols }) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={(e) => (e.stopPropagation(), onItem(it))}
                    className="absolute overflow-hidden border-l-2 border-white/70 bg-accent px-1.5 py-0.5 text-left text-white transition-[filter] hover:brightness-110"
                    style={{ top, height: Math.max(20, height - 2), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                    title={it.data.title}
                  >
                    <span className="block truncate text-[12px] font-semibold leading-4">{it.data.title}</span>
                    {height > 34 && (
                      <span className="num block truncate text-[11px] leading-4 opacity-85">
                        {hm(new Date(it.data.starts_at))}
                        {it.data.ends_at ? '–' + hm(new Date(it.data.ends_at)) : ''}
                      </span>
                    )}
                  </button>
                ))}
                {k === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-[1] flex items-center" style={{ top: (nowMin / 60) * HOUR }}>
                    <span className="-ml-[4px] h-2 w-2 bg-accent" />
                    <span className="h-[2px] flex-1 bg-accent" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// simple overlap layout: greedy columns within clusters
function layoutDay(items, day) {
  const d0 = startOfDay(day).getTime()
  const rows = items
    .map((it) => {
      const s = Math.max(d0, new Date(it.data.starts_at).getTime())
      const eRaw = it.data.ends_at ? new Date(it.data.ends_at).getTime() : s + 30 * 60e3
      const e = Math.min(d0 + 864e5, Math.max(eRaw, s + 20 * 60e3))
      return { it, s, e }
    })
    .sort((a, b) => a.s - b.s || b.e - a.e)
  const out = []
  let cluster = []
  let clusterEnd = 0
  const flush = () => {
    const cols = []
    cluster.forEach((r) => {
      let c = cols.findIndex((end) => end <= r.s)
      if (c < 0) {
        c = cols.length
        cols.push(0)
      }
      cols[c] = r.e
      r.col = c
    })
    cluster.forEach((r) => out.push({ it: r.it, col: r.col, cols: cols.length, top: ((r.s - d0) / 36e5) * HOUR, height: ((r.e - r.s) / 36e5) * HOUR }))
    cluster = []
  }
  rows.forEach((r) => {
    if (cluster.length && r.s >= clusterEnd) flush()
    cluster.push(r)
    clusterEnd = Math.max(clusterEnd, r.e)
  })
  if (cluster.length) flush()
  return out
}

// ── AGENDA ───────────────────────────────────────────────────────────────
export function AgendaView({ from, to, byDay, onItem, onCreate, projName, lang, unscheduled }) {
  const { t } = useT()
  const days = []
  for (let d = new Date(from); d < to; d = addDays(d, 1)) {
    const k = ymd(d)
    if (byDay[k]?.length) days.push(d)
  }
  const today = todayKey()
  return (
    <div className="h-full overflow-y-auto border border-line">
      {days.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <div className="display text-[26px] text-ink">{t('cal.agendaEmpty')}</div>
          <p className="mt-2 text-[14px] text-muted">{t('cal.agendaEmptyHint')}</p>
          <button className="btn-ghost btn-sm mt-5" onClick={() => onCreate(ymd(from))}>
            <Icon name="plus" size={15} /> {t('cal.newEvent')}
          </button>
        </div>
      ) : (
        days.map((d) => {
          const k = ymd(d)
          return (
            <div key={k} className="grid grid-cols-[72px_1fr] border-b border-line sm:grid-cols-[120px_1fr]">
              <div className={`border-r border-line px-3 py-3 ${k === today ? 'bg-accent/10' : ''}`}>
                <div className={`display text-[30px] ${k === today ? 'text-accent' : 'text-ink'}`}>{d.getDate()}</div>
                <div className="label mt-1">{d.toLocaleDateString(localeOf(lang), { weekday: 'short', month: 'short' })}</div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 p-2.5">
                {byDay[k].map((it) => (
                  <AgendaRow key={it.key} item={it} onClick={onItem} projectName={projName(it.data.project_id)} />
                ))}
              </div>
            </div>
          )
        })
      )}
      {unscheduled}
    </div>
  )
}

// Full row (agenda + day panel)
export const AgendaRow = memo(function AgendaRow({ item, onClick, projectName }) {
  const { t } = useT()
  const d = item.data
  let left
  let main
  let cls = 'border-line bg-surface hover:border-line2 hover:bg-surface2'
  if (item.kind === 'event') {
    left = <span className="h-full min-h-[36px] w-1 shrink-0 bg-accent" />
    main = (
      <>
        <span className="num mr-2 text-[13px] text-accent">
          {d.all_day ? t('cal.allDay') : hm(new Date(d.starts_at)) + (d.ends_at ? '–' + hm(new Date(d.ends_at)) : '')}
        </span>
        <span className="text-[15px] font-medium text-ink">{d.title}</span>
        {d.location && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted">
            <Icon name="pin" size={13} /> {d.location}
          </span>
        )}
      </>
    )
  } else if (item.kind === 'goal') {
    left = <span className="h-full min-h-[36px] w-1 shrink-0" style={{ background: LEGEND }} />
    main = (
      <>
        <span className="mr-2 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: LEGEND }}>
          {t('cal.goal')}
        </span>
        <span className={`text-[15px] font-medium ${d.done ? 'text-faint line-through' : 'text-ink'}`}>{d.title}</span>
      </>
    )
  } else {
    const s = STATUS[d.status] || STATUS.new
    const overdue = isOverdue(d)
    if (overdue) cls = 'border-accent/60 bg-accent/[0.06] hover:border-accent'
    left = <span className="h-full min-h-[36px] w-1 shrink-0" style={{ background: s.dot }} />
    main = (
      <>
        <span className={`num mr-2 text-[13px] ${overdue ? 'text-accent' : 'text-faint'}`}>{num(d.number)}</span>
        <span className={`text-[15px] font-medium ${isClosed(d.status) ? 'text-faint line-through' : 'text-ink'}`}>{d.title}</span>
        <span className="ml-2 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: s.text }}>
          {t('enum.status.' + (STATUS[d.status] ? d.status : 'new'))}
        </span>
        {overdue && <span className="ml-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">{t('cal.overdue')}</span>}
      </>
    )
  }
  return (
    <button type="button" onClick={() => onClick(item)} className={`flex w-full items-stretch gap-3 border pr-3 text-left transition-colors active:scale-[.995] ${cls}`}>
      {left}
      <span className="min-w-0 flex-1 py-2">
        <span className="block">{main}</span>
        {projectName && <span className="mt-0.5 block truncate text-[12px] text-faint">{projectName}</span>}
      </span>
      <Icon name="forward" size={16} className="self-center text-faint" />
    </button>
  )
})

// ── DAY PANEL ────────────────────────────────────────────────────────────
export function DayPanel({ dayKey, items, onItem, onCreate, projName, lang, onClose }) {
  const { t } = useT()
  const d = parseYmd(dayKey)
  const isToday = dayKey === todayKey()
  const sorted = useMemo(() => items, [items])
  return (
    <div className="flex h-full min-h-0 flex-col border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="label">{isToday ? t('cal.today') : d.toLocaleDateString(localeOf(lang), { weekday: 'long' })}</div>
          <div className="display mt-1 text-[30px] text-ink">
            {d.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-accent btn-sm" onClick={() => onCreate(dayKey)}>
            <Icon name="plus" size={15} /> {t('cal.event')}
          </button>
          {onClose && (
            <button className="icon-btn h-9 w-9 lg:hidden" onClick={onClose} aria-label={t('common.close')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[14px] text-muted">{t('cal.dayEmpty')}</p>
            <button className="btn-link mt-3 text-[14px]" onClick={() => onCreate(dayKey)}>
              {t('cal.addSomething')} <Icon name="arrowRight" size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.map((it) => (
              <AgendaRow key={it.key} item={it} onClick={onItem} projectName={projName(it.data.project_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
