import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { Icon, Spinner, ErrorState, useToast } from '../components/ui'
import {
  addDays,
  eventDays,
  isClosed,
  isOverdue,
  loadRange,
  parseYmd,
  shiftAnchor,
  startOfDay,
  todayKey,
  viewRange,
  ymd,
} from '../lib/calendar'
import { AgendaView, DayPanel, MonthView, WeekView, localeOf, LEGEND } from '../components/calendar/views'
import { EventFormModal } from '../components/calendar/EventFormModal'
import { SubscribeModal } from '../components/calendar/SubscribeModal'

const VIEWS = ['month', 'week', 'agenda']
const lsGet = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}
const num = (n) => '#' + String(n ?? 0).padStart(3, '0')

export default function Calendar() {
  const { t, lang } = useT()
  const { user } = useAuth()
  const me = user?.id
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [view, setView] = useState(() => {
    const v = lsGet('tf_cal_view', 'month')
    return VIEWS.includes(v) ? v : 'month'
  })
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState(todayKey())
  const [dayOpen, setDayOpen] = useState(false) // mobile day sheet
  const [data, setData] = useState({ tickets: [], goals: [], events: [] })
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [syncing, setSyncing] = useState(false)
  const [projects, setProjects] = useState([])
  const [projFilter, setProjFilter] = useState(() => {
    const p = new URLSearchParams(location.search).get('project')
    return p ? [p] : []
  })
  const [types, setTypes] = useState(() => {
    try {
      return { tickets: true, goals: true, events: true, ...JSON.parse(lsGet('tf_cal_types', '{}')) }
    } catch {
      return { tickets: true, goals: true, events: true }
    }
  })
  const [onlyMine, setOnlyMine] = useState(() => lsGet('tf_cal_mine', '0') === '1')
  const [eventModal, setEventModal] = useState(null)
  const [subOpen, setSubOpen] = useState(false)
  const [unscheduled, setUnscheduled] = useState(null)
  const [unschedOpen, setUnschedOpen] = useState(true)

  useEffect(() => lsSet('tf_cal_view', view), [view])
  useEffect(() => lsSet('tf_cal_types', JSON.stringify(types)), [types])
  useEffect(() => lsSet('tf_cal_mine', onlyMine ? '1' : '0'), [onlyMine])
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('project')
    if (p) setProjFilter([p])
  }, [location.search])

  const { from, to } = useMemo(() => viewRange(view, anchor), [view, anchor])

  // projects (names + filter + event form)
  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, created_by, archived')
      .order('name')
      .then(({ data: ps }) => setProjects((ps ?? []).filter((p) => !p.archived)))
  }, [])
  const projNames = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])
  const projName = useCallback((id) => (id ? projNames[id] || '' : t('cal.personal')), [projNames, t])

  // range data (keep stale data visible while refreshing)
  const req = useRef(0)
  const statusRef = useRef(status)
  statusRef.current = status
  const load = useCallback(async () => {
    const id = ++req.current
    setSyncing(true)
    try {
      const d = await loadRange(from, to)
      if (id !== req.current) return
      setData(d)
      setStatus('ready')
    } catch {
      if (id !== req.current) return
      if (statusRef.current === 'ready') toast.show(t('common.loadError'), { tone: 'error' })
      else setStatus('error')
    } finally {
      if (id === req.current) setSyncing(false)
    }
  }, [from.getTime(), to.getTime()])
  useEffect(() => {
    load()
  }, [load])

  // realtime: patch events from payload
  useEffect(() => {
    if (!me) return // a channel joined before the session is known would carry the anon JWT
    const ch = supabase
      .channel('cal-page-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, (p) => {
        setData((d) => {
          if (p.eventType === 'DELETE') return { ...d, events: d.events.filter((e) => e.id !== p.old?.id) }
          const row = p.new
          const i = d.events.findIndex((e) => e.id === row.id)
          const events = i >= 0 ? d.events.map((e) => (e.id === row.id ? row : e)) : [...d.events, row]
          return { ...d, events }
        })
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me])

  // ── filtering + day buckets ──
  const pass = useCallback(
    (row, kind) => {
      if (projFilter.length && !(row.project_id && projFilter.includes(row.project_id))) {
        // personal events are always "mine": keep them visible only with no project filter
        return false
      }
      if (onlyMine) {
        if (kind === 'ticket') return row.assigned_to === me || row.created_by === me
        return row.created_by === me
      }
      return true
    },
    [projFilter, onlyMine, me],
  )

  const { byDay, timedByDay, counts } = useMemo(() => {
    const byDay = {}
    const timedByDay = {}
    const counts = { tickets: 0, goals: 0, events: 0, overdue: 0 }
    const push = (k, it) => (byDay[k] || (byDay[k] = [])).push(it)
    if (types.events)
      data.events.forEach((ev) => {
        if (!pass(ev, 'event')) return
        const days = eventDays(ev)
        const multi = days.length > 1
        days.forEach((k) => {
          const it = { key: 'e' + ev.id + k, kind: 'event', data: ev, multi, sort: ev.all_day || multi ? 0 : 1, at: ev.starts_at }
          push(k, it)
          if (!ev.all_day && !multi) (timedByDay[k] || (timedByDay[k] = [])).push(it)
        })
        counts.events++
      })
    if (types.goals)
      data.goals.forEach((g) => {
        if (!pass(g, 'goal')) return
        push(String(g.deadline).slice(0, 10), { key: 'g' + g.id, kind: 'goal', data: g, sort: 2 })
        counts.goals++
      })
    if (types.tickets)
      data.tickets.forEach((tk) => {
        if (!pass(tk, 'ticket')) return
        push(String(tk.due_date).slice(0, 10), {
          key: 't' + tk.id,
          kind: 'ticket',
          data: tk,
          sort: isClosed(tk.status) ? 5 : isOverdue(tk) ? 3 : 4,
        })
        counts.tickets++
        if (isOverdue(tk)) counts.overdue++
      })
    Object.values(byDay).forEach((arr) =>
      arr.sort((a, b) => a.sort - b.sort || String(a.at || '').localeCompare(String(b.at || '')) || (a.data.number ?? 0) - (b.data.number ?? 0)),
    )
    return { byDay, timedByDay, counts }
  }, [data, types, pass])

  // ── unscheduled tickets (agenda view) ──
  const loadUnscheduled = useCallback(async () => {
    let q = supabase
      .from('tickets')
      .select('id, number, title, status, due_date, project_id, assigned_to, created_by, is_task')
      .is('due_date', null)
      .not('status', 'in', '(done,rejected)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (projFilter.length) q = q.in('project_id', projFilter)
    if (onlyMine && me) q = q.or(`assigned_to.eq.${me},created_by.eq.${me}`)
    const { data: rows, error } = await q
    setUnscheduled(error ? [] : rows ?? [])
  }, [projFilter, onlyMine, me])
  useEffect(() => {
    if (view === 'agenda' && types.tickets) loadUnscheduled()
  }, [view, types.tickets, loadUnscheduled])

  async function setDue(tk, date) {
    if (!date) return
    setUnscheduled((xs) => xs.filter((x) => x.id !== tk.id))
    setData((d) => ({ ...d, tickets: [...d.tickets.filter((x) => x.id !== tk.id), { ...tk, due_date: date }] }))
    const rollback = () => {
      setData((d) => ({ ...d, tickets: d.tickets.filter((x) => x.id !== tk.id) }))
      setUnscheduled((xs) => [tk, ...(xs || []).filter((x) => x.id !== tk.id)])
    }
    // optimistic: confirm instantly, undo available right away
    toast.show(t('cal.dueSet', { n: num(tk.number), date: parseYmd(date).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' }) }), {
      action: {
        label: t('common.undo'),
        onClick: async () => {
          rollback()
          await pending
          await supabase.from('tickets').update({ due_date: null }).eq('id', tk.id)
        },
      },
    })
    // .then() turns the (re-runnable) query builder into a one-shot promise
    const pending = supabase.from('tickets').update({ due_date: date }).eq('id', tk.id).then((r) => r)
    const { error } = await pending
    if (error) {
      rollback()
      toast.show(t('common.error'), { tone: 'error' })
    }
  }

  // ── navigation ──
  const go = useCallback((dir) => setAnchor((a) => shiftAnchor(view, a, dir)), [view])
  const goToday = useCallback(() => {
    setAnchor(startOfDay(new Date()))
    setSelected(todayKey())
  }, [])
  const createAt = useCallback((dayKey, start) => {
    setEventModal({ date: dayKey, start, project_id: projFilter.length === 1 ? projFilter[0] : '' })
  }, [projFilter])

  const onItem = useCallback(
    (it) => {
      if (it.kind === 'event') setEventModal(it.data)
      else if (it.kind === 'ticket') navigate(`/projects/${it.data.project_id}?ticket=${it.data.id}`)
      else navigate(`/projects/${it.data.project_id}`)
    },
    [navigate],
  )
  const onSelectDay = useCallback(
    (k) => {
      setSelected(k)
      setDayOpen(true)
      const d = parseYmd(k)
      if (view === 'month' && d.getMonth() !== anchor.getMonth()) setAnchor(new Date(d.getFullYear(), d.getMonth(), 1))
    },
    [view, anchor],
  )

  // keyboard: ← → navigate, T today, N new event
  useEffect(() => {
    const onKey = (e) => {
      if (eventModal || subOpen || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 't' || e.key === 'T') goToday()
      else if (e.key === 'n' || e.key === 'N') createAt(selected)
      else if (e.key === 'Escape' && dayOpen) setDayOpen(false)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, goToday, createAt, selected, eventModal, subOpen, dayOpen])

  // ── event modal callbacks (optimistic patch; realtime will confirm) ──
  const onSaved = (row) =>
    setData((d) => {
      const i = d.events.findIndex((e) => e.id === row.id)
      return { ...d, events: i >= 0 ? d.events.map((e) => (e.id === row.id ? row : e)) : [...d.events, row] }
    })
  const onDeleted = (id) => setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }))

  // ── title ──
  const loc = localeOf(lang)
  const title =
    view === 'month'
      ? anchor.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${from.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : `${from.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString(loc, { day: 'numeric', month: 'short' })}`

  const toggleProj = (id) => setProjFilter((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  const typeChip = (k, color, label, n) => (
    <button key={k} onClick={() => setTypes((x) => ({ ...x, [k]: !x[k] }))} className={`chip ${types[k] ? 'border-line2 text-ink' : 'opacity-50 line-through'}`} aria-pressed={types[k]}>
      <span className="h-2.5 w-2.5" style={{ background: color }} />
      {label}
      {types[k] && <span className="num text-[12px] text-faint">{n}</span>}
    </button>
  )

  const dayItems = byDay[selected] || []
  const unschedBlock =
    view === 'agenda' && types.tickets && unscheduled && unscheduled.length > 0 ? (
      <div className="border-t-2 border-line2">
        <button onClick={() => setUnschedOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
          <Icon name={unschedOpen ? 'down' : 'forward'} size={16} className="text-faint" />
          <span className="tag">{t('cal.unscheduled')}</span>
          <span className="num text-[13px] text-faint">{unscheduled.length}</span>
          <span className="ml-auto hidden text-[13px] text-faint sm:block">{t('cal.unscheduledHint')}</span>
        </button>
        {unschedOpen && (
          <div className="flex flex-col">
            {unscheduled.map((tk) => (
              <div key={tk.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5">
                <button className="flex min-w-0 flex-1 items-baseline gap-2 text-left" onClick={() => navigate(`/projects/${tk.project_id}?ticket=${tk.id}`)}>
                  <span className="num text-[13px] text-faint">{num(tk.number)}</span>
                  <span className="truncate text-[15px] text-ink hover:underline">{tk.title}</span>
                  <span className="hidden truncate text-[12px] text-faint sm:inline">{projName(tk.project_id)}</span>
                </button>
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <Icon name="calendar" size={15} />
                  <input type="date" className="input-box w-auto py-1.5 text-[14px]" aria-label={t('cal.setDue')} onChange={(e) => setDue(tk, e.target.value)} />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopBar />
      <main className="page-in mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-4 pb-6 pt-5 sm:px-6">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="icon-btn-sm -ml-1.5" aria-label={t('common.back')}>
                <Icon name="back" size={18} />
              </button>
              <span className="tag">{t('cal.title')}</span>
              {syncing && status === 'ready' && <Spinner size={12} />}
            </div>
            <h1 className="display mt-2 text-[34px] text-ink first-letter:uppercase sm:text-[52px]">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex border border-line" role="tablist">
              {VIEWS.map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-10 px-3.5 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors ${view === v ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
                  {t('cal.view.' + v)}
                </button>
              ))}
            </div>
            <div className="flex">
              <button className="icon-btn" onClick={() => go(-1)} aria-label={t('cal.prev')} title="←">
                <Icon name="back" size={18} />
              </button>
              <button className="h-10 border-y border-line px-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink hover:bg-surface2" onClick={goToday} title="T">
                {t('cal.today')}
              </button>
              <button className="icon-btn" onClick={() => go(1)} aria-label={t('cal.next')} title="→">
                <Icon name="forward" size={18} />
              </button>
            </div>
            <button className="btn-ghost btn-sm min-h-[40px]" onClick={() => setSubOpen(true)}>
              <Icon name="link" size={15} /> <span className="hidden sm:inline">{t('cal.subscribe')}</span>
            </button>
            <button className="btn-accent btn-sm min-h-[40px]" onClick={() => createAt(selected)} title="N">
              <Icon name="plus" size={16} /> {t('cal.event')}
            </button>
          </div>
        </div>

        {/* filters */}
        <div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto pb-1">
          <button onClick={() => setProjFilter([])} className={`chip shrink-0 ${projFilter.length === 0 ? 'chip-on' : ''}`}>
            {t('cal.allProjects')}
          </button>
          {projects.map((p) => (
            <button key={p.id} onClick={() => toggleProj(p.id)} className={`chip shrink-0 ${projFilter.includes(p.id) ? 'chip-on' : ''}`}>
              {projFilter.includes(p.id) && <Icon name="check" size={13} />}
              <span className="max-w-[180px] truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto pb-1">
          {typeChip('tickets', '#E3B341', t('cal.types.tickets'), counts.tickets)}
          {typeChip('goals', LEGEND, t('cal.types.goals'), counts.goals)}
          {typeChip('events', '#F2231B', t('cal.types.events'), counts.events)}
          <span className="mx-1 h-6 w-px shrink-0 bg-line" />
          <button onClick={() => setOnlyMine((v) => !v)} className={`chip shrink-0 ${onlyMine ? 'chip-accent' : ''}`} aria-pressed={onlyMine}>
            <Icon name="user" size={14} /> {t('cal.onlyMine')}
          </button>
          {counts.overdue > 0 && (
            <span className="ml-1 flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-accent">
              <Icon name="alert" size={14} /> {t('cal.overdueN', { n: counts.overdue })}
            </span>
          )}
        </div>

        {/* body */}
        {status === 'loading' ? (
          <div className="mt-4 grid flex-1 animate-pulse grid-cols-7 gap-px border border-line bg-line" style={{ minHeight: 480 }}>
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="bg-surface" />
            ))}
          </div>
        ) : status === 'error' ? (
          <div className="mt-10">
            <ErrorState onRetry={load} onClose={() => navigate('/projects')} />
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
            <div
              key={view}
              className={`cal-in min-w-0 flex-1 ${view === 'agenda' ? 'lg:h-[calc(100vh-290px)] lg:min-h-[520px]' : view === 'week' ? 'h-[calc(100vh-200px)] min-h-[520px] lg:h-[calc(100vh-290px)]' : 'lg:h-[calc(100vh-290px)] lg:min-h-[560px]'}`}
            >
              {view === 'month' && (
                <MonthView anchor={anchor} from={from} to={to} byDay={byDay} selected={selected} onSelect={onSelectDay} onCreate={(k) => createAt(k)} onItem={onItem} projName={projName} lang={lang} />
              )}
              {view === 'week' && (
                <WeekView
                  from={from}
                  byDay={byDay}
                  timedByDay={timedByDay}
                  selected={selected}
                  onSelect={onSelectDay}
                  onSlot={(start) => createAt(ymd(start), start)}
                  onItem={onItem}
                  projName={projName}
                  lang={lang}
                />
              )}
              {view === 'agenda' && (
                <AgendaView from={from} to={to} byDay={byDay} onItem={onItem} onCreate={(k) => createAt(k)} projName={projName} lang={lang} unscheduled={unschedBlock} />
              )}
            </div>
            {/* day panel: side column on desktop; below the grid on mobile (month) */}
            {view !== 'agenda' && (
              <aside className={`w-full shrink-0 lg:block lg:h-[calc(100vh-290px)] lg:min-h-[520px] lg:w-[340px] ${view === 'month' ? '' : dayOpen ? '' : 'hidden'}`}>
                <DayPanel
                  dayKey={selected}
                  items={dayItems}
                  onItem={onItem}
                  onCreate={(k) => createAt(k)}
                  projName={projName}
                  lang={lang}
                  onClose={view === 'week' ? () => setDayOpen(false) : undefined}
                />
              </aside>
            )}
          </div>
        )}
      </main>

      <style>{`@keyframes calIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.cal-in{animation:calIn 180ms cubic-bezier(.2,.8,.2,1) both}@media (prefers-reduced-motion: reduce){.cal-in{animation:none}}`}</style>

      <EventFormModal
        open={!!eventModal}
        initial={eventModal}
        projects={projects}
        onClose={() => setEventModal(null)}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
      <SubscribeModal open={subOpen} onClose={() => setSubOpen(false)} />
    </div>
  )
}
