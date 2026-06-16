// User management (create / delete / reset password) for the three-tier role model.
// Uses the service-role key (auto-injected) which must never reach the browser.
//
//   moderator  — may create/delete/reset ANY user with ANY role (user|admin|moderator)
//   admin      — may only create/delete/reset CLIENTS (role 'user') of projects they OWN
//   user/anon  — forbidden
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const ASSIGNABLE_BY_MODERATOR = ['user', 'admin', 'moderator']

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

  // verify caller and resolve their role
  const authHeader = req.headers.get('Authorization') ?? ''
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401, origin)

  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  const callerRole = prof?.role
  if (callerRole !== 'admin' && callerRole !== 'moderator') {
    return json({ error: 'Forbidden — staff only' }, 403, origin)
  }
  const isModerator = callerRole === 'moderator'

  // Projects owned by the caller (used to scope an admin's reach). Moderator = all.
  async function ownedProjectIds(): Promise<Set<string>> {
    const { data } = await admin.from('projects').select('id').eq('created_by', user.id)
    return new Set((data ?? []).map((p: any) => p.id))
  }

  // Can the caller act on `targetId`? Moderator: yes. Admin: only clients of own projects.
  async function adminCanManage(targetId: string): Promise<boolean> {
    if (isModerator) return true
    const { data: tp } = await admin.from('profiles').select('role').eq('id', targetId).single()
    if (tp?.role !== 'user') return false // admins never touch other admins/moderators
    const owned = await ownedProjectIds()
    if (owned.size === 0) return false
    const { data: mem } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', targetId)
      .in('project_id', [...owned])
    return (mem ?? []).length > 0
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad JSON' }, 400, origin)
  }
  const action = body.action

  try {
    if (action === 'create') {
      const { email, password, full_name } = body
      if (!email || !password) return json({ error: 'email и password обязательны' }, 400, origin)

      // Resolve the role to grant.
      let role = 'user'
      if (isModerator) {
        role = ASSIGNABLE_BY_MODERATOR.includes(body.role) ? body.role : 'user'
      } // admin → always 'user'

      // Scope the project assignment. Admins may only attach to projects they own.
      let projectIds: string[] = Array.isArray(body.project_ids) ? body.project_ids : []
      if (!isModerator && projectIds.length) {
        const owned = await ownedProjectIds()
        projectIds = projectIds.filter((id) => owned.has(id))
      }

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // trigger clamps signup metadata to admin|user; we set the final role below
        user_metadata: { full_name: full_name ?? null, role: role === 'moderator' ? 'admin' : role },
      })
      if (error) return json({ error: error.message }, 400, origin)

      const newId = created.user.id

      // Authoritatively set the final role (covers 'moderator', which the trigger refuses).
      const { error: roleErr } = await admin
        .from('profiles')
        .update({ role, full_name: full_name ?? null })
        .eq('id', newId)
      if (roleErr) return json({ error: roleErr.message }, 400, origin)

      if (projectIds.length) {
        const rows = projectIds.map((pid: string) => ({ project_id: pid, user_id: newId }))
        await admin.from('project_members').insert(rows)
      }
      return json({ ok: true, user_id: newId, role }, 200, origin)
    }

    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id обязателен' }, 400, origin)
      if (user_id === user.id) return json({ error: 'Нельзя удалить самого себя' }, 400, origin)
      if (!(await adminCanManage(user_id))) return json({ error: 'Forbidden' }, 403, origin)
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400, origin)
      return json({ ok: true }, 200, origin)
    }

    if (action === 'update_password') {
      const { user_id, password } = body
      if (!user_id || !password) return json({ error: 'user_id и password обязательны' }, 400, origin)
      if (!(await adminCanManage(user_id))) return json({ error: 'Forbidden' }, 403, origin)
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) return json({ error: error.message }, 400, origin)
      return json({ ok: true }, 200, origin)
    }

    return json({ error: 'Unknown action' }, 400, origin)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500, origin)
  }
})
