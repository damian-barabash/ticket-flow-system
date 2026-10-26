// Daily deadline reminders → push. Invoked by pg_cron (pg_net) once a day.
// Protected by a shared secret header (X-Cron-Secret), not a user JWT.
// Sends: goals (project_deadlines) and tickets whose deadline is TOMORROW.
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FCM_PROJECT = Deno.env.get('FCM_PROJECT_ID') ?? ''
const SA_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

let cachedToken = ''
let cachedExp = 0

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedExp - 60 > now) return cachedToken
  const sa = JSON.parse(SA_RAW)
  const te = new TextEncoder()
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  }
  const unsigned = `${b64url(te.encode(JSON.stringify(header)))}.${b64url(te.encode(JSON.stringify(claims)))}`
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(unsigned))
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await res.json()
  if (!j.access_token) throw new Error('oauth_failed')
  cachedToken = j.access_token
  cachedExp = now + (j.expires_in ?? 3600)
  return cachedToken
}

async function rest(path: string): Promise<any[]> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
  if (!r.ok) return []
  return (await r.json().catch(() => [])) as any[]
}
async function dropToken(token: string) {
  await fetch(`${URL_}/rest/v1/push_tokens?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, Prefer: 'return=minimal' },
  })
}
interface Tok { user_id: string; token: string; app_version: string | null }
async function send(tk: Tok, title: string, body: string, data: Record<string, string>, group: string) {
  const token = tk.token
  const modern = !!tk.app_version
  const android: any = { priority: 'HIGH', notification: { sound: 'default', tag: group } }
  if (modern) android.notification.channel_id = 'tf_reminders'
  const aps: any = { sound: 'default', 'thread-id': group }
  if (!modern) aps.badge = 1
  const at = await accessToken()
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android,
        apns: { headers: { 'apns-priority': '10' }, payload: { aps } },
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    if (/UNREGISTERED|registration token is not a valid|Requested entity was not found/i.test(txt)) await dropToken(token)
  }
}

type Lang = 'pl' | 'ru' | 'en'
const L = (lang: string, m: Record<string, string>) => m[lang] ?? m.pl

// Everyone who can see the project: owner + members.
async function audience(projectId: string): Promise<string[]> {
  const p = await rest(`projects?id=eq.${projectId}&select=created_by,archived`)
  if (p[0]?.archived) return []
  const m = await rest(`project_members?project_id=eq.${projectId}&select=user_id`)
  const s = new Set<string>()
  if (p[0]?.created_by) s.add(p[0].created_by)
  for (const x of m) if (x.user_id) s.add(x.user_id)
  return [...s]
}

function inMinutes(lang: string, mins: number): string {
  if (mins <= 1) return L(lang, { pl: 'za chwilę', ru: 'сейчас', en: 'now' })
  if (mins < 60) return L(lang, { pl: `za ${mins} min`, ru: `через ${mins} мин`, en: `in ${mins} min` })
  const h = Math.round(mins / 60)
  if (h < 24) return L(lang, { pl: `za ${h} godz.`, ru: `через ${h} ч`, en: `in ${h} h` })
  const d = Math.round(h / 24)
  return L(lang, { pl: `za ${d} dn.`, ru: `через ${d} дн.`, en: `in ${d} d` })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  if (!CRON_SECRET || req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }
  const payload = await req.json().catch(() => ({}))
  const mode = String(payload?.mode ?? 'daily')
  let sent = 0

  // Send `make(lang)` to `ids`, honouring notification_settings.reminders + muted projects.
  async function deliver(ids: string[], projectId: string | null, make: (lang: string) => { title: string; body: string }, data: Record<string, string>, group: string) {
    if (!ids.length) return
    const inList = `(${ids.join(',')})`
    const [profs, prefs, tokens] = await Promise.all([
      rest(`profiles?id=in.${inList}&select=id,language`),
      rest(`notification_settings?user_id=in.${inList}`),
      rest(`push_tokens?user_id=in.${inList}&select=user_id,token,app_version`),
    ])
    const langOf: Record<string, string> = {}
    for (const p of profs) langOf[p.id] = p.language ?? 'pl'
    const prefOf: Record<string, any> = {}
    for (const p of prefs) prefOf[p.user_id] = p
    const jobs: Promise<void>[] = []
    for (const row of tokens as Tok[]) {
      const pr = prefOf[row.user_id]
      if (pr && pr.reminders === false) continue
      if (pr && projectId && Array.isArray(pr.muted_projects) && pr.muted_projects.includes(projectId)) continue
      const { title, body } = make(langOf[row.user_id] ?? 'pl')
      jobs.push(send(row, title, body, data, group).then(() => { sent++ }))
    }
    await Promise.all(jobs)
  }

  try {
    if (mode === 'events') {
      // Claim due reminders atomically (reminded_at stamped first → no duplicates).
      const now = new Date()
      const horizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()
      const cands = await rest(
        `calendar_events?reminded_at=is.null&remind_minutes=not.is.null&starts_at=gte.${new Date(now.getTime() - 3600 * 1000).toISOString()}&starts_at=lte.${horizon}&select=id,title,project_id,created_by,starts_at,remind_minutes,all_day,location`,
      )
      const due = cands.filter((e) => new Date(e.starts_at).getTime() - e.remind_minutes * 60000 <= now.getTime())
      let events = 0
      for (const e of due) {
        const r = await fetch(`${URL_}/rest/v1/calendar_events?id=eq.${e.id}&reminded_at=is.null`, {
          method: 'PATCH',
          headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ reminded_at: now.toISOString() }),
        })
        const claimed = r.ok ? await r.json().catch(() => []) : []
        if (!claimed.length) continue
        events++
        const ids = e.project_id ? await audience(e.project_id) : [e.created_by]
        let pname = ''
        if (e.project_id) pname = (await rest(`projects?id=eq.${e.project_id}&select=name`))[0]?.name ?? ''
        const mins = Math.max(0, Math.round((new Date(e.starts_at).getTime() - now.getTime()) / 60000))
        await deliver(
          ids,
          e.project_id,
          (lang) => ({
            title: `${e.title}`,
            body: [e.all_day ? L(lang, { pl: 'Dziś', ru: 'Сегодня', en: 'Today' }) : inMinutes(lang, mins), pname, e.location].filter(Boolean).join(' · '),
          }),
          { type: 'event_reminder', event_id: e.id, project_id: e.project_id ?? '' },
          `event-${e.id}`,
        )
      }
      return new Response(JSON.stringify({ ok: true, events, sent }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Daily: goals + tickets due TOMORROW (plain dates, UTC).
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    const goals = await rest(`project_deadlines?deadline=eq.${tomorrow}&done=is.false&select=id,title,project_id`)
    const tickets = await rest(`tickets?due_date=eq.${tomorrow}&status=not.in.(done,rejected)&select=id,number,title,project_id,assigned_to`)
    const aud: Record<string, string[]> = {}
    const names: Record<string, string> = {}
    async function proj(pid: string) {
      if (!aud[pid]) {
        aud[pid] = await audience(pid)
        names[pid] = (await rest(`projects?id=eq.${pid}&select=name`))[0]?.name ?? ''
      }
    }
    for (const g of goals) {
      await proj(g.project_id)
      await deliver(
        aud[g.project_id],
        g.project_id,
        (lang) => ({
          title: L(lang, { pl: 'Jutro termin celu', ru: 'Завтра дедлайн цели', en: 'Goal due tomorrow' }),
          body: [g.title, names[g.project_id]].filter(Boolean).join(' · '),
        }),
        { type: 'deadline_soon', project_id: g.project_id, ticket_id: '' },
        `goal-${g.id}`,
      )
    }
    for (const t of tickets) {
      await proj(t.project_id)
      // An assigned ticket only bothers its assignee (+ owner); otherwise the whole project.
      const ids = t.assigned_to ? [...new Set([t.assigned_to, ...aud[t.project_id].slice(0, 1)])] : aud[t.project_id]
      await deliver(
        ids,
        t.project_id,
        (lang) => ({
          title: L(lang, { pl: 'Jutro termin zgłoszenia', ru: 'Завтра дедлайн тикета', en: 'Ticket due tomorrow' }),
          body: `#${String(t.number ?? 0).padStart(3, '0')} ${t.title ?? ''} · ${names[t.project_id]}`,
        }),
        { type: 'deadline_soon', project_id: t.project_id, ticket_id: t.id },
        `ticket-${t.id}`,
      )
    }
    return new Response(JSON.stringify({ ok: true, goals: goals.length, tickets: tickets.length, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 })
  }
})
