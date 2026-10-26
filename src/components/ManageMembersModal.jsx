import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Avatar, EmptyState, ErrorState, Icon, Modal, Skeleton, Spinner, useToast } from './ui'
import { errText } from '../lib/errors'

// Staff: link/unlink client users to a project (optimistic, rolls back on error).
export function ManageMembersModal({ open, onClose, projectId }) {
  const { t } = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const [users, setUsers] = useState(null)
  const [memberIds, setMemberIds] = useState(new Set())
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setError(false)
    const [{ data: profs, error: e1 }, { data: mem, error: e2 }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').eq('role', 'user').order('created_at'),
      supabase.from('project_members').select('user_id').eq('project_id', projectId),
    ])
    if (e1 || e2) {
      setError(true)
      return
    }
    setUsers(profs ?? [])
    setMemberIds(new Set((mem ?? []).map((m) => m.user_id)))
  }, [projectId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function toggle(userId) {
    if (busyId) return
    const isMember = memberIds.has(userId)
    setBusyId(userId)
    const flip = (on) =>
      setMemberIds((s) => {
        const n = new Set(s)
        on ? n.add(userId) : n.delete(userId)
        return n
      })
    flip(!isMember)
    const { error: e } = isMember
      ? await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
      : await supabase.from('project_members').insert({ project_id: projectId, user_id: userId })
    if (e) {
      flip(isMember)
      toast.show(errText(t, e), { tone: 'error' })
    }
    setBusyId(null)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('members.title')} width="max-w-lg">
      {error ? (
        <ErrorState onRetry={load} onClose={onClose} />
      ) : !users ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon="users" title={t('panel.noClients')} hint={t('members.empty')}>
          <button
            onClick={() => {
              onClose()
              navigate('/admin/users')
            }}
            className="btn-accent"
          >
            <Icon name="userPlus" size={16} /> {t('topbar.users')}
          </button>
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-muted">{t('panel.membersHint', { n: memberIds.size })}</p>
          <ul className="divide-y divide-line border-y border-line">
            {users.map((u) => {
              const isMember = memberIds.has(u.id)
              return (
                <li key={u.id} className="flex items-center gap-3 py-3">
                  <Avatar name={u.full_name} email={u.email} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-ink">{u.full_name || u.email}</div>
                    {u.full_name && <div className="truncate text-[13px] text-muted">{u.email}</div>}
                  </div>
                  <button
                    onClick={() => toggle(u.id)}
                    disabled={!!busyId}
                    className={`btn-sm min-w-[112px] ${isMember ? 'btn-ghost' : 'btn-accent'}`}
                  >
                    {busyId === u.id ? (
                      <Spinner size={13} />
                    ) : isMember ? (
                      <>
                        <Icon name="check" size={15} /> {t('panel.member')}
                      </>
                    ) : (
                      <>
                        <Icon name="plus" size={15} /> {t('members.add')}
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Modal>
  )
}
