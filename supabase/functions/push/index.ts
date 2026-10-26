// Push notifications (FCM HTTP v1), v6 — 2026-10-26.
// Called by the web panel and the apps on project events. The caller must be
// able to see the ticket/project (checked with the caller's own JWT through RLS);
// recipients are resolved SERVER-SIDE and filtered by notification_settings.
// Dependency-free: service-account JWT (RS256) → OAuth token → FCM send.
//
// body: { event, ticket_id?, project_id?, comment_id?, message_id?, status?, assignee? }
// events: ticket_created | status_changed | comment_added | task_assigned |
//         assigned | chat_message
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const FCM_PROJECT = Deno.env.get('FCM_PROJECT_ID') ?? ''
const SA_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''

function cors(o: string | null) {
  return {
    'Access-Control-Allow-Origin': o && /^(https:\/\/(www\.)?ticketflow\.pl|https:\/\/tickets\.barabashflow\.pl|http:\/\/localhost(:\d+)?)$/.test(o) ? o : 'https://ticketflow.pl',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
function json(b: unknown, s: number, o: string | null) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), 'Content-Type': 'application/json' } })
}

// ---------- Google OAuth (service account → access token), cached in memory ----------
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
  if (!j.access_token) throw new Error('oauth_failed: ' + JSON.stringify(j).slice(0, 160))
  cachedToken = j.access_token
  cachedExp = now + (j.expires_in ?? 3600)
  return cachedToken
}

