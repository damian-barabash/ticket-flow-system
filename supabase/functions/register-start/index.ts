// Self-registration step 1: create an UNCONFIRMED admin account and email a
// 6-digit verification code (branded, from system@ticketflow.pl via Resend).
// Dependency-free (fetch → GoTrue admin API + PostgREST + Resend).
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('MAIL_FROM') ?? 'Ticket Flow <system@ticketflow.pl>'

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

// Minimal, mail-client-safe branded template (dark, red accent).
function emailShell(heading: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#0a0a0b;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#101013;border:1px solid #26262b;">
<tr><td style="padding:26px 32px 0;">
<span style="display:inline-block;width:15px;height:21px;background:#ff2e2e;border-radius:3px;vertical-align:middle;"></span>
<span style="color:#ededed;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin-left:9px;vertical-align:middle;">Ticket Flow</span></td></tr>
<tr><td style="padding:22px 32px 6px;"><h1 style="color:#ededed;font-size:20px;margin:0;font-weight:600;">${heading}</h1></td></tr>
${inner}
<tr><td style="padding:22px 32px 26px;border-top:1px solid #26262b;color:#6a6a72;font-size:12px;line-height:1.5;">Ticket Flow · część ekosystemu dbdc studio<br/>Kontakt: dbdcstudio@gmail.com</td></tr>
</table></td></tr></table></body></html>`
}

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })
  return r.ok
}

async function findUserId(email: string): Promise<string | null> {
  const r = await fetch(`${URL_}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`, {
    headers: { apikey: SR, Authorization: `Bearer ${SR}` },
  })
  if (!r.ok) return null
  const rows = await r.json().catch(() => [])
  return rows?.[0]?.id ?? null
}

async function isConfirmed(id: string): Promise<boolean> {
  const r = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
  if (!r.ok) return false
  const u = await r.json().catch(() => null)
  return Boolean(u?.email_confirmed_at)
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
  const password = String(body.password ?? '')
  const fullName = body.full_name ? String(body.full_name).trim() : null
  const language = ['ru', 'pl', 'en'].includes(body.language) ? body.language : 'pl'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400, origin)
  if (password.length < 6) return json({ error: 'weak_password' }, 400, origin)

  try {
    // Create unconfirmed user; if the email already exists, branch on confirmed state.
    const createRes = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name: fullName, role: 'admin' },
      }),
    })

    let userId: string | null = null
    if (createRes.ok) {
      const created = await createRes.json()
      userId = created?.id ?? created?.user?.id ?? null
    } else {
      // Likely already registered.
      const existingId = await findUserId(email)
      if (existingId && (await isConfirmed(existingId))) {
        return json({ error: 'email_exists' }, 409, origin)
      }
      if (!existingId) {
        const txt = await createRes.text().catch(() => '')
        return json({ error: 'create_failed', detail: txt.slice(0, 200) }, 400, origin)
      }
      // Unconfirmed leftover — refresh password and resend the code.
      await fetch(`${URL_}/auth/v1/admin/users/${existingId}`, {
        method: 'PUT',
        headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      userId = existingId
    }

    // Store the language on the profile.
    if (userId) {
      await fetch(`${URL_}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ language, full_name: fullName }),
      })
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await fetch(`${URL_}/rest/v1/email_verifications`, {
      method: 'POST',
      headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ email, code, user_id: userId, expires_at: expires }),
    })

    const subjects: Record<string, string> = {
      pl: 'Twój kod weryfikacyjny Ticket Flow',
      ru: 'Ваш код подтверждения Ticket Flow',
      en: 'Your Ticket Flow verification code',
    }
    const intro: Record<string, string> = {
      pl: 'Użyj tego kodu, aby dokończyć rejestrację. Kod jest ważny 15 minut.',
      ru: 'Введите этот код, чтобы завершить регистрацию. Код действует 15 минут.',
      en: 'Use this code to finish signing up. It expires in 15 minutes.',
    }
    const html = emailShell(
      subjects[language],
      `<tr><td style="padding:0 32px;color:#b8b8c0;font-size:14px;line-height:1.6;">${intro[language]}</td></tr>
       <tr><td style="padding:18px 32px 6px;"><div style="background:#0a0a0b;border:1px solid #26262b;text-align:center;padding:18px;color:#ff2e2e;font-size:34px;font-weight:700;letter-spacing:.4em;font-family:'SF Mono',Consolas,monospace;">${code}</div></td></tr>`,
    )
    const sent = await sendMail(email, subjects[language], html)
    if (!sent) return json({ error: 'mail_failed' }, 502, origin)

    return json({ ok: true }, 200, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
