// Password reset with a 6-digit email code (2026-10-26). Public (verify_jwt=false).
// POST {action:'start', email, lang}            → always {ok:true} (no account enumeration)
// POST {action:'verify', email, code, password} → {ok:true} | {error:'wrong_code'|'expired'|'too_many'|'weak_password'|'no_code'}
// Dependency-free (fetch → PostgREST + GoTrue admin + Resend).
const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('MAIL_FROM') ?? 'Ticket Flow <system@ticketflow.pl>'
const H = { apikey: SR, Authorization: `Bearer ${SR}` }

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

const COPY: Record<string, { subject: string; intro: string; foot: string }> = {
  pl: {
    subject: 'Kod do zmiany hasła — Ticket Flow',
    intro: 'Ktoś (mamy nadzieję, że Ty) poprosił o zmianę hasła. Wpisz ten kod w aplikacji. Kod jest ważny 15 minut.',
    foot: 'Jeśli to nie Ty — zignoruj tę wiadomość, hasło się nie zmieni.',
  },
  ru: {
    subject: 'Код для смены пароля — Ticket Flow',
    intro: 'Кто-то (надеемся, вы) запросил смену пароля. Введите этот код в приложении. Код действует 15 минут.',
    foot: 'Если это были не вы — просто проигнорируйте письмо, пароль не изменится.',
  },
  en: {
    subject: 'Your Ticket Flow password reset code',
    intro: 'Someone (hopefully you) asked to reset the password. Enter this code in the app. It expires in 15 minutes.',
    foot: "If it wasn't you, ignore this email — your password stays the same.",
  },
}

function emailHtml(lang: string, code: string) {
  const c = COPY[lang] ?? COPY.pl
  return `<!doctype html><html><body style="margin:0;background:#060606;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060606;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#0e0e0e;border:1px solid #262626;">
<tr><td style="padding:26px 32px 0;">
<span style="display:inline-block;width:14px;height:22px;background:#f2231b;vertical-align:middle;"></span>
<span style="color:#f5f5f5;font-size:14px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;margin-left:10px;vertical-align:middle;">Ticket Flow</span></td></tr>
<tr><td style="padding:24px 32px 8px;"><h1 style="color:#f5f5f5;font-size:24px;line-height:1.05;margin:0;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;">${c.subject}</h1></td></tr>
<tr><td style="padding:0 32px;color:#a8a8a8;font-size:15px;line-height:1.6;">${c.intro}</td></tr>
<tr><td style="padding:20px 32px 8px;"><div style="background:#060606;border:1px solid #f2231b;text-align:center;padding:20px;color:#f2231b;font-size:36px;font-weight:800;letter-spacing:.4em;font-family:'SF Mono',Consolas,monospace;">${code}</div></td></tr>
<tr><td style="padding:8px 32px 0;color:#787878;font-size:13px;line-height:1.5;">${c.foot}</td></tr>
<tr><td style="padding:24px 32px 26px;color:#787878;font-size:12px;line-height:1.5;">Ticket Flow · dbdc studio · dbdcstudio@gmail.com</td></tr>
</table></td></tr></table></body></html>`
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
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
  const action = String(body.action ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400, origin)

  try {
    if (action === 'start') {
      // rate limit: max 5 codes per email per hour
      const since = new Date(Date.now() - 3600 * 1000).toISOString()
      const recent = await (await rest(`email_verifications?email=eq.${encodeURIComponent(email)}&purpose=eq.reset&created_at=gte.${since}&select=id`)).json().catch(() => [])
      if (Array.isArray(recent) && recent.length >= 5) return json({ ok: true }, 200, origin)

      const prof = await (await rest(`profiles?email=eq.${encodeURIComponent(email)}&select=id,language`)).json().catch(() => [])
      const p = prof?.[0]
      if (!p) return json({ ok: true }, 200, origin) // don't reveal whether the account exists
      const lang = ['pl', 'ru', 'en'].includes(body.lang) ? body.lang : ['pl', 'ru', 'en'].includes(p.language) ? p.language : 'pl'
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
      await rest('email_verifications', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ email, code, user_id: p.id, purpose: 'reset', expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }),
      })
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [email], subject: (COPY[lang] ?? COPY.pl).subject, html: emailHtml(lang, code) }),
      })
      if (!r.ok) return json({ error: 'mail_failed' }, 502, origin)
      return json({ ok: true }, 200, origin)
    }

    if (action === 'verify') {
      const code = String(body.code ?? '').trim()
      const password = String(body.password ?? '')
      if (!/^\d{6}$/.test(code)) return json({ error: 'wrong_code' }, 400, origin)
      if (password.length < 8) return json({ error: 'weak_password' }, 400, origin)
      const rows = await (await rest(`email_verifications?email=eq.${encodeURIComponent(email)}&purpose=eq.reset&order=created_at.desc&limit=1`)).json().catch(() => [])
      const row = rows?.[0]
      if (!row) return json({ error: 'no_code' }, 400, origin)
      if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'expired' }, 400, origin)
      if ((row.attempts ?? 0) >= 5) return json({ error: 'too_many' }, 429, origin)
      if (row.code !== code) {
        await rest(`email_verifications?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ attempts: (row.attempts ?? 0) + 1 }),
        })
        return json({ error: 'wrong_code' }, 400, origin)
      }
      // A valid reset code also proves the mailbox → confirm the email too.
      const upd = await fetch(`${URL_}/auth/v1/admin/users/${row.user_id}`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, email_confirm: true }),
      })
      if (!upd.ok) {
        const t = await upd.text().catch(() => '')
        if (/password/i.test(t)) return json({ error: 'weak_password' }, 400, origin)
        return json({ error: 'update_failed' }, 500, origin)
      }
      await rest(`email_verifications?email=eq.${encodeURIComponent(email)}&purpose=eq.reset`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      return json({ ok: true }, 200, origin)
    }
    return json({ error: 'bad action' }, 400, origin)
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500, origin)
  }
})
