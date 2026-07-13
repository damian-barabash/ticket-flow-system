// Self-service account deletion (required by App Store guideline 5.1.1(v), and
// offered everywhere: web + iOS + Android + desktop).
//
// The caller deletes THEIR OWN account. Order matters:
//   1. cancel the Paddle subscription immediately (best-effort — never blocks)
//   2. delete storage objects of the projects they own (buckets don't cascade)
//   3. delete the projects they own — this cascades tickets / comments /
//      attachments / releases / deadlines / members
//   4. delete the auth user — profiles cascades from auth.users
//
// Steps 2–3 are NOT optional: projects.created_by is ON DELETE SET NULL (the
// projects would survive as orphans nobody can reach) and project_releases
// .created_by is NO ACTION (deleting the user outright fails with an FK error).
//
// Content the user contributed to OTHER people's projects (tickets, comments,
// attachments) stays with that project and is anonymised by the existing
// ON DELETE SET NULL foreign keys.
//
// Dependency-free (bare fetch → GoTrue + PostgREST + Storage + Paddle API).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const PADDLE_API_KEY = Deno.env.get('PADDLE_API_KEY') ?? ''

const svc = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  })
}

async function callerId(auth: string): Promise<string | null> {
  if (!auth) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return u?.id ?? null
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers ?? {}) } })
}

/** Every object under `prefix/` in `bucket`, as full paths. */
async function listObjects(bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({ prefix, limit: 100, offset }),
    })
    if (!r.ok) break
    const rows = await r.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const o of rows) if (o?.name) paths.push(`${prefix}${o.name}`)
    if (rows.length < 100) break
  }
  return paths
}

async function removeObjects(bucket: string, prefixes: string[]) {
  if (!prefixes.length) return
  // Chunked — a huge single delete body is asking for a timeout.
  for (let i = 0; i < prefixes.length; i += 100) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: svc,
      body: JSON.stringify({ prefixes: prefixes.slice(i, i + 100) }),
    }).catch(() => {
      /* orphaned files are not worth failing the deletion over */
    })
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin)

  const uid = await callerId(req.headers.get('Authorization') ?? '')
  if (!uid) return json({ error: 'Unauthorized' }, 401, origin)

  const pr = await rest(
    `profiles?id=eq.${encodeURIComponent(uid)}&select=id,email,role,paddle_subscription_id`,
  )
  const profile = pr.ok ? (await pr.json().catch(() => []))[0] : null
  if (!profile) return json({ error: 'Unauthorized' }, 401, origin)

  // The moderator IS the platform owner — deleting that account would strip the
  // platform of its only super-admin. Has to be done by hand, not by a button.
  if (profile.role === 'moderator') return json({ error: 'moderator_self_delete' }, 403, origin)

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* handled by the confirmation check below */
  }
  // Typing your own email is the guard against a mis-tap wiping an account.
  const confirm = String(body?.confirm_email ?? '').trim().toLowerCase()
  if (!confirm || confirm !== String(profile.email ?? '').trim().toLowerCase()) {
    return json({ error: 'confirm_mismatch' }, 400, origin)
  }

  try {
    // 1. Subscription — stop billing before the account disappears.
    if (profile.paddle_subscription_id && PADDLE_API_KEY) {
      await fetch(`https://api.paddle.com/subscriptions/${profile.paddle_subscription_id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ effective_from: 'immediately' }),
      }).catch(() => {
        /* best-effort: a Paddle hiccup must not strand the user with an undeletable account */
      })
    }

    // 2. Storage of owned projects (covers, release files, ticket media).
    const projRes = await rest(`projects?created_by=eq.${encodeURIComponent(uid)}&select=id`)
    const projects: string[] = projRes.ok
      ? (await projRes.json().catch(() => [])).map((p: any) => p.id)
      : []

    let tickets: string[] = []
    if (projects.length) {
      const tRes = await rest(`tickets?project_id=in.(${projects.join(',')})&select=id`)
      tickets = tRes.ok ? (await tRes.json().catch(() => [])).map((t: any) => t.id) : []
    }

    for (const pid of projects) {
      await removeObjects('project-covers', await listObjects('project-covers', `${pid}/`))
      await removeObjects('project-files', await listObjects('project-files', `${pid}/`))
    }
    for (const tid of tickets) {
      await removeObjects('ticket-media', await listObjects('ticket-media', `${tid}/`))
    }

    // 3. Owned projects (cascades tickets → comments/attachments/activity/reads,
    //    releases, deadlines, members, workspace links).
    if (projects.length) {
      const del = await rest(`projects?created_by=eq.${encodeURIComponent(uid)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
      if (!del.ok) {
        return json({ error: 'projects_delete_failed', detail: await del.text().catch(() => '') }, 500, origin)
      }
    }

    // 4. The auth user — profiles (and workspaces / push tokens / memberships) cascade.
    const du = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: svc,
    })
    if (!du.ok) {
      return json({ error: 'user_delete_failed', detail: await du.text().catch(() => '') }, 500, origin)
    }

    return json({ ok: true, deleted: { projects: projects.length, tickets: tickets.length } }, 200, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
