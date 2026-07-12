// Push notifications (FCM HTTP v1). Called by the web panel and the mobile app
// on project events. Recipients are resolved SERVER-SIDE (project owner + members,
// minus the actor) — the client can't target arbitrary users.
// Dependency-free: service-account JWT (RS256) → OAuth token → FCM send.
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const FCM_PROJECT = Deno.env.get('FCM_PROJECT_ID') ?? ''
const SA_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''

function cors(o: string | null) {
  return {
    'Access-Control-Allow-Origin': o ?? '*',
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
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  }
  const te = new TextEncoder()
  const unsigned = `${b64url(te.encode(JSON.stringify(header)))}.${b64url(te.encode(JSON.stringify(claims)))}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
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

// ---------- data helpers (service role) ----------
async function rest(path: string): Promise<any[]> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
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
const STATUS_LABEL: Record<string, Record<string, string>> = {
  done: { pl: 'Gotowe', ru: 'Выполнено', en: 'Done' },
  in_progress: { pl: 'W trakcie', ru: 'В работе', en: 'In progress' },
  new: { pl: 'Nowe', ru: 'Новый', en: 'New' },
  rejected: { pl: 'Odrzucone', ru: 'Отклонён', en: 'Rejected' },
  on_hold: { pl: 'Wstrzymane', ru: 'На паузе', en: 'On hold' },
  unclear: { pl: 'Niejasne', ru: 'Непонятно', en: 'Unclear' },
  deferred: { pl: 'Odłożone', ru: 'Отложено', en: 'Deferred' },
}
function copy(event: string, lang: string, t: any, extra: any): { title: string; body: string } {
  const L = (m: Record<string, string>) => m[lang] ?? m.pl
  const no = `#${String(t?.number ?? 0).padStart(3, '0')}`
  const name = t?.title ?? ''
  switch (event) {
    case 'ticket_created':
      return { title: L({ pl: 'Nowe zgłoszenie', ru: 'Новый тикет', en: 'New ticket' }), body: `${no} ${name}` }
    case 'task_assigned':
      return { title: L({ pl: 'Zadanie dla Ciebie', ru: 'Задание для тебя', en: 'Task for you' }), body: `${no} ${name}` }
    case 'comment_added':
      return { title: L({ pl: 'Nowy komentarz', ru: 'Новый комментарий', en: 'New comment' }), body: `${no} ${name}` }
    case 'status_changed': {
      const s = extra?.status ?? ''
      const sl = STATUS_LABEL[s] ? L(STATUS_LABEL[s]) : s
      return { title: L({ pl: 'Zmiana statusu', ru: 'Статус изменён', en: 'Status changed' }), body: `${no} ${name} → ${sl}` }
    }
    default:
      return { title: 'Ticket Flow', body: `${no} ${name}`.trim() }
  }
}

// ---------- FCM ----------
async function send(token: string, title: string, body: string, data: Record<string, string>): Promise<void> {
  const at = await accessToken()
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        // No channel_id — FCM falls back to its default channel, which always
        // exists. Naming a channel that the app never created silently drops the
        // notification on Android 8+.
        android: { priority: 'HIGH', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    // Stale device token → clean it up so we stop trying.
    if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(txt)) await dropToken(token)
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin)

  const actor = await callerId(req.headers.get('Authorization') ?? '')
  if (!actor) return json({ error: 'Unauthorized' }, 401, origin)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  const event = String(body.event ?? '')
  const ticketId = body.ticket_id ? String(body.ticket_id) : ''
  if (!event || !ticketId) return json({ error: 'event and ticket_id required' }, 400, origin)

  try {
    const tRows = await rest(`tickets?id=eq.${ticketId}&select=id,number,title,project_id,created_by,is_task`)
    const ticket = tRows[0]
    if (!ticket) return json({ error: 'ticket_not_found' }, 404, origin)

    // Recipients: project owner + members + ticket author, minus the actor.
    const pRows = await rest(`projects?id=eq.${ticket.project_id}&select=created_by`)
    const mRows = await rest(`project_members?project_id=eq.${ticket.project_id}&select=user_id`)
    const ids = new Set<string>()
    if (pRows[0]?.created_by) ids.add(pRows[0].created_by)
    for (const m of mRows) if (m.user_id) ids.add(m.user_id)
    if (ticket.created_by) ids.add(ticket.created_by)
    ids.delete(actor)
    if (ids.size === 0) return json({ ok: true, sent: 0 }, 200, origin)

    const list = [...ids]
    const inList = `(${list.join(',')})`
    const profs = await rest(`profiles?id=in.${inList}&select=id,language`)
    const langOf: Record<string, string> = {}
    for (const p of profs) langOf[p.id] = p.language ?? 'pl'

    const tokens = await rest(`push_tokens?user_id=in.${inList}&select=user_id,token`)
    if (tokens.length === 0) return json({ ok: true, sent: 0 }, 200, origin)

    const data = { ticket_id: ticket.id, project_id: ticket.project_id, event }
    let sent = 0
    for (const row of tokens) {
      const lang = langOf[row.user_id] ?? 'pl'
      // A ticket flagged as a task reads as "task for you" for the client side.
      const ev = event === 'ticket_created' && ticket.is_task ? 'task_assigned' : event
      const { title, body: text } = copy(ev, lang, ticket, body)
      await send(row.token, title, text, data)
      sent++
    }
    return json({ ok: true, sent }, 200, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