// ---------- data helpers ----------
async function rest(path: string): Promise<any[]> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
  if (!r.ok) return []
  return (await r.json().catch(() => [])) as any[]
}
// Same query, but with the caller's JWT → RLS decides what they may see.
async function restAs(auth: string, path: string): Promise<any[]> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: auth } })
  if (!r.ok) return []
  return (await r.json().catch(() => [])) as any[]
}
async function callerId(auth: string): Promise<string | null> {
  if (!auth) return null
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
  if (!r.ok) return null
  return (await r.json().catch(() => null))?.id ?? null
}
async function dropToken(token: string) {
  await fetch(`${URL_}/rest/v1/push_tokens?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, Prefer: 'return=minimal' },
  })
}

// ---------- copy ----------
type Lang = 'pl' | 'ru' | 'en'
const STATUS_LABEL: Record<string, Record<Lang, string>> = {
  new: { pl: 'Nowe', ru: 'Новый', en: 'New' },
  in_progress: { pl: 'W trakcie', ru: 'В работе', en: 'In progress' },
  unclear: { pl: 'Niejasne', ru: 'Непонятно', en: 'Unclear' },
  on_hold: { pl: 'Wstrzymane', ru: 'На паузе', en: 'On hold' },
  deferred: { pl: 'Odłożone', ru: 'Отложено', en: 'Deferred' },
  done: { pl: 'Gotowe', ru: 'Выполнено', en: 'Done' },
  rejected: { pl: 'Odrzucone', ru: 'Отклонён', en: 'Rejected' },
}
const PHOTO: Record<Lang, string> = { pl: 'Zdjęcie', ru: 'Фото', en: 'Photo' }
const FILE: Record<Lang, string> = { pl: 'Plik', ru: 'Файл', en: 'File' }
const CHAT: Record<Lang, string> = { pl: 'czat', ru: 'чат', en: 'chat' }
const SOMEONE: Record<Lang, string> = { pl: 'Ktoś', ru: 'Кто-то', en: 'Someone' }

function clip(s: string, n = 160) {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
function attachLabel(lang: Lang, atts: any[]): string {
  if (!Array.isArray(atts) || atts.length === 0) return ''
  const img = atts.every((a) => String(a?.content_type ?? '').startsWith('image/'))
  const base = img ? PHOTO[lang] : FILE[lang]
  return atts.length > 1 ? `${base} ×${atts.length}` : base
}

interface Ctx {
  event: string
  project: string
  actor: string
  ticket?: any
  status?: string
  comment?: any
  message?: any
}
function copy(c: Ctx, lang: Lang): { title: string; body: string } {
  const no = c.ticket ? `#${String(c.ticket.number ?? 0).padStart(3, '0')}` : ''
  const tt = clip(c.ticket?.title ?? '', 90)
  const actor = c.actor || SOMEONE[lang]
  const L = (m: Record<Lang, string>) => m[lang] ?? m.pl
  switch (c.event) {
    case 'ticket_created':
      return {
        title: `${c.project} · ${no}`,
        body: L({ pl: `Nowe zgłoszenie od ${actor}: ${tt}`, ru: `Новый тикет от ${actor}: ${tt}`, en: `New ticket from ${actor}: ${tt}` }),
      }
    case 'task_assigned':
      return {
        title: `${c.project} · ${no}`,
        body: L({ pl: `Zadanie dla Ciebie od ${actor}: ${tt}`, ru: `Задание для тебя от ${actor}: ${tt}`, en: `Task for you from ${actor}: ${tt}` }),
      }
    case 'assigned':
      return {
        title: `${c.project} · ${no}`,
        body: L({ pl: `${actor} przypisuje Ci: ${tt}`, ru: `${actor} назначает на тебя: ${tt}`, en: `${actor} assigned you: ${tt}` }),
      }
    case 'status_changed': {
      const sl = STATUS_LABEL[c.status ?? ''] ? L(STATUS_LABEL[c.status!]) : c.status ?? ''
      return { title: `${c.project} · ${no}`, body: `${tt} → ${sl} · ${actor}` }
    }
    case 'comment_added': {
      const text = clip(c.comment?.body ?? '') || attachLabel(lang, c.comment?.atts ?? []) || '…'
      return { title: `${c.project} · ${no} ${tt}`.trim(), body: `${actor}: ${text}` }
    }
    case 'chat_message': {
      const text = clip(c.message?.body ?? '') || attachLabel(lang, c.message?.attachments ?? []) || '…'
      return { title: `${c.project} · ${CHAT[lang]}`, body: `${actor}: ${text}` }
    }
    default:
      return { title: c.project || 'Ticket Flow', body: `${no} ${tt}`.trim() }
  }
}

// notification_settings column per event
const PREF: Record<string, string> = {
  ticket_created: 'tickets',
  task_assigned: 'assigned',
  assigned: 'assigned',
  status_changed: 'status',
  comment_added: 'comments',
  chat_message: 'chat',
}

// ---------- FCM ----------
interface Tok { user_id: string; token: string; platform: string; app_version: string | null }
async function send(t: Tok, title: string, body: string, data: Record<string, string>, group: string) {
  const at = await accessToken()
  // Apps ≥1.1 create their own channels; older builds only have FCM's default one,
  // and naming a channel the app never created silently drops the notification.
  const modern = !!t.app_version
  const channel = data.type === 'chat_message' ? 'tf_chat' : 'tf_activity'
  const android: any = { priority: 'HIGH', notification: { sound: 'default', tag: group } }
  if (modern) android.notification.channel_id = channel
  const aps: any = { sound: 'default', 'thread-id': group }
  if (!modern) aps.badge = 1
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: t.token,
        notification: { title, body },
        data,
        android,
        apns: { headers: { 'apns-priority': '10' }, payload: { aps } },
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    if (/UNREGISTERED|registration token is not a valid|Requested entity was not found/i.test(txt)) await dropToken(t.token)
    return false
  }
  return true
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin)

  const auth = req.headers.get('Authorization') ?? ''
  const actor = await callerId(auth)
  if (!actor) return json({ error: 'Unauthorized' }, 401, origin)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  const event = String(body.event ?? '')
  const ticketId = body.ticket_id ? String(body.ticket_id) : ''
  const messageId = body.message_id ? String(body.message_id) : ''
  if (!event || (!ticketId && !messageId)) return json({ error: 'event and ticket_id|message_id required' }, 400, origin)
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if ((ticketId && !UUID.test(ticketId)) || (messageId && !UUID.test(messageId))) return json({ error: 'bad id' }, 400, origin)
  if (body.comment_id && !UUID.test(String(body.comment_id))) return json({ error: 'bad id' }, 400, origin)
  if (!PREF[event]) return json({ error: 'bad event' }, 400, origin)
  // status label comes from the DB row, never from client text
  if (body.status && !STATUS_LABEL[String(body.status)]) body.status = undefined

  try {
    let ticket: any = null
    let message: any = null
    let projectId = ''
    if (event === 'chat_message') {
      // RLS check with the caller's JWT
      const rows = await restAs(auth, `project_messages?id=eq.${messageId}&select=id,project_id,author_id,body,attachments`)
      message = rows[0]
      if (!message) return json({ error: 'not_found' }, 404, origin)
      if (message.author_id !== actor) return json({ error: 'forbidden' }, 403, origin)
      projectId = message.project_id
    } else {
      const rows = await restAs(auth, `tickets?id=eq.${ticketId}&select=id,number,title,project_id,created_by,assigned_to,is_task,status`)
      ticket = rows[0]
      if (!ticket) return json({ error: 'not_found' }, 404, origin)
      projectId = ticket.project_id
    }

    const [proj] = await rest(`projects?id=eq.${projectId}&select=name,created_by`)
    const [actorProf] = await rest(`profiles?id=eq.${actor}&select=full_name,email`)
    const actorName = clip(actorProf?.full_name || (actorProf?.email ?? '').split('@')[0] || '', 40)

    // Recipients
    const ids = new Set<string>()
    if (event === 'assigned') {
      if (ticket?.assigned_to) ids.add(ticket.assigned_to)
    } else {
      const members = await rest(`project_members?project_id=eq.${projectId}&select=user_id`)
      if (proj?.created_by) ids.add(proj.created_by)
      for (const m of members) if (m.user_id) ids.add(m.user_id)
      if (ticket?.created_by) ids.add(ticket.created_by)
      if (ticket?.assigned_to) ids.add(ticket.assigned_to)
    }
    ids.delete(actor)
    if (ids.size === 0) return json({ ok: true, sent: 0 }, 200, origin)

    const inList = `(${[...ids].join(',')})`
    const [profs, prefs, tokens] = await Promise.all([
      rest(`profiles?id=in.${inList}&select=id,language`),
      rest(`notification_settings?user_id=in.${inList}`),
      rest(`push_tokens?user_id=in.${inList}&select=user_id,token,platform,app_version`),
    ])
    if (tokens.length === 0) return json({ ok: true, sent: 0 }, 200, origin)
    const langOf: Record<string, Lang> = {}
    for (const p of profs) langOf[p.id] = (['pl', 'ru', 'en'].includes(p.language) ? p.language : 'pl') as Lang
    const prefOf: Record<string, any> = {}
    for (const p of prefs) prefOf[p.user_id] = p

    // Optional comment preview
    let comment: any = null
    if (event === 'comment_added' && body.comment_id) {
      const [c] = await rest(`ticket_comments?id=eq.${body.comment_id}&ticket_id=eq.${ticketId}&select=body`)
      const atts = await rest(`attachments?comment_id=eq.${body.comment_id}&select=content_type`)
      comment = { body: c?.body ?? '', atts }
    }

    const sends: Promise<boolean>[] = []
    for (const t of tokens as Tok[]) {
      // An is_task ticket reads as "task for you" for everyone but staff.
      const ev = event === 'ticket_created' && ticket?.is_task ? 'task_assigned' : event
      const pref = prefOf[t.user_id]
      if (pref) {
        const col = PREF[ev]
        if (col && pref[col] === false) continue
        if (Array.isArray(pref.muted_projects) && pref.muted_projects.includes(projectId)) continue
      }
      const lang = langOf[t.user_id] ?? 'pl'
      const { title, body: text } = copy(
        { event: ev, project: clip(proj?.name ?? 'Ticket Flow', 40), actor: actorName, ticket, status: body.status ?? ticket?.status, comment, message },
        lang,
      )
      const data: Record<string, string> = {
        type: ev,
        project_id: projectId,
        ticket_id: ticket?.id ?? '',
        message_id: message?.id ?? '',
      }
      const group = ev === 'chat_message' ? `chat-${projectId}` : `ticket-${ticket?.id}`
      sends.push(send(t, title, text, data, group))
    }
    const res = await Promise.all(sends)
    return json({ ok: true, sent: res.filter(Boolean).length }, 200, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
