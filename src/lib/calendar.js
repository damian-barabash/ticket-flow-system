// Calendar helpers: local-date math, range loading, feed/subscribe links.
// Dates are handled as LOCAL days ('YYYY-MM-DD' keys). Ticket due dates and goal
// deadlines are plain DATE columns; events are timestamptz.
// All-day events: starts_at = local 00:00 of the first day, ends_at = local 00:00
// of the day AFTER the last day (exclusive end, like iCal DTEND;VALUE=DATE).
import { supabase, SUPABASE_URL } from './supabase'

export const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
// Monday-first weeks
export function startOfWeek(d) {
  const x = startOfDay(d)
  return addDays(x, -((x.getDay() + 6) % 7))
}
export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
export const todayKey = () => ymd(new Date())

export const AGENDA_DAYS = 30

// Visible range [from, to) for a view anchored at `anchor`.
export function viewRange(view, anchor) {
  if (view === 'month') {
    const from = startOfWeek(startOfMonth(anchor))
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const to = addDays(startOfWeek(last), 7)
    return { from, to }
  }
  if (view === 'week') {
    const from = startOfWeek(anchor)
    return { from, to: addDays(from, 7) }
  }
  const from = startOfDay(anchor)
  return { from, to: addDays(from, AGENDA_DAYS) }
}

export function shiftAnchor(view, anchor, dir) {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
  if (view === 'week') return addDays(anchor, 7 * dir)
  return addDays(anchor, AGENDA_DAYS * dir)
}

// Loads tickets-with-due-date, goals and events overlapping [from, to) (± margin).
export async function loadRange(from, to) {
  const f = addDays(from, -7)
  const tt = addDays(to, 7)
  const fk = ymd(f)
  const tk = ymd(tt)
  const [tix, goals, evs] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, number, title, status, due_date, project_id, assigned_to, created_by, is_task')
      .gte('due_date', fk)
      .lte('due_date', tk)
      .limit(1000),
    supabase.from('project_deadlines').select('id, title, deadline, done, project_id, created_by').gte('deadline', fk).lte('deadline', tk).limit(500),
    supabase
      .from('calendar_events')
      .select('*')
      .lt('starts_at', tt.toISOString())
      .or(`ends_at.gte.${f.toISOString()},starts_at.gte.${f.toISOString()}`)
      .order('starts_at')
      .limit(1000),
  ])
  const err = tix.error || goals.error || evs.error
  if (err) throw err
  return { tickets: tix.data ?? [], goals: goals.data ?? [], events: evs.data ?? [] }
}

// Event → list of local day keys it covers.
export function eventDays(ev) {
  const s = new Date(ev.starts_at)
  let e = ev.ends_at ? new Date(ev.ends_at) : s
  if (ev.all_day) e = new Date(e.getTime() - 1) // exclusive end
  if (e < s) e = s
  const out = []
  let d = startOfDay(s)
  const last = startOfDay(e)
  let guard = 0
  while (d <= last && guard++ < 62) {
    out.push(ymd(d))
    d = addDays(d, 1)
  }
  return out
}

export const isClosed = (status) => status === 'done' || status === 'rejected'
export const isOverdue = (tk, today = todayKey()) => !isClosed(tk.status) && String(tk.due_date).slice(0, 10) < today

// ── subscription feed ──────────────────────────────────────────────────────
export const FEED_BASE = `${SUPABASE_URL}/functions/v1/calendar-feed`
export async function getFeedToken(reset = false) {
  const { data, error } = await supabase.rpc('calendar_feed_token', { p_reset: reset })
  if (error) throw error
  return data
}
export function feedLinks(token) {
  const https = `${FEED_BASE}?t=${token}`
  const webcal = https.replace(/^https:/, 'webcal:')
  return {
    https,
    webcal,
    google: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal),
    outlook: 'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(https),
  }
}

export const REMINDERS = [null, 0, 5, 15, 30, 60, 1440]
