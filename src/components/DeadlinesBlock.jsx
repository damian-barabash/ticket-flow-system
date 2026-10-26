import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { formatDay, daysUntil } from '../lib/format'
import { Icon, Skeleton, useConfirm, useToast } from './ui'
import { channelName } from '../lib/realtime'
import { errText } from '../lib/errors'
import { usePeople } from './AssigneePicker'

const DeadlineFormModal = lazy(() => import('./DeadlineFormModal').then((m) => ({ default: m.DeadlineFormModal })))
const LEGEND = '#B084FF'

// "Goals & deadlines" — the violet (legendary) block. Admins AND project members
// can add goals. Realtime patches the list from payloads.
export function DeadlinesBlock({ projectId }) {
  const { user, isStaff } = useAuth()
  const { t } = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const { byId: people } = usePeople(projectId)
  const [items, setItems] = useState(null) // null = first load
  const [error, setError] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const req = useRef(0)

  const load = useCallback(async () => {
    const my = ++req.current
    const { data, error: e } = await supabase.from('project_deadlines').select('*').eq('project_id', projectId).order('deadline', { ascending: true })
    if (my !== req.current) return
    if (e) {
      setError(true)
      return
    }
    setError(false)
    setItems(data ?? [])
  }, [projectId])

  useEffect(() => {
    setItems(null)
    load()
    const ch = supabase
      .channel(channelName(`deadlines-${projectId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_deadlines', filter: `project_id=eq.${projectId}` }, ({ new: r }) =>
        setItems((xs) => (xs && !xs.some((x) => x.id === r.id) ? [...xs, r] : xs)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_deadlines', filter: `project_id=eq.${projectId}` }, ({ new: r }) =>
        setItems((xs) => xs && xs.map((x) => (x.id === r.id ? { ...x, ...r } : x))),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'project_deadlines' }, ({ old }) =>
        setItems((xs) => xs && xs.filter((x) => x.id !== old.id)),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [projectId, load])

  const canManage = (it) => isStaff || it.created_by === user.id

  async function toggleDone(it) {
    if (!canManage(it)) return
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !it.done } : x)))
    const { error: e } = await supabase.from('project_deadlines').update({ done: !it.done }).eq('id', it.id)
    if (e) {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: it.done } : x)))
      toast.show(errText(t, e), { tone: 'error' })
    }
  }

  async function remove(it) {
    if (!canManage(it)) return
    const ok = await confirm({ title: t('panel.deleteGoal'), body: t('deadlines.confirmDelete', { title: it.title }), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    const before = items
    setItems((xs) => xs.filter((x) => x.id !== it.id))
    const { error: e } = await supabase.from('project_deadlines').delete().eq('id', it.id)
    if (e) {
      setItems(before)
      toast.show(errText(t, e), { tone: 'error' })
    }
  }

  const sorted = useMemo(
    () =>
      [...(items ?? [])].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        return String(a.deadline).localeCompare(String(b.deadline))
      }),
    [items],
  )

  function countdown(it) {
    const n = daysUntil(it.deadline)
    if (n < 0) return { text: t('deadlines.overdue', { n: -n }), color: '#F2231B' }
    if (n === 0) return { text: t('deadlines.today'), color: '#F0BE46' }
    if (n === 1) return { text: t('deadlines.tomorrow'), color: '#F0BE46' }
    return { text: t('deadlines.left', { n }), color: LEGEND }
  }

  // clients: hide when nothing is set yet
  if (items && sorted.length === 0 && !isStaff && !error) return null

  const shown = expanded ? sorted : sorted.slice(0, 4)
  const openCount = sorted.filter((x) => !x.done).length

  return (
    <section className="border border-legend/40 bg-[linear-gradient(180deg,rgba(176,132,255,0.10),rgba(176,132,255,0.02))]">
      <div className="flex items-center justify-between gap-3 border-b border-legend/25 px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em]" style={{ color: '#CDB4FF' }}>
          <Icon name="target" size={17} className="text-legend" />
          {t('deadlines.heading')}
          {openCount > 0 && <span className="num text-[12px] text-faint">{openCount}</span>}
        </span>
        <button onClick={() => setShowAdd(true)} className="press flex h-9 items-center gap-1.5 border border-legend/40 px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:border-legend hover:bg-legend/10">
          <Icon name="plus" size={15} /> {t('panel.addGoal')}
        </button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-[14px] text-muted">
          {t('common.loadError')}
          <button onClick={load} className="btn-link text-[13px]">
            {t('common.retry')}
          </button>
        </div>
      ) : !items ? (
        <div className="space-y-3 px-4 py-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="px-4 py-5 text-[14px] text-muted">{t('deadlines.empty')}</p>
      ) : (
        <ul className="divide-y divide-legend/15">
          {shown.map((it) => {
            const cd = it.done ? null : countdown(it)
            const manage = canManage(it)
            const by = people?.[it.created_by]
            return (
              <li key={it.id} className={`flex items-center gap-3 px-4 py-3 ${it.done ? 'opacity-55' : ''}`}>
                <button
                  onClick={() => toggleDone(it)}
                  disabled={!manage}
                  title={it.done ? t('deadlines.reopen') : t('deadlines.markDone')}
                  aria-label={it.done ? t('deadlines.reopen') : t('deadlines.markDone')}
                  className={`press flex h-6 w-6 shrink-0 items-center justify-center border transition-colors ${
                    it.done ? 'border-ok bg-ok text-bg' : 'border-legend/60 text-transparent hover:text-legend'
                  } disabled:cursor-default`}
                >
                  <Icon name="check" size={15} stroke={2.4} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[15px] font-medium text-ink ${it.done ? 'line-through' : ''}`}>{it.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                    <span>{formatDay(it.deadline)}</span>
                    {by && <span className="text-faint">· {by.full_name || by.email}</span>}
                  </div>
                </div>
                {cd && (
                  <span className="shrink-0 border px-2 py-0.5 text-[12px] font-semibold" style={{ color: cd.color, borderColor: cd.color + '55' }}>
                    {cd.text}
                  </span>
                )}
                {manage && (
                  <span className="flex shrink-0 items-center">
                    {!it.done && (
                      <button onClick={() => setEditItem(it)} className="icon-btn-sm" title={t('common.edit')} aria-label={t('common.edit')}>
                        <Icon name="pencil" size={15} />
                      </button>
                    )}
                    <button onClick={() => remove(it)} className="icon-btn-sm hover:!text-accent" title={t('common.delete')} aria-label={t('common.delete')}>
                      <Icon name="trash" size={15} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {sorted.length > 4 && (
        <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-center gap-1.5 border-t border-legend/15 py-2.5 text-[13px] font-semibold text-muted hover:text-ink">
          <Icon name={expanded ? 'up' : 'down'} size={15} />
          {expanded ? t('panel.showLess') : t('panel.showAll', { n: sorted.length })}
        </button>
      )}

      <Suspense fallback={null}>
        {(showAdd || editItem) && (
          <DeadlineFormModal
            open
            onClose={() => {
              setShowAdd(false)
              setEditItem(null)
            }}
            projectId={projectId}
            item={editItem}
            onSaved={(row) => {
              if (!row) return load()
              setItems((xs) => {
                const list = xs ?? []
                return list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]
              })
            }}
          />
        )}
      </Suspense>
    </section>
  )
}
