import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Modal, Spinner, Avatar } from './ui'

// Admin: link/unlink client users to a project.
export function ManageMembersModal({ open, onClose, projectId }) {
  const { t } = useT()
  const [users, setUsers] = useState([])
  const [memberIds, setMemberIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: profs }, { data: mem }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').order('created_at'),
      supabase.from('project_members').select('user_id').eq('project_id', projectId),
    ])
    setUsers((profs ?? []).filter((p) => p.role === 'user'))
    setMemberIds(new Set((mem ?? []).map((m) => m.user_id)))
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId])

  async function toggle(userId) {
    setBusyId(userId)
    if (memberIds.has(userId)) {
      await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
      setMemberIds((s) => {
        const n = new Set(s)
        n.delete(userId)
        return n
      })
    } else {
      await supabase.from('project_members').insert({ project_id: projectId, user_id: userId })
      setMemberIds((s) => new Set(s).add(userId))
    }
    setBusyId(null)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('members.title')}>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : users.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">
          {t('members.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const isMember = memberIds.has(u.id)
            return (
              <li key={u.id} className="flex items-center gap-3 py-3">
                <Avatar name={u.full_name} email={u.email} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{u.full_name || u.email}</div>
                  {u.full_name && <div className="truncate text-xs text-faint">{u.email}</div>}
                </div>
                <button
                  onClick={() => toggle(u.id)}
                  disabled={busyId === u.id}
                  className={isMember ? 'btn-ghost' : 'btn-solid'}
                >
                  {busyId === u.id ? '…' : isMember ? t('members.remove') : t('members.add')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
