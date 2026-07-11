import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { dict } from '../lib/i18n'
import { formatDay } from '../lib/format'
import { STATUS } from '../lib/constants'
import { Spinner } from './ui'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
function todayStr() {
  const d = new Date()
  return ymd(d.getFullYear(), d.getMonth(), d.getDate())
}

// Minimalist month calendar of deadlines: tickets that carry a due_date plus
// goals. Scoped to one project (projectId) or global (no projectId → every
// project the viewer can access). Big popup on desktop, fullscreen on mobile.
export function CalendarModal({ projectId, onClose, onOpenTicket }) {
  const { t, lang } = useT()
  const all = !projectId
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState([])
  const [goals, setGoals] = useState([])
  const [projNames, setProjNames] = useState({})
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState(todayStr())
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const requestClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => onClose?.(), 200)
  }, [onClose])

  useEffect(() => {
    let alive = true
    ;(async () => {
      // RLS scopes both queries to what the viewer may see; in global mode we
      // simply drop the project filter and also fetch project names for labels.
      let tq = supabase.from('tickets').select('id, number, title, status, due_date, project_id').not('due_date', 'is', null)
      let gq = supabase.from('project_deadlines').select('id, title, deadline, done, project_id')
      if (!all) {
        tq = tq.eq('project_id', projectId)
        gq = gq.eq('project_id', projectId)
      }
      const [{ data: tix }, { data: gl }, projs] = await Promise.all([
        tq,
        gq,
        all ? supabase.from('projects').select('id, name') : Promise.resolve({ data: null }),
      ])
      if (!alive) return
      setTickets(tix ?? [])
      setGoals(gl ?? [])
      if (projs?.data) {
        const m = {}
        projs.data.forEach((p) => (m[p.id] = p.name))
        setProjNames(m)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [projectId, all])

  // 'YYYY-MM-DD' -> { tickets: [], goals: [] }
  const byDate = useMemo(() => {
    const map = {}
    const push = (key, kind, item) => (map[key] || (map[key] = { tickets: [], goals: [] }))[kind].push(item)
    tickets.forEach((tk) => push(String(tk.due_date).slice(0, 10), 'tickets', tk))
    goals.forEach((g) => push(String(g.deadline).slice(0, 10), 'goals', g))
    return map
  }, [tickets, goals])

  const months = dict(lang).months
  const weekdays = dict(lang).calendar.weekdays

  // month grid (Mon-first) with leading/trailing blanks to fill full weeks
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const lead = (first.getDay() + 6) % 7
    const days = new Date(view.y, view.m + 1, 0).getDate()
    const arr = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= days; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [view])

  const today = todayStr()
  const selDay = byDate[selected] || { tickets: [], goals: [] }

  function shift(delta) {
    setView((v) => {
      const total = v.y * 12 + v.m + delta
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
    })
  }

  function goToday() {
    const d = new Date()
    setView({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(todayStr())
  }

  return (
    <div
      className={`fixed inset-0 z-[55] flex items-stretch justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 sm:items-center sm:p-6 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseDown={requestClose}
    >
      <div
        className={`flex h-full w-full flex-col border border-line bg-surface transition-transform duration-200 ease-out sm:h-auto sm:max-h-[88vh] sm:max-w-[760px] ${
          visible ? 'translate-y-0 sm:scale-100' : 'translate-y-3 sm:translate-y-0 sm:scale-95'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-mono uppercase tracking-label text-[12px] text-ink">{all ? t('calendar.titleAll') : t('calendar.title')}</h2>
          <button
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center text-faint transition-colors hover:text-ink"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {/* month nav */}
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => shift(-1)}
                className="flex h-8 w-8 items-center justify-center border border-line text-muted transition-colors hover:border-line2 hover:text-ink"
                aria-label="prev"
              >
                ‹
              </button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-ink">
                  {months[view.m]} {view.y}
                </span>
                <button onClick={goToday} className="label text-muted transition-colors hover:text-ink">
                  {t('calendar.today')}
                </button>
              </div>
              <button
                onClick={() => shift(1)}
                className="flex h-8 w-8 items-center justify-center border border-line text-muted transition-colors hover:border-line2 hover:text-ink"
                aria-label="next"
              >
                ›
              </button>
            </div>

            {/* weekday header */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {weekdays.map((w, i) => (
                <div key={i} className="py-1 text-center font-mono uppercase tracking-label text-[10px] text-faint">
                  {w}
                </div>
              ))}
            </div>

            {/* day grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d == null) return <div key={i} />
                const key = ymd(view.y, view.m, d)
                const items = byDate[key]
                const isToday = key === today
                const isSel = key === selected
                const dots = []
                if (items) {
                  items.tickets.slice(0, 3).forEach((tk, j) => dots.push({ c: (STATUS[tk.status] || STATUS.new).dot, k: `t${j}` }))
                  if (items.goals.length) dots.push({ c: items.goals.some((g) => !g.done) ? '#A974FF' : '#3FB950', k: 'g' })
                }
                const count = items ? items.tickets.length + items.goals.length : 0
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(key)}
                    className={`relative flex aspect-square flex-col items-center justify-center border text-xs transition-colors ${
                      isSel
                        ? 'border-accent bg-accentSoft text-ink'
                        : count
                        ? 'border-line2 text-ink hover:border-accent/50'
                        : 'border-line text-muted hover:border-line2'
                    }`}
                  >
                    <span
                      className={
                        isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-ink font-medium text-bg' : ''
                      }
                    >
                      {d}
                    </span>
                    {dots.length > 0 && (
                      <span className="absolute bottom-1 flex gap-0.5">
                        {dots.slice(0, 4).map((dd) => (
                          <span key={dd.k} className="h-1 w-1 rounded-full" style={{ background: dd.c }} />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* selected day items */}
            <div className="mt-5">
              <div className="mb-2 label">{formatDay(selected)}</div>
              {selDay.tickets.length === 0 && selDay.goals.length === 0 ? (
                <p className="py-6 text-center text-xs text-faint">{t('calendar.empty')}</p>
              ) : (
                <div className="space-y-2">
                  {selDay.tickets.map((tk) => {
                    const s = STATUS[tk.status] || STATUS.new
                    const key = STATUS[tk.status] ? tk.status : 'new'
                    return (
                      <button
                        key={tk.id}
                        onClick={() => onOpenTicket?.(tk.id, tk.project_id)}
                        className="flex w-full items-center gap-3 border border-line bg-bg px-3 py-2.5 text-left transition-colors hover:border-line2"
                      >
                        <span className="h-2 w-2 shrink-0" style={{ background: s.dot }} />
                        <span className="font-mono text-[10px] text-faint">№ {String(tk.number).padStart(3, '0')}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="block truncate text-sm text-ink">{tk.title}</span>
                          {all && projNames[tk.project_id] && (
                            <span className="block truncate font-mono text-[9px] uppercase tracking-label text-faint">
                              {projNames[tk.project_id]}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono uppercase tracking-label text-[9px]" style={{ color: s.text }}>
                          {t('enum.status.' + key)}
                        </span>
                      </button>
                    )
                  })}
                  {selDay.goals.map((g) => (
                    <div
                      key={g.id}
                      className={`flex items-center gap-3 border border-legend/30 bg-legendSoft px-3 py-2.5 ${g.done ? 'opacity-60' : ''}`}
                    >
                      <span className="shrink-0" style={{ color: g.done ? '#3FB950' : '#A974FF' }}>
                        {g.done ? '✓' : '✦'}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-sm text-ink ${g.done ? 'line-through' : ''}`}>{g.title}</span>
                      <span className="shrink-0 font-mono uppercase tracking-label text-[9px] text-faint">
                        {t('calendar.goalsLabel')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
