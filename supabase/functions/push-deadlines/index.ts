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
async function send(token: string, title: string, body: string, data: Record<string, string>) {
  const at = await accessToken()
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: { priority: 'HIGH', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(txt)) await dropToken(token)
  }
}

const L = (lang: string, m: Record<string, string>) => m[lang] ?? m.pl

// Everyone who can see the project: owner + members.
async function audience(projectId: string): Promise<string[]> {
  const p = await rest(`projects?id=eq.${projectId}&select=created_by`)
  const m = await rest(`project_members?project_id=eq.${projectId}&select=user_id`)
  const s = new Set<string>()
  if (p[0]?.created_by) s.add(p[0].created_by)
  for (const x of m) if (x.user_id) s.add(x.user_id)
  return [...s]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  if (!CRON_SECRET || req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  // "Tomorrow" in UTC — deadlines are plain dates.
  const d = new Date(Date.now() + 24 * 3600 * 1000)
  const tomorrow = d.toISOString().slice(0, 10)

  try {
    const goals = await rest(`project_deadlines?deadline=eq.${tomorrow}&done=is.false&select=id,title,project_id`)
    const tickets = await rest(
      `tickets?due_date=eq.${tomorrow}&status=not.in.(done,rejected)&select=id,number,title,project_id`,
    )

    let sent = 0
    const cache: Record<string, { ids: string[] }> = {}

    async function fanOut(projectId: string, make: (lang: string) => { title: string; body: string }, data: Record<string, string>) {
      if (!cache[projectId]) cache[projectId] = { ids: await audience(projectId) }
      const ids = cache[projectId].ids
      if (!ids.length) return
      const inList = `(${ids.join(',')})`
      const profs = await rest(`profiles?id=in.${inList}&select=id,language`)
      const langOf: Record<string, string> = {}
      for (const p of profs) langOf[p.id] = p.language ?? 'pl'
      const tokens = await rest(`push_tokens?user_id=in.${inList}&select=user_id,token`)
      for (const row of tokens) {
        const { title, body } = make(langOf[row.user_id] ?? 'pl')
        await send(row.token, title, body, data)
        sent++
      }
    }

    for (const g of goals) {
      await fanOut(
        g.project_id,
        (lang) => ({
          title: L(lang, { pl: 'Jutro termin celu', ru: 'Завтра дедлайн цели', en: 'Goal due tomorrow' }),
          body: String(g.title ?? ''),
        }),
        { project_id: g.project_id, event: 'deadline_soon' },
      )
    }

    for (const t of tickets) {
      await fanOut(
        t.project_id,
        (lang) => ({
          title: L(lang, { pl: 'Jutro termin zgłoszenia', ru: 'Завтра дедлайн тикета', en: 'Ticket due tomorrow' }),
          body: `#${String(t.number ?? 0).padStart(3, '0')} ${t.title ?? ''}`,
        }),
        { project_id: t.project_id, ticket_id: t.id, event: 'deadline_soon' },
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
