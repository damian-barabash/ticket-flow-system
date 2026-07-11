// Paddle Billing webhook → updates profiles subscription state.
// Deployed with verify_jwt = false (Paddle does not send a Supabase JWT).
// Signature is verified with PADDLE_WEBHOOK_SECRET (HMAC-SHA256).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WEBHOOK_SECRET = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

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
  // Header: "ts=<unix>;h1=<hex hmac>"
  const parts = Object.fromEntries(header.split(';').map((kv) => kv.split('=')))
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
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  // constant-time-ish compare
  if (hex.length !== h1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ h1.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const raw = await req.text()
  const ok = await verify(raw, req.headers.get('Paddle-Signature'))
  if (!ok) return new Response('invalid signature', { status: 401 })

  let evt: any
  try {
    evt = JSON.parse(raw)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const type: string = evt?.event_type ?? ''
  const data = evt?.data ?? {}

  try {
    if (type.startsWith('subscription.')) {
      const profileId = data?.custom_data?.profile_id ?? null
      const customerId = data?.customer_id ?? null
      const subId = data?.id ?? null
      const status = mapStatus(data?.status ?? '')
      const endsAt = data?.current_billing_period?.ends_at ?? null

      const patch: Record<string, unknown> = {
        subscription_status: status,
        subscription_ends_at: endsAt,
        paddle_subscription_id: subId,
        paddle_customer_id: customerId,
      }

      // Prefer matching by our profile id (passed in checkout custom_data);
      // fall back to the Paddle customer id for later lifecycle events.
      if (profileId) {
        await admin.from('profiles').update(patch).eq('id', profileId)
      } else if (customerId) {
        await admin.from('profiles').update(patch).eq('paddle_customer_id', customerId)
      }
    }
    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 })
  }
})
