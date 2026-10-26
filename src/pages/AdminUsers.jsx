import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { Spinner, EmptyState, ErrorState, Avatar, Modal, Icon, Skeleton, FormError, useConfirm, useToast } from '../components/ui'
import { PageHeader } from './Projects'
import { errText } from '../lib/errors'

// Edge Function errors carry the real reason in error.context (non-2xx body).
async function fnError(err, data) {
  if (data?.error) return data.error
  try {
    return (await err?.context?.json?.())?.error || err?.message
  } catch {
    return err?.message
  }
}

export default function AdminUsers() {
  const { t } = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const { user, isModerator } = useAuth()
  const [users, setUsers] = useState(null)
  const [projects, setProjects] = useState([])
  const [membership, setMembership] = useState({})
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const req = useRef(0)

  const load = useCallback(async () => {
    const my = ++req.current
    // RLS scopes results: a moderator sees everyone, an admin sees only their own clients.
    const [p, pr, m] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, created_at').order('created_at'),
      supabase.from('projects').select('id, name').eq('archived', false).order('created_at'),
      supabase.from('project_members').select('user_id, project_id'),
    ])
    if (my !== req.current) return
    const err = p.error || pr.error || m.error
    if (err) return setError(err)
    setError(null)
    setUsers(p.data ?? [])
    setProjects(pr.data ?? [])
    const mm = {}
    ;(m.data ?? []).forEach((x) => (mm[x.user_id] = (mm[x.user_id] || 0) + 1))
    setMembership(mm)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function removeUser(u) {
    if (busyId) return
    const ok = await confirm({ title: t('panel.deleteUser'), body: t('users.confirmDelete', { email: u.email }), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    setBusyId(u.id)
    try {
      // Auto-cancel the user's Paddle subscription before deleting the account.
      if (isModerator) {
        try {
          await supabase.functions.invoke('paddle-cancel', { body: { action: 'cancel_for_user', user_id: u.id } })
        } catch {
          /* best-effort — proceed with deletion regardless */
        }
      }
      const { data, error: err } = await supabase.functions.invoke('create-user', { body: { action: 'delete', user_id: u.id } })
      if (err || data?.error) {
        console.warn('[users] delete failed', await fnError(err, data))
        toast.show(t('panel.errDeleteUser'), { tone: 'error' })
      } else {
        setUsers((xs) => xs.filter((x) => x.id !== u.id))
        toast.show(t('panel.userDeleted', { email: u.email }))
      }
    } finally {
      setBusyId(null)
    }
  }

  // A row gets a remove button if the current staff member is allowed to delete it.
  const canRemove = (u) => u.id !== user?.id && (isModerator ? true : u.role === 'user')

  const list = users ?? []
  const moderators = list.filter((u) => u.role === 'moderator')
  const admins = list.filter((u) => u.role === 'admin')
  const clients = list.filter((u) => u.role === 'user')
  const group = (title, xs) => (
    <UserGroup title={title} users={xs} membership={membership} canRemove={canRemove} onRemove={removeUser} busyId={busyId} />
  )

  return (
    <div className="min-h-screen bg-bg">
      <TopBar crumbs={[{ label: t('topbar.users') }]} />
      <main className="mx-auto max-w-[1000px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <PageHeader tag={t('users.label')} title={t('users.heading')} sub={isModerator ? t('users.subModerator') : t('users.sub')}>
          <button onClick={() => setShowCreate(true)} className="btn-accent">
            <Icon name="userPlus" size={17} /> {t('panel.newUser')}
          </button>
        </PageHeader>

        {error && !users ? (
          <ErrorState message={errText(t, error, 'common.loadError')} onRetry={load} />
        ) : !users ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {isModerator && group(t('users.moderators'), moderators)}
            {isModerator && group(t('users.admins'), admins)}
            {clients.length === 0 ? (
              <EmptyState icon="users" title={t('users.emptyTitle')} hint={t('users.emptyHint')}>
                <button onClick={() => setShowCreate(true)} className="btn-accent">
                  <Icon name="userPlus" size={16} /> {t('panel.newUser')}
                </button>
              </EmptyState>
            ) : (
              group(t('users.clients'), clients)
            )}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateUserModal
          open
          projects={projects}
          canPickRole={isModerator}
          onClose={() => setShowCreate(false)}
          onCreated={(email) => {
            toast.show(t('panel.userCreated', { email }))
            load()
          }}
        />
      )}
    </div>
  )
}

function RoleBadge({ role }) {
  const { t } = useT()
  const color = role === 'moderator' ? 'text-legend border-legend/40' : role === 'admin' ? 'text-accent border-accent/40' : 'text-muted border-line'
  return <span className={`shrink-0 border px-2 py-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] ${color}`}>{t('enum.role.' + role)}</span>
}

function UserGroup({ title, users, membership, canRemove, onRemove, busyId }) {
  const { t } = useT()
  if (!users.length) return null
  return (
    <section>
      <h2 className="label mb-3 flex items-center gap-2">
        {title} <span className="num text-faint">{users.length}</span>
      </h2>
      <ul className="divide-y divide-line border border-line bg-surface">
        {users.map((u, i) => (
          <li key={u.id} className="card-in flex items-center gap-3 px-4 py-3.5" style={{ '--i': i }}>
            <Avatar name={u.full_name} email={u.email} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-ink">{u.full_name || u.email}</div>
              {u.full_name && <div className="truncate text-[13px] text-muted">{u.email}</div>}
            </div>
            {u.role === 'user' && (
              <span className="hidden shrink-0 items-center gap-1.5 text-[13px] text-muted sm:flex">
                <Icon name="folder" size={14} /> {t('users.projectsCount', { n: membership[u.id] || 0 })}
              </span>
            )}
            <RoleBadge role={u.role} />
            {canRemove?.(u) && onRemove && (
              <button
                onClick={() => onRemove(u)}
                disabled={!!busyId}
                className="icon-btn-sm shrink-0 hover:!text-accent"
                title={t('users.remove')}
                aria-label={t('users.remove')}
              >
                {busyId === u.id ? <Spinner size={13} /> : <Icon name="trash" size={16} />}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CreateUserModal({ open, onClose, onCreated, projects, canPickRole }) {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ROLE_OPTIONS = ['user', 'admin', 'moderator']

  function genPassword() {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let p = ''
    const arr = new Uint32Array(12)
    crypto.getRandomValues(arr)
    arr.forEach((n) => (p += chars[n % chars.length]))
    setPassword(p)
  }

  function toggleProject(pid) {
    setPicked((s) => {
      const n = new Set(s)
      n.has(pid) ? n.delete(pid) : n.add(pid)
      return n
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const { data, error: err } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'create',
          email: email.trim(),
          password,
          full_name: fullName.trim() || null,
          role: canPickRole ? role : 'user',
          project_ids: role === 'user' ? [...picked] : [],
        },
      })
      if (err || data?.error) {
        const code = await fnError(err, data)
        console.warn('[users] create failed', code)
        throw new Error(String(code || ''))
      }
      onCreated?.(email.trim())
      onClose()
    } catch (err) {
      const m = String(err.message || '').toLowerCase()
      setError(m.includes('already') || m.includes('exists') ? t('register.errExists') : m.includes('password') ? t('register.errWeak') : t('panel.errCreateUser'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('users.modalTitle')} width="max-w-lg">
      <form onSubmit={submit}>
        {canPickRole && (
          <>
            <div className="field-label mb-2">{t('users.role')}</div>
            <div className="mb-5 flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`chip press ${role === r ? 'chip-on' : ''}`}
                >
                  {t('enum.role.' + r)}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="field-label">{t('users.name')}</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('users.namePlaceholder')} className="field mb-5" />

        <label className="field-label">{t('common.email')}</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@company.com"
          className="field mb-5"
        />

        <label className="field-label">{t('users.password')}</label>
        <div className="mb-5 flex gap-2">
          <input
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('users.passwordPlaceholder')}
            className="field flex-1"
          />
          <button type="button" onClick={genPassword} className="btn-ghost btn-sm shrink-0 self-end">
            <Icon name="key" size={15} /> {t('users.generate')}
          </button>
        </div>

        {role === 'user' && projects.length > 0 && (
          <>
            <div className="field-label mb-2">{t('users.access')}</div>
            <div className="mb-5 flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className={`chip press ${picked.has(p.id) ? 'chip-on' : ''}`}
                >
                  {picked.has(p.id) && <Icon name="check" size={14} />}
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        <FormError>{error}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !email.trim() || !password} className="btn-accent">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="userPlus" size={16} />}
            {t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
