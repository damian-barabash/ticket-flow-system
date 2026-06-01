import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { Spinner, EmptyState, Avatar, Modal } from '../components/ui'

export default function AdminUsers() {
  const navigate = useNavigate()
  const { t } = useT()
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [membership, setMembership] = useState({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    const [{ data: profs }, { data: projs }, { data: mem }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, created_at').order('created_at'),
      supabase.from('projects').select('id, name').order('created_at'),
      supabase.from('project_members').select('user_id, project_id'),
    ])
    setUsers(profs ?? [])
    setProjects(projs ?? [])
    const m = {}
    ;(mem ?? []).forEach((x) => (m[x.user_id] = (m[x.user_id] || 0) + 1))
    setMembership(m)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function removeUser(u) {
    if (!confirm(t('users.confirmDelete', { email: u.email }))) return
    const { error } = await supabase.functions.invoke('create-user', {
      body: { action: 'delete', user_id: u.id },
    })
    if (error) alert(t('users.errDelete') + error.message)
    load()
  }

  const clients = users.filter((u) => u.role !== 'admin')
  const admins = users.filter((u) => u.role === 'admin')

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <button onClick={() => navigate('/projects')} className="label mb-5 hover:text-ink transition-colors">
          {t('common.toProjects')}
        </button>

        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="label">{t('users.label')} · MMXXVI</span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t('users.heading')}</h1>
            <p className="mt-1 text-sm text-faint">{t('users.sub')}</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-solid">
            {t('users.new')}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <div className="space-y-8">
            <UserGroup title={t('users.admins')} users={admins} membership={membership} />
            {clients.length === 0 ? (
              <EmptyState title={t('users.emptyTitle')} hint={t('users.emptyHint')}>
                <button onClick={() => setShowCreate(true)} className="btn-ghost">
                  {t('users.emptyBtn')}
                </button>
              </EmptyState>
            ) : (
              <UserGroup title={t('users.clients')} users={clients} membership={membership} onRemove={removeUser} />
            )}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateUserModal
          open={showCreate}
          projects={projects}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}

function UserGroup({ title, users, membership, onRemove }) {
  const { t } = useT()
  if (!users.length) return null
  return (
    <section>
      <h2 className="label mb-3">{title}</h2>
      <ul className="divide-y divide-line border border-line">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={u.full_name} email={u.email} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">{u.full_name || u.email}</div>
              {u.full_name && <div className="truncate text-xs text-faint">{u.email}</div>}
            </div>
            {u.role !== 'admin' && (
              <span className="label-sm hidden sm:inline">{t('users.projectsCount', { n: membership[u.id] || 0 })}</span>
            )}
            {u.role === 'admin' ? (
              <span className="label-sm text-accent">admin</span>
            ) : (
              onRemove && (
                <button onClick={() => onRemove(u)} className="label-sm text-faint hover:text-accent">
                  {t('users.remove')}
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CreateUserModal({ open, onClose, onCreated, projects }) {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    setError('')
    setBusy(true)
    try {
      const { error: err } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'create',
          email: email.trim(),
          password,
          full_name: fullName.trim() || null,
          project_ids: [...picked],
        },
      })
      if (err) throw new Error(err.message)
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err.message || t('users.errCreate'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('users.modalTitle')} width="max-w-lg">
      <form onSubmit={submit}>
        <label className="label mb-2 block">{t('users.name')}</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('users.namePlaceholder')} className="field mb-5" />

        <label className="label mb-2 block">{t('common.email')}</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@company.com"
          className="field mb-5"
        />

        <label className="label mb-2 block">{t('users.password')}</label>
        <div className="mb-5 flex gap-2">
          <input
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('users.passwordPlaceholder')}
            className="field flex-1"
          />
          <button type="button" onClick={genPassword} className="btn-ghost shrink-0">
            {t('users.generate')}
          </button>
        </div>

        {projects.length > 0 && (
          <>
            <label className="label mb-2 block">{t('users.access')}</label>
            <div className="mb-5 flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className={`border px-3 py-1.5 text-xs transition-colors ${
                    picked.has(p.id) ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !email.trim() || !password} className="btn-solid">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
