// Email notifications via Resend. Best-effort: no-ops gracefully if RESEND_API_KEY unset.
// Called from the client after a ticket/comment/status mutation; recipients resolved server-side.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM = Deno.env.get('NOTIFY_FROM') ?? 'Ticket Flow <office@barabashflow.pl>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://tickets.barabashflow.pl'

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), 'Content-Type': 'application/json' } })

const STATUS_RU: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', done: 'Выполнен', rejected: 'Отклонён', on_hold: 'На паузе',
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_API_KEY || to.length === 0) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
}

function layout(title: string, lines: string[], ticketLabel: string) {
  return `<div style="font-family:Inter,Arial,sans-serif;background:#0A0A0B;color:#EDEDED;padding:32px">
    <div style="max-width:520px;margin:0 auto;border:1px solid #262629;background:#141416;padding:28px">
      <div style="font:600 13px/1 monospace;letter-spacing:.18em;text-transform:uppercase;color:#FF2E2E">Ticket Flow</div>
      <h1 style="font-size:18px;margin:18px 0 8px">${title}</h1>
      ${lines.map((l) => `<p style="color:#8A8A92;font-size:14px;margin:6px 0">${l}</p>`).join('')}
      <a href="${APP_URL}" style="display:inline-block;margin-top:18px;background:#EDEDED;color:#0A0A0B;font:600 11px/1 monospace;letter-spacing:.18em;text-transform:uppercase;padding:12px 20px;text-decoration:none">Открыть · ${ticketLabel}</a>
    </div></div>`
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const authHeader = req.headers.get('Authorization') ?? ''
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401, origin)

  if (!RESEND_API_KEY) return json({ skipped: 'RESEND_API_KEY not set' }, 200, origin)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Bad JSON' }, 400, origin) }
  const { event, ticket_id, status } = body
  if (!ticket_id) return json({ error: 'ticket_id required' }, 400, origin)

  // load ticket + project + people
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, number, title, project_id, created_by')
    .eq('id', ticket_id)
    .single()
  if (!ticket) return json({ error: 'ticket not found' }, 404, origin)

  const { data: project } = await admin.from('projects').select('name').eq('id', ticket.project_id).single()
  const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin')
  const { data: creator } = await admin.from('profiles').select('email, full_name').eq('id', ticket.created_by).single()

  const adminEmails = (admins ?? []).map((a) => a.email).filter(Boolean)
  const creatorEmail = creator?.email
  const label = `№ ${String(ticket.number).padStart(3, '0')}`
  const proj = project?.name ?? 'проект'

  try {
    if (event === 'ticket_created') {
      await sendEmail(
        adminEmails,
        `Новый тикет ${label} · ${proj}`,
        layout(`Новый тикет: ${ticket.title}`, [`Проект: <b>${proj}</b>`, `Автор: ${creator?.full_name || creatorEmail || '—'}`], label),
      )
    } else if (event === 'status_changed') {
      if (creatorEmail) {
        await sendEmail(
          [creatorEmail],
          `Статус тикета ${label}: ${STATUS_RU[status] ?? status}`,
          layout(`Тикет ${label} — ${STATUS_RU[status] ?? status}`, [`«${ticket.title}»`, `Проект: <b>${proj}</b>`], label),
        )
      }
    } else if (event === 'comment_added') {
      // notify the other side: if an admin commented -> client; if client commented -> admins
      const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
      const recipients = me?.role === 'admin' ? (creatorEmail ? [creatorEmail] : []) : adminEmails
      await sendEmail(
        recipients,
        `Новый комментарий · тикет ${label}`,
        layout(`Комментарий в тикете ${label}`, [`«${ticket.title}»`, `Проект: <b>${proj}</b>`], label),
      )
    }
    return json({ ok: true }, 200, origin)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 200, origin)
  }
})
