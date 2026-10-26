import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { WorkspaceFormModal } from '../components/WorkspaceFormModal'
import { EmptyState, ErrorState, Icon, Segmented, Skeleton, CountBadge, useConfirm, useToast } from '../components/ui'
import { Tour } from '../components/Tour'
import { useChatUnread } from '../lib/chat'
import { channelName, useDebounced } from '../lib/realtime'
import { loadProjectDetail, prefetch } from '../lib/prefetch'
import { errText } from '../lib/errors'

// Last payload survives navigation → returning to the grid is instant, then
// refreshed silently in the background.
let cache = null

export function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter((w) => /^[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'TF'
  )
}

// Cover image or a red "blaze" fallback with the project initials.
export function ProjectCover({ project, archived, className = 'aspect-[16/8]' }) {
  return (
    <div className={`relative w-full overflow-hidden bg-surface2 ${className} ${archived ? 'grayscale' : ''}`}>
      {project.cover_url ? (
        <img
          src={project.cover_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grain flex h-full w-full items-end bg-[linear-gradient(135deg,#1a0302_0%,#5a0703_45%,#c3150c_100%)] p-4">
          <span className="display text-[64px] text-white/90">{initials(project.name)}</span>
        </div>
      )}
    </div>
  )
}

function Stat({ n, label, tone }) {
  const color = tone === 'accent' && n > 0 ? 'text-accent' : tone === 'ok' ? 'text-ok' : 'text-ink'
  return (
    <div className="min-w-0">
      <div className={`num text-[22px] font-medium leading-none ${n === 0 ? 'text-faint' : color}`}>{n}</div>
      <div className="mt-1.5 truncate text-[12px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div>
    </div>
  )
}

export const ProjectCard = memo(function ProjectCard({ project, stats, chat, index, tour, onOpen }) {
  const { t } = useT()
  const s = stats || { open: 0, done: 0, overdue: 0, unread: 0 }
  return (
    <button
      onClick={() => onOpen(project.id)}
      onMouseEnter={() => prefetch(loadProjectDetail)}
      onFocus={() => prefetch(loadProjectDetail)}
      onTouchStart={() => prefetch(loadProjectDetail)}
      data-tour={tour ? 'project-card' : undefined}
      className="card-in press group relative flex flex-col border border-line bg-surface text-left transition-colors hover:border-line2 hover:bg-surface2"
      style={{ '--i': index }}
    >
      <ProjectCover project={project} />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        {s.unread > 0 && (
          <span className="flex h-7 items-center gap-1.5 bg-accent px-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-white">
            <Icon name="bell" size={14} /> {t('panel.newCount', { n: s.unread })}
          </span>
        )}
        {chat > 0 && (
          <span className="flex h-7 items-center gap-1.5 bg-ink px-2 text-[12px] font-semibold text-bg">
            <Icon name="chat" size={14} /> {chat > 99 ? '99+' : chat}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 font-display text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight text-ink">
          {project.name}
        </h3>
        {project.description && <p className="mt-2 line-clamp-2 text-[14px] text-muted">{project.description}</p>}
        <div className="min-h-4 flex-1" />
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat n={s.open} label={t('panel.statOpen')} />
          <Stat n={s.overdue} label={t('panel.statOverdue')} tone="accent" />
          <Stat n={s.done} label={t('panel.statDone')} tone="ok" />
        </div>
      </div>
      <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center bg-bg/80 text-ink opacity-0 transition-opacity group-hover:opacity-100">
        <Icon name="arrowRight" size={16} />
      </span>
    </button>
  )
})

// Workspace tile — pinned before ungrouped projects. Red-tinted.
const WorkspaceCard = memo(function WorkspaceCard({ ws, count, index, archived, onOpen, onRestore, onDelete }) {
  const { t } = useT()
  return (
    <div
      className="card-in group relative flex flex-col border border-accent/45 bg-surface transition-colors hover:border-accent"
      style={{ '--i': index }}
    >
      <button onClick={() => onOpen(ws.id)} className="press flex flex-1 flex-col text-left">
        <div className="grain relative flex aspect-[16/8] w-full items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_120%,rgba(242,35,27,0.45),rgba(6,6,6,0.2)_60%)]">
          <div className="relative h-16 w-24">
            <span className="absolute inset-0 translate-x-3 translate-y-3 border border-accent/30" />
            <span className="absolute inset-0 translate-x-1.5 translate-y-1.5 border border-accent/55" />
            <span className="absolute inset-0 border border-accent bg-bg/50" />
          </div>
          <span className="tag absolute left-3 top-3 text-accent">{t('workspaces.card')}</span>
          {!archived && (
            <span className="absolute right-3 top-3 text-accent" title={t('panel.pinned')}>
              <Icon name="pin" size={16} />
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="line-clamp-2 font-display text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight text-ink">
            {ws.name}
          </h3>
          <p className="mt-2 flex items-center gap-2 text-[14px] text-muted">
            <Icon name="lock" size={14} /> {t('workspaces.private')}
          </p>
          <div className="mt-4 border-t border-line pt-4">
            <Stat n={count} label={t('panel.projectsInside')} />
          </div>
        </div>
      </button>
      {archived && <ArchiveActions onRestore={() => onRestore(ws)} onDelete={() => onDelete(ws)} />}
    </div>
  )
})

function ArchiveActions({ onRestore, onDelete }) {
  const { t } = useT()
  return (
    <div className="grid grid-cols-2 border-t border-line">
      <button onClick={onRestore} className="press flex h-11 items-center justify-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink hover:bg-surface2">
        <Icon name="restore" size={16} /> {t('common.restore')}
      </button>
      <button onClick={onDelete} className="press flex h-11 items-center justify-center gap-2 border-l border-line text-[13px] font-semibold uppercase tracking-[0.06em] text-accent hover:bg-accent hover:text-white">
        <Icon name="trash" size={16} /> {t('common.delete')}
      </button>
    </div>
  )
}

const ArchiveProjectCard = memo(function ArchiveProjectCard({ project, index, isStaff, onOpen, onRestore, onDelete }) {
  return (
    <div className="card-in group relative flex flex-col border border-line bg-surface transition-colors hover:border-line2" style={{ '--i': index }}>
      <button onClick={() => onOpen(project.id)} className="press flex flex-1 flex-col text-left">
        <ProjectCover project={project} archived />
        <div className="flex flex-1 flex-col p-5">
          <h3 className="line-clamp-2 font-display text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight text-muted">
            {project.name}
          </h3>
          {project.description && <p className="mt-2 line-clamp-2 text-[14px] text-faint">{project.description}</p>}
        </div>
      </button>
      {isStaff && <ArchiveActions onRestore={() => onRestore(project)} onDelete={() => onDelete(project)} />}
    </div>
  )
})

export function GridSkeleton({ n = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="border border-line bg-surface">
          <Skeleton className="aspect-[16/8] w-full" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PageHeader({ tag, title, sub, children }) {
  return (
    <div className="page-in mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {tag && <span className="tag text-muted">{tag}</span>}
        <h1 className="display mt-3 break-words text-[44px] text-ink sm:text-[64px] lg:text-[80px]">{title}</h1>
        {sub && <p className="mt-3 max-w-xl text-[15px] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export default function Projects() {
  const { isStaff } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { counts: chatCounts } = useChatUnread()

  const [data, setData] = useState(cache) // { projects, workspaces, links, stats }
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [showWsForm, setShowWsForm] = useState(false)
  const req = useRef(0)

  const load = useCallback(async () => {
    const my = ++req.current
    const [p, w, l, s] = await Promise.all([
      supabase.from('projects').select('id, name, description, cover_url, created_at, archived').order('created_at', { ascending: false }),
      supabase.from('workspaces').select('*').order('created_at', { ascending: true }),
      supabase.from('workspace_projects').select('workspace_id, project_id'),
      supabase.rpc('project_stats'),
    ])
    if (my !== req.current) return
    const err = p.error || w.error || l.error
    if (err) {
      setError(err)
      return
    }
    const stats = {}
    ;(s.data ?? []).forEach((r) => {
      stats[r.project_id] = { open: Number(r.open), done: Number(r.done), total: Number(r.total), unread: Number(r.unread), overdue: Number(r.overdue) }
    })
    const next = { projects: p.data ?? [], workspaces: w.data ?? [], links: l.data ?? [], stats }
    cache = next
    setError(null)
    setData(next)
  }, [])

  // only the counters move on ticket activity → refetch the RPC alone, debounced
  const refreshStats = useDebounced(async () => {
    const my = req.current
    const { data: rows, error: e } = await supabase.rpc('project_stats')
    if (e || my !== req.current) return
    const stats = {}
    rows.forEach((r) => {
      stats[r.project_id] = { open: Number(r.open), done: Number(r.done), total: Number(r.total), unread: Number(r.unread), overdue: Number(r.overdue) }
    })
    setData((d) => {
      if (!d) return d
      const next = { ...d, stats }
      cache = next
      return next
    })
  }, 300)

  useEffect(() => {
    load()
    const ch = supabase
      .channel(channelName('projects-grid'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => refreshStats())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load, refreshStats])

  const view = useMemo(() => {
    if (!data) return null
    const { projects, workspaces, links } = data
    const activeIds = new Set(projects.filter((p) => !p.archived).map((p) => p.id))
    const grouped = new Set()
    const wsCount = {}
    for (const l of links) {
      grouped.add(l.project_id)
      if (activeIds.has(l.project_id)) wsCount[l.workspace_id] = (wsCount[l.workspace_id] || 0) + 1
    }
    const activeWs = workspaces.filter((w) => !w.archived)
    const archivedWs = workspaces.filter((w) => w.archived)
    const ungroupedActive = projects.filter((p) => !p.archived && !grouped.has(p.id))
    const archivedProjects = projects.filter((p) => p.archived)
    return { activeWs, archivedWs, ungroupedActive, archivedProjects, wsCount }
  }, [data])

  const totals = useMemo(() => {
    if (!data) return null
    const act = new Set(data.projects.filter((p) => !p.archived).map((p) => p.id))
    let open = 0, overdue = 0, unread = 0
    for (const [pid, s] of Object.entries(data.stats)) {
      if (!act.has(pid)) continue
      open += s.open
      overdue += s.overdue
      unread += s.unread
    }
    return { open, overdue, unread }
  }, [data])

  const openProject = useCallback((pid) => navigate(`/projects/${pid}`), [navigate])
  const openWs = useCallback((wid) => navigate(`/workspaces/${wid}`), [navigate])

  async function mutate(promise, okText) {
    const { error: e } = await promise
    if (e) toast.show(errText(t, e), { tone: 'error' })
    else if (okText) toast.show(okText)
    load()
  }
  const restoreProject = useCallback(
    (p) => mutate(supabase.from('projects').update({ archived: false }).eq('id', p.id), t('panel.restored', { name: p.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )
  const deleteProject = useCallback(
    async (p) => {
      const ok = await confirm({ title: t('panel.deleteProjectTitle'), body: t('projects.confirmDelete', { name: p.name }), danger: true, confirmLabel: t('common.delete') })
      if (ok) mutate(supabase.from('projects').delete().eq('id', p.id), t('panel.deleted', { name: p.name }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, confirm],
  )
  const restoreWs = useCallback(
    (w) => mutate(supabase.from('workspaces').update({ archived: false }).eq('id', w.id), t('panel.restored', { name: w.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )
  const deleteWs = useCallback(
    async (w) => {
      const ok = await confirm({ title: t('workspaces.delete'), body: t('workspaces.confirmDelete', { name: w.name }), danger: true, confirmLabel: t('common.delete') })
      if (ok) mutate(supabase.from('workspaces').delete().eq('id', w.id), t('panel.deleted', { name: w.name }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, confirm],
  )

  const tourSteps = useMemo(
    () =>
      isStaff
        ? [
            { title: t('tour.projAdmin0Title'), text: t('tour.projAdmin0Text') },
            { target: '[data-tour="new-project"]', title: t('tour.projAdmin1Title'), text: t('tour.projAdmin1Text') },
            { target: '[data-tour="users"]', title: t('tour.projAdmin2Title'), text: t('tour.projAdmin2Text') },
          ]
        : [
            { title: t('tour.projClient0Title'), text: t('tour.projClient0Text') },
            { target: '[data-tour="project-card"]', title: t('tour.projClient1Title'), text: t('tour.projClient1Text') },
          ],
    [isStaff, t],
  )

  const activeCount = view ? view.activeWs.length + view.ungroupedActive.length : 0
  const archiveCount = view ? view.archivedWs.length + view.archivedProjects.length : 0

  return (
    <div className="min-h-screen bg-bg">
      <TopBar />

      <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <PageHeader tag={t('projects.catalog')} title={t('projects.heading')} sub={isStaff ? t('projects.subAdmin') : t('projects.subClient')}>
          <button onClick={() => setShowWsForm(true)} className="btn-ghost">
            <Icon name="layers" size={17} /> {t('panel.newWorkspace')}
          </button>
          {isStaff && (
            <button onClick={() => setShowForm(true)} data-tour="new-project" className="btn-accent">
              <Icon name="plus" size={17} /> {t('panel.newProject')}
            </button>
          )}
        </PageHeader>

        {/* totals strip */}
        {totals && activeCount > 0 && (
          <div className="mb-8 grid grid-cols-3 border border-line bg-surface sm:max-w-xl">
            {[
              { n: totals.open, l: t('panel.statOpen'), c: 'text-ink' },
              { n: totals.overdue, l: t('panel.statOverdue'), c: totals.overdue ? 'text-accent' : 'text-faint' },
              { n: totals.unread, l: t('panel.statUnread'), c: totals.unread ? 'text-accent' : 'text-faint' },
            ].map((x, i) => (
              <div key={i} className={`px-4 py-3 ${i ? 'border-l border-line' : ''}`}>
                <div className={`num text-[26px] font-medium leading-none ${x.c}`}>{x.n}</div>
                <div className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">{x.l}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-6 flex items-center justify-between gap-3">
          <Segmented
            value={tab}
            onChange={setTab}
            items={[
              { key: 'active', label: t('projects.tabActive'), n: view ? activeCount : null },
              { key: 'archive', label: t('projects.tabArchive'), icon: 'archive', n: view ? archiveCount : null },
            ]}
          />
        </div>

        {!data ? (
          error ? (
            <ErrorState message={errText(t, error, 'common.loadError')} onRetry={load} />
          ) : (
            <GridSkeleton />
          )
        ) : tab === 'active' ? (
          activeCount === 0 ? (
            <EmptyState icon="folder" title={t('projects.emptyTitle')} hint={isStaff ? t('projects.emptyAdmin') : t('projects.emptyClient')}>
              {isStaff && (
                <button onClick={() => setShowForm(true)} className="btn-accent">
                  <Icon name="plus" size={17} /> {t('panel.newProject')}
                </button>
              )}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
              {view.activeWs.map((w, i) => (
                <WorkspaceCard key={w.id} ws={w} index={i} count={view.wsCount[w.id] || 0} onOpen={openWs} />
              ))}
              {view.ungroupedActive.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  index={view.activeWs.length + i}
                  tour={i === 0}
                  stats={data.stats[p.id]}
                  chat={chatCounts?.[p.id] || 0}
                  onOpen={openProject}
                />
              ))}
            </div>
          )
        ) : archiveCount === 0 ? (
          <EmptyState icon="archive" title={t('projects.emptyArchiveTitle')} hint={t('projects.emptyArchiveHint')} />
        ) : (
          <div className="space-y-10">
            {view.archivedWs.length > 0 && (
              <section>
                <h2 className="label mb-4">{t('projects.archiveWorkspaces')}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
                  {view.archivedWs.map((w, i) => (
                    <WorkspaceCard key={w.id} ws={w} index={i} count={0} archived onOpen={openWs} onRestore={restoreWs} onDelete={deleteWs} />
                  ))}
                </div>
              </section>
            )}
            {view.archivedProjects.length > 0 && (
              <section>
                <h2 className="label mb-4">{t('projects.archiveProjects')}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
                  {view.archivedProjects.map((p, i) => (
                    <ArchiveProjectCard
                      key={p.id}
                      project={p}
                      index={i}
                      isStaff={isStaff}
                      onOpen={openProject}
                      onRestore={restoreProject}
                      onDelete={deleteProject}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {showForm && (
        <ProjectFormModal
          open
          onClose={() => setShowForm(false)}
          onSaved={(row) => {
            load()
            if (row?.id) toast.show(t('panel.projectCreated', { name: row.name }), { actions: [{ label: t('common.open'), onClick: () => openProject(row.id) }] })
          }}
        />
      )}
      {showWsForm && <WorkspaceFormModal open onClose={() => setShowWsForm(false)} onSaved={load} />}

      {data && <Tour storageKey={isStaff ? 'projects-admin' : 'projects-client'} steps={tourSteps} />}
    </div>
  )
}
