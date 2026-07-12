// Self-registration step 2: check the 6-digit code and confirm the email.
// The frontend then signs the user in with their password.
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const code = String(body.code ?? '').trim()
  if (!email || !/^\d{6}$/.test(code)) return json({ error: 'invalid' }, 400, origin)

  try {
    const r = await fetch(
      `${URL_}/rest/v1/email_verifications?email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
      { headers: { apikey: SR, Authorization: `Bearer ${SR}` } },
    )
    const rows = await r.json().catch(() => [])
    const row = rows?.[0]
    if (!row) return json({ error: 'no_code' }, 400, origin)
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'expired' }, 400, origin)
    if ((row.attempts ?? 0) >= 6) return json({ error: 'too_many' }, 429, origin)

    if (row.code !== code) {
      await fetch(`${URL_}/rest/v1/email_verifications?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ attempts: (row.attempts ?? 0) + 1 }),
      })
      return json({ error: 'wrong_code' }, 400, origin)
    }

    // Confirm the email.
    if (row.user_id) {
      const upd = await fetch(`${URL_}/auth/v1/admin/users/${row.user_id}`, {
        method: 'PUT',
        headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_confirm: true }),
      })
      if (!upd.ok) return json({ error: 'confirm_failed' }, 500, origin)
    }

    // Clean up codes for this email.
    await fetch(`${URL_}/rest/v1/email_verifications?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { apikey: SR, Authorization: `Bearer ${SR}`, Prefer: 'return=minimal' },
    })

    return json({ ok: true }, 200, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
