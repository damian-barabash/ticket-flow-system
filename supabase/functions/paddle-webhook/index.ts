// Paddle Billing webhook → updates profiles subscription state AND sends branded
// system emails (payment received / receipt, payment failed) from system@ticketflow.pl.
// Deployed with verify_jwt = false. Signature verified with PADDLE_WEBHOOK_SECRET.
// Dependency-free (fetch → PostgREST + Resend).
const WEBHOOK_SECRET = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('MAIL_FROM') ?? 'Ticket Flow <system@ticketflow.pl>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://ticketflow.pl'

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
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}:${raw}`))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== h1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ h1.charCodeAt(i)
  return diff === 0
}

async function patchProfiles(col: string, val: string, patch: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${col}=eq.${encodeURIComponent(val)}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return -1
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows.length : 0
}

async function getRecipient(profileId: string | null, customerId: string | null): Promise<{ email: string; lang: string } | null> {
  const q = profileId
    ? `id=eq.${encodeURIComponent(profileId)}`
    : customerId
    ? `paddle_customer_id=eq.${encodeURIComponent(customerId)}`
    : null
  if (!q) return null
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${q}&select=email,language&limit=1`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  })
  if (!r.ok) return null
  const rows = await r.json().catch(() => [])
  const row = rows?.[0]
  return row?.email ? { email: row.email, lang: row.language ?? 'pl' } : null
}

function shell(heading: string, inner: string) {
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

async function sendMail(to: string, subject: string, html: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    })
  } catch {
    /* best-effort */
  }
}

function tr(lang: string, m: Record<string, string>): string {
  return m[lang] ?? m['pl']
}

async function emailPaid(to: string, lang: string, amount: string, invoiceNo: string) {
  const subject = tr(lang, { pl: 'Płatność otrzymana — Ticket Flow', ru: 'Оплата получена — Ticket Flow', en: 'Payment received — Ticket Flow' })
  const intro = tr(lang, {
    pl: 'Dziękujemy! Otrzymaliśmy Twoją płatność, a subskrypcja jest aktywna.',
    ru: 'Спасибо! Мы получили вашу оплату, подписка активна.',
    en: 'Thank you! We received your payment and your subscription is active.',
  })
  const amtLabel = tr(lang, { pl: 'Kwota', ru: 'Сумма', en: 'Amount' })
  const invLabel = tr(lang, { pl: 'Nr rachunku', ru: 'Счёт №', en: 'Invoice no.' })
  const cta = tr(lang, { pl: 'Otwórz panel', ru: 'Открыть панель', en: 'Open panel' })
  const inner = `<tr><td style="padding:0 32px;color:#b8b8c0;font-size:14px;line-height:1.6;">${intro}</td></tr>
<tr><td style="padding:16px 32px 0;">
<table role="presentation" width="100%" style="border:1px solid #26262b;"><tr><td style="padding:12px 16px;color:#9a9aa2;font-size:13px;">${amtLabel}</td><td style="padding:12px 16px;color:#ededed;font-size:13px;text-align:right;font-weight:600;">${amount}</td></tr>
${invoiceNo ? `<tr><td style="padding:12px 16px;border-top:1px solid #26262b;color:#9a9aa2;font-size:13px;">${invLabel}</td><td style="padding:12px 16px;border-top:1px solid #26262b;color:#ededed;font-size:13px;text-align:right;">${invoiceNo}</td></tr>` : ''}</table></td></tr>
<tr><td style="padding:20px 32px 4px;"><a href="${APP_URL}" style="display:inline-block;background:#ff2e2e;color:#fff;text-decoration:none;padding:11px 20px;font-size:14px;font-weight:600;">${cta}</a></td></tr>`
  await sendMail(to, subject, shell(subject, inner))
}

async function emailFailed(to: string, lang: string) {
  const subject = tr(lang, { pl: 'Problem z płatnością — Ticket Flow', ru: 'Проблема с оплатой — Ticket Flow', en: 'Payment issue — Ticket Flow' })
  const body = tr(lang, {
    pl: 'Nie udało nam się pobrać opłaty za subskrypcję. Aby zachować dostęp, zaktualizuj metodę płatności i opłać subskrypcję.',
    ru: 'Нам не удалось списать оплату за подписку. Чтобы сохранить доступ, обновите способ оплаты и оплатите подписку.',
    en: 'We could not charge your subscription. To keep access, update your payment method and pay the subscription.',
  })
  const cta = tr(lang, { pl: 'Opłać subskrypcję', ru: 'Оплатить подписку', en: 'Pay subscription' })
  const inner = `<tr><td style="padding:0 32px;color:#b8b8c0;font-size:14px;line-height:1.6;">${body}</td></tr>
<tr><td style="padding:20px 32px 4px;"><a href="${APP_URL}" style="display:inline-block;background:#ff2e2e;color:#fff;text-decoration:none;padding:11px 20px;font-size:14px;font-weight:600;">${cta}</a></td></tr>`
  await sendMail(to, subject, shell(subject, inner))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const raw = await req.text()
  if (!(await verify(raw, req.headers.get('Paddle-Signature')))) return new Response('invalid signature', { status: 401 })

  let evt: any
  try {
    evt = JSON.parse(raw)
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const type: string = evt?.event_type ?? ''
  const data: any = evt?.data ?? {}

  try {
    if (type.startsWith('subscription.')) {
      const profileId = data?.custom_data?.profile_id ?? null
      const customerId = data?.customer_id ?? null
      const status = mapStatus(String(data?.status ?? ''))
      const patch = {
        subscription_status: status,
        subscription_ends_at: data?.current_billing_period?.ends_at ?? null,
        paddle_subscription_id: data?.id ?? null,
        paddle_customer_id: customerId,
      }
      let n = -1
      if (profileId) n = await patchProfiles('id', profileId, patch)
      if (n <= 0 && customerId) n = await patchProfiles('paddle_customer_id', customerId, patch)
      if (n < 0) return new Response('db error', { status: 500 })

      // Payment-failed system email.
      if (type === 'subscription.past_due') {
        const rcpt = await getRecipient(profileId, customerId)
        if (rcpt) await emailFailed(rcpt.email, rcpt.lang)
      }
    } else if (type === 'transaction.completed') {
      // Receipt / invoice system email.
      const profileId = data?.custom_data?.profile_id ?? null
      const customerId = data?.customer_id ?? null
      const rcpt = await getRecipient(profileId, customerId)
      if (rcpt) {
        const totals = data?.details?.totals ?? {}
        const cur = totals?.currency_code ?? data?.currency_code ?? ''
        const grand = totals?.grand_total ?? totals?.total ?? '0'
        const amount = `${(Number(grand) / 100).toFixed(2)} ${cur}`.trim()
        await emailPaid(rcpt.email, rcpt.lang, amount, data?.invoice_number ?? '')
      }
    }
    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 })
  }
})
