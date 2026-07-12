// Paddle Billing webhook → updates profiles subscription state.
// Deployed with verify_jwt = false (Paddle does not send a Supabase JWT).
// Signature is verified with PADDLE_WEBHOOK_SECRET (HMAC-SHA256).
// Dependency-free (uses fetch → PostgREST) to stay robust across deploy methods.

const WEBHOOK_SECRET = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Map Paddle subscription status → our profiles.subscription_status enum.
function mapStatus(s: string): string {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
    case 'canceled':
      return 'canceled'
    default:
      return 'expired'
  }
}

async function verify(raw: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false
  const parts: Record<string, string> = {}
  for (const kv of header.split(';')) {
    const i = kv.indexOf('=')
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim()
  }
  const ts = parts['ts']
  const h1 = parts['h1']
  if (!ts || !h1) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}:${raw}`))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== h1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ h1.charCodeAt(i)
  return diff === 0
}

async function patchProfiles(col: string, val: string, patch: Record<string, unknown>): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?${col}=eq.${encodeURIComponent(val)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return -1
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows.length : 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const raw = await req.text()
  const ok = await verify(raw, req.headers.get('Paddle-Signature'))
  if (!ok) return new Response('invalid signature', { status: 401 })

  let evt: Record<string, unknown>
  try {
    evt = JSON.parse(raw)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const type = String((evt as any)?.event_type ?? '')
  const data: any = (evt as any)?.data ?? {}

  if (type.startsWith('subscription.')) {
    const profileId = data?.custom_data?.profile_id ?? null
    const customerId = data?.customer_id ?? null
    const patch = {
      subscription_status: mapStatus(String(data?.status ?? '')),
      subscription_ends_at: data?.current_billing_period?.ends_at ?? null,
      paddle_subscription_id: data?.id ?? null,
      paddle_customer_id: customerId,
    }
    let n = -1
    if (profileId) n = await patchProfiles('id', profileId, patch)
    if (n <= 0 && customerId) n = await patchProfiles('paddle_customer_id', customerId, patch)
    if (n < 0) return new Response('db error', { status: 500 })
  }
  return new Response('ok', { status: 200 })
})
