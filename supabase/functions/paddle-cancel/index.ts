// Cancel a Paddle subscription.
//   cancel_self          — the signed-in admin cancels their own subscription
//                          (at end of the billing period → keeps access until then)
//   cancel_for_user      — a moderator cancels a target admin's subscription
//                          immediately (used right before deleting that account)
// Dependency-free (fetch → PostgREST + Paddle API). The Paddle secret key never
// reaches the browser — it lives only as the PADDLE_API_KEY Edge secret.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const PADDLE_API_KEY = Deno.env.get('PADDLE_API_KEY') ?? ''

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })
}

// Validate the caller's token via GoTrue (verifies signature/expiry) and return their id.
async function callerId(auth: string): Promise<string | null> {
  if (!auth) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: auth },
  })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return u?.id ?? null
}

async function getProfile(id: string): Promise<any | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,role,paddle_subscription_id,subscription_status`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  )
  if (!r.ok) return null
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function paddleCancel(subId: string, effective: 'immediately' | 'next_billing_period'): Promise<string | null> {
  const r = await fetch(`https://api.paddle.com/subscriptions/${subId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ effective_from: effective }),
  })
  if (r.ok) return null
  return await r.text().catch(() => 'paddle error')
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin)

  const uid = await callerId(req.headers.get('Authorization') ?? '')
  if (!uid) return json({ error: 'Unauthorized' }, 401, origin)

  const caller = await getProfile(uid)
  if (!caller) return json({ error: 'Unauthorized' }, 401, origin)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  const action = body.action

  try {
    if (action === 'cancel_self') {
      if (!caller.paddle_subscription_id) return json({ error: 'no_subscription' }, 400, origin)
      const err = await paddleCancel(caller.paddle_subscription_id, 'next_billing_period')
      if (err) return json({ error: 'paddle_failed', detail: err }, 502, origin)
      return json({ ok: true, effective: 'next_billing_period' }, 200, origin)
    }

    if (action === 'cancel_for_user') {
      // Only a moderator may cancel someone else's subscription (used on account delete).
      if (caller.role !== 'moderator') return json({ error: 'Forbidden' }, 403, origin)
      const target = await getProfile(String(body.user_id ?? ''))
      if (!target) return json({ error: 'not_found' }, 404, origin)
      if (!target.paddle_subscription_id) return json({ ok: true, skipped: 'no_subscription' }, 200, origin)
      const err = await paddleCancel(target.paddle_subscription_id, 'immediately')
      if (err) return json({ error: 'paddle_failed', detail: err }, 502, origin)
      return json({ ok: true, effective: 'immediately' }, 200, origin)
    }

    return json({ error: 'unknown action' }, 400, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
