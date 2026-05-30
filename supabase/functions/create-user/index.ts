// Admin-only user management (create / delete / reset password).
// Uses the service-role key (auto-injected) which must never reach the browser.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

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

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // verify caller is an admin
  const authHeader = req.headers.get('Authorization') ?? ''
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401, origin)

  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return json({ error: 'Forbidden — admin only' }, 403, origin)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad JSON' }, 400, origin)
  }
  const action = body.action

  try {
    if (action === 'create') {
      const { email, password, full_name, project_ids } = body
      if (!email || !password) return json({ error: 'email и password обязательны' }, 400, origin)

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? null, role: 'user' },
      })
      if (error) return json({ error: error.message }, 400, origin)

      const newId = created.user.id
      if (Array.isArray(project_ids) && project_ids.length) {
        const rows = project_ids.map((pid: string) => ({ project_id: pid, user_id: newId }))
        await admin.from('project_members').insert(rows)
      }
      return json({ ok: true, user_id: newId }, 200, origin)
    }

    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id обязателен' }, 400, origin)
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400, origin)
      return json({ ok: true }, 200, origin)
    }

    if (action === 'update_password') {
      const { user_id, password } = body
      if (!user_id || !password) return json({ error: 'user_id и password обязательны' }, 400, origin)
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) return json({ error: error.message }, 400, origin)
      return json({ ok: true }, 200, origin)
    }

    return json({ error: 'Unknown action' }, 400, origin)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500, origin)
  }
})
