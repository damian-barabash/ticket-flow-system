// Personal iCal feed (2026-10-26). GET /calendar-feed?t=<token>
// Subscribed from Google Calendar / Apple Calendar / Outlook. The token is a
// per-user secret (table calendar_feeds); the feed contains ticket deadlines,
// project goals and calendar events of the projects the user owns or belongs to.
// verify_jwt = false — calendar apps can't send a Supabase JWT.
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP = Deno.env.get('APP_URL') ?? 'https://ticketflow.pl'

async function rest(path: string): Promise<any[]> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
  if (!r.ok) return []
  return (await r.json().catch(() => [])) as any[]
}

const T: Record<string, Record<string, string>> = {
  cal: { pl: 'Ticket Flow', ru: 'Ticket Flow', en: 'Ticket Flow' },
  goal: { pl: 'Cel', ru: 'Цель', en: 'Goal' },
  due: { pl: 'Termin', ru: 'Дедлайн', en: 'Due' },
  done: { pl: 'gotowe', ru: 'выполнено', en: 'done' },
}

function esc(s: string): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')
}
// RFC 5545 line folding at 75 octets
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length
    if (curLen + l > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      curLen = 0
    }
    cur += ch
    curLen += l
  }
  out.push(cur)
  return out.join('\r\n ')
}
const dt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dOnly = (s: string) => s.slice(0, 10).replace(/-/g, '')
function nextDay(s: string): string {
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const token = (u.searchParams.get('t') ?? '').trim()
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('not found', { status: 404 })

  const [feed] = await rest(`calendar_feeds?token=eq.${token}&select=user_id`)
  if (!feed) return new Response('not found', { status: 404 })
  const uid = feed.user_id
  const [prof] = await rest(`profiles?id=eq.${uid}&select=language`)
  const lang = ['pl', 'ru', 'en'].includes(prof?.language) ? prof.language : 'pl'
  const L = (k: string) => T[k][lang]

  const owned = await rest(`projects?created_by=eq.${uid}&archived=is.false&select=id,name`)
  const mem = await rest(`project_members?user_id=eq.${uid}&select=project_id,projects(id,name,archived)`)
  const projects: Record<string, string> = {}
  for (const p of owned) projects[p.id] = p.name
  for (const m of mem) if (m.projects && !m.projects.archived) projects[m.projects.id] = m.projects.name
  const ids = Object.keys(projects)

  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  let tickets: any[] = []
  let goals: any[] = []
  let events: any[] = []
  if (ids.length) {
    const inList = `(${ids.join(',')})`
    ;[tickets, goals] = await Promise.all([
      rest(`tickets?project_id=in.${inList}&due_date=gte.${since}&status=neq.rejected&select=id,number,title,description,project_id,due_date,status,assigned_to&limit=2000`),
      rest(`project_deadlines?project_id=in.${inList}&deadline=gte.${since}&select=id,title,project_id,deadline,done&limit=1000`),
    ])
    events = await rest(`calendar_events?project_id=in.${inList}&starts_at=gte.${since}&select=*&limit=2000`)
  }
  const personal = await rest(`calendar_events?project_id=is.null&created_by=eq.${uid}&starts_at=gte.${since}&select=*&limit=1000`)
  events = events.concat(personal)

  const now = dt(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//dbdc studio//Ticket Flow//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(L('cal'))}`,
    'X-WR-CALDESC:ticketflow.pl',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
  ]
  const push = (...l: string[]) => lines.push(...l)

  for (const t of tickets) {
    const no = `#${String(t.number ?? 0).padStart(3, '0')}`
    const done = t.status === 'done'
    push(
      'BEGIN:VEVENT',
      `UID:ticket-${t.id}@ticketflow.pl`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dOnly(t.due_date)}`,
      `DTEND;VALUE=DATE:${nextDay(t.due_date)}`,
      `SUMMARY:${esc(`${done ? '✓ ' : ''}${no} ${t.title} · ${projects[t.project_id] ?? ''}`)}`,
      `DESCRIPTION:${esc(`${L('due')}${done ? ' (' + L('done') + ')' : ''}\n${(t.description ?? '').slice(0, 900)}`)}`,
      `URL:${APP}/#/projects/${t.project_id}?ticket=${t.id}`,
      'TRANSP:TRANSPARENT',
      `CATEGORIES:${esc(projects[t.project_id] ?? 'Ticket Flow')}`,
      'END:VEVENT',
    )
  }
  for (const g of goals) {
    push(
      'BEGIN:VEVENT',
      `UID:goal-${g.id}@ticketflow.pl`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dOnly(g.deadline)}`,
      `DTEND;VALUE=DATE:${nextDay(g.deadline)}`,
      `SUMMARY:${esc(`${g.done ? '✓ ' : '★ '}${L('goal')}: ${g.title} · ${projects[g.project_id] ?? ''}`)}`,
      `URL:${APP}/#/projects/${g.project_id}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  for (const e of events) {
    const where = e.project_id ? projects[e.project_id] : ''
    const ev = [
      'BEGIN:VEVENT',
      `UID:event-${e.id}@ticketflow.pl`,
      `DTSTAMP:${now}`,
    ]
    if (e.all_day) {
      // All-day events are stored as local midnight → next local midnight (exclusive).
      // Shifting by +12h lands on the intended calendar date for any UTC−12…+12 zone.
      const day = (iso: string) => new Date(new Date(iso).getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10)
      const sd = day(e.starts_at)
      const ed = e.ends_at ? day(e.ends_at) : ''
      ev.push(`DTSTART;VALUE=DATE:${dOnly(sd)}`, `DTEND;VALUE=DATE:${ed && ed > sd ? dOnly(ed) : nextDay(sd)}`)
    } else {
      const s = new Date(e.starts_at)
      const en = e.ends_at ? new Date(e.ends_at) : new Date(s.getTime() + 3600 * 1000)
      ev.push(`DTSTART:${dt(s)}`, `DTEND:${dt(en)}`)
    }
    ev.push(`SUMMARY:${esc(e.title + (where ? ` · ${where}` : ''))}`)
    if (e.notes) ev.push(`DESCRIPTION:${esc(e.notes)}`)
    if (e.location) ev.push(`LOCATION:${esc(e.location)}`)
    if (e.project_id) ev.push(`URL:${APP}/#/projects/${e.project_id}`)
    if (e.remind_minutes != null) {
      ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.remind_minutes}M`, 'END:VALARM')
    }
    ev.push('END:VEVENT')
    push(...ev)
  }
  push('END:VCALENDAR')

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="ticketflow.ics"',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
