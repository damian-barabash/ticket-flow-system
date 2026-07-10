import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { formatDay } from '../lib/format'
import { Spinner, IconPencil, IconTrash } from './ui'
import { DeadlineFormModal } from './DeadlineFormModal'

// whole days between today (local) and a 'YYYY-MM-DD' deadline (negative = overdue)
function daysLeft(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  const target = new Date(y, m - 1, d)
  return Math.round((target - today) / 86400000)
}

// "Цели и дедлайны" — a legendary (violet) block above the project releases.
// Admins AND project members can add goals with a deadline; many at once.
export function DeadlinesBlock({ projectId }) {
  const { user, isStaff } = useAuth()
  const { t } = useT()
  const [items, setItems] = useState([])
  const [names, setNames] = useState({}) // user_id -> label
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('project_deadlines')
      .select('*')
      .eq('project_id', projectId)
      .order('deadline', { ascending: true })
    const list = data ?? []
    setItems(list)

    const uids = [...new Set(list.map((r) => r.created_by).filter(Boolean))]
    if (uids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', uids)
      const nm = {}
      ;(profs ?? []).forEach((p) => (nm[p.id] = p.full_name || p.email || '—'))
      setNames(nm)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    load()
    const ch = supabase
      .channel(`deadlines-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_deadlines', filter: `project_id=eq.${projectId}` },
        () => load(),
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [projectId, load])

  // can edit/delete: admin or the goal's author
  const canManage = (it) => isStaff || it.created_by === user.id

  async function toggleDone(it) {
    if (!canManage(it)) return
    setBusyId(it.id)
    try {
      const { error } = await supabase
        .from('project_deadlines')
        .update({ done: !it.done })
        .eq('id', it.id)
      if (error) throw error
      load()
    } catch (err) {
      alert(t('deadlines.errSave') + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(it) {
    if (!canManage(it)) return
    if (!confirm(t('deadlines.confirmDelete', { title: it.title }))) return
    setBusyId(it.id)
    try {
      const { error } = await supabase.from('project_deadlines').delete().eq('id', it.id)
      if (error) throw error
      load()
    } catch (err) {
      alert(t('deadlines.errDelete') + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  // active goals (nearest deadline first) on top, completed ones dimmed at the bottom
  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return String(a.deadline).localeCompare(String(b.deadline))
  })

  // countdown label + color for an active goal
  function countdown(it) {
    const n = daysLeft(it.deadline)
    if (n < 0) return { text: t('deadlines.overdue', { n: -n }), color: '#FF2E2E' }
    if (n === 0) return { text: t('deadlines.today'), color: '#E3B341' }
    if (n === 1) return { text: t('deadlines.tomorrow'), color: '#E3B341' }
    return { text: t('deadlines.left', { n }), color: '#A974FF' }
  }

  // hide entirely for clients when nothing is set yet
  if (!loading && sorted.length === 0 && !isStaff) return null

  return (
    <section
      className="mb-6 overflow-hidden border border-legend/45 bg-legendSoft"
      style={{ boxShadow: '0 0 0 1px rgba(169,116,255,0.10), 0 0 28px -10px rgba(169,116,255,0.45)' }}
    >
      <div
        className="flex items-center justify-between border-b border-legend/30 px-4 py-3"
        style={{ background: 'linear-gradient(90deg, rgba(169,116,255,0.14), rgba(169,116,255,0))' }}
      >
        <span className="label flex items-center gap-2" style={{ color: '#C9B0FF' }}>
          <span style={{ color: '#A974FF' }}>✦</span> {t('deadlines.heading')}
        </span>
        <button
          onClick={() => setShowAdd(true)}
          className="label transition-colors"
          style={{ color: '#C9B0FF' }}
        >
          {t('deadlines.add')}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-faint">{t('deadlines.empty')}</p>
      ) : (
        <ul className="divide-y divide-legend/15">
          {sorted.map((it) => {
            const cd = it.done ? null : countdown(it)
            return (
              <li key={it.id} className={`flex items-center gap-3 px-4 py-3 ${it.done ? 'opacity-55' : ''}`}>
                <span className="shrink-0 text-sm" style={{ color: it.done ? '#3FB950' : '#A974FF' }}>
                  {it.done ? '✓' : '✦'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm text-ink ${it.done ? 'line-through' : ''}`}>{it.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-faint">
                    <span>{formatDay(it.deadline)}</span>
                    {it.created_by && names[it.created_by] && (
                      <span>· {t('deadlines.by', { name: names[it.created_by] })}</span>
                    )}
                  </div>
                </div>

                {it.done ? (
                  <span className="hidden shrink-0 font-mono text-[10px] text-ok sm:inline">{t('deadlines.done')}</span>
                ) : (
                  <span className="shrink-0 font-mono text-[10px]" style={{ color: cd.color }}>
                    {cd.text}
                  </span>
                )}

                {canManage(it) && (
                  <button
                    onClick={() => toggleDone(it)}
                    disabled={busyId === it.id}
                    className="btn-ghost shrink-0 px-3 py-1.5 text-[10px]"
                  >
                    {busyId === it.id ? <Spinner className="h-3 w-3" /> : it.done ? t('deadlines.reopen') : t('deadlines.markDone')}
                  </button>
                )}

                {canManage(it) && !it.done && (
                  <button
                    onClick={() => setEditItem(it)}
                    disabled={busyId === it.id}
                    className="shrink-0 px-1 text-faint transition-colors hover:text-ink"
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                  >
                    <IconPencil size={15} />
                  </button>
                )}

                {canManage(it) && (
                  <button
                    onClick={() => remove(it)}
                    disabled={busyId === it.id}
                    className="shrink-0 px-1 text-faint transition-colors hover:text-accent"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showAdd && (
        <DeadlineFormModal open={showAdd} onClose={() => setShowAdd(false)} projectId={projectId} onSaved={load} />
      )}
      {editItem && (
        <DeadlineFormModal
          open={!!editItem}
          onClose={() => setEditItem(null)}
          projectId={projectId}
          item={editItem}
          onSaved={load}
        />
      )}
    </section>
  )
}
