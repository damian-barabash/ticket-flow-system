import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { WorkspaceFormModal } from '../components/WorkspaceFormModal'
import { CalendarModal } from '../components/CalendarModal'
import { Spinner, EmptyState, IconCalendar } from '../components/ui'
import { Tour } from '../components/Tour'

function ProjectCard({ project, index, counts, onOpen, tour }) {
  const { t } = useT()
  const open = counts?.open ?? 0
  const done = counts?.done ?? 0
  return (
    <button
      onClick={onOpen}
      data-tour={tour ? 'project-card' : undefined}
      className="group brackets relative flex flex-col overflow-hidden border border-line bg-surface text-left transition-colors hover:border-line2"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface2">
        {project.cover_url ? (
          <img
            src={project.cover_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="dotgrid h-full w-full" />
        )}
        {index != null && (
          <span className="absolute left-3 top-3 label bg-bg/70 px-1.5 py-0.5">
            № {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[15px] font-medium text-ink">{project.name}</h3>
        {project.description && <p className="mt-1.5 line-clamp-2 text-xs text-faint">{project.description}</p>}
        <div className="mt-4 flex items-center gap-4 border-t border-line pt-3">
          <span className="flex items-center gap-1.5 label">
            <span className="inline-block h-1.5 w-1.5 bg-accent" />
            {t('projects.open', { n: open })}
          </span>
          <span className="flex items-center gap-1.5 label">
            <span className="inline-block h-1.5 w-1.5 bg-ok" />
            {t('projects.done', { n: done })}
          </span>
        </div>
      </div>
    </button>
  )
}

// Workspace tile — like a project card but with a light-red border. Always
// rendered before ungrouped projects (pinned to the top). Click opens it.
function WorkspaceCard({ ws, count, onOpen, archived, onRestore, onDelete }) {
  const { t } = useT()
  return (
    <div className="group relative flex flex-col overflow-hidden border border-accent/40 bg-surface shadow-[0_0_50px_-28px_rgba(255,46,46,0.6)] transition-colors hover:border-accent/70">
      {archived && (
        <div className="absolute right-2 top-2 z-10 flex gap-1.5">
          <button
            onClick={onRestore}
            className="border border-line bg-bg/80 px-2 py-1 label backdrop-blur transition-colors hover:text-ink"
          >
            {t('common.restore')}
          </button>
          <button
            onClick={onDelete}
            className="border border-line bg-bg/80 px-2 py-1 label backdrop-blur transition-colors hover:text-accent"
          >
            {t('common.delete')}
          </button>
        </div>
      )}
      <button onClick={onOpen} className="flex flex-1 flex-col text-left">
        <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-accentSoft">
          {/* stacked-cards motif */}
          <div className="relative h-14 w-20">
            <span className="absolute inset-0 translate-x-2 translate-y-2 border border-accent/30" />
            <span className="absolute inset-0 translate-x-1 translate-y-1 border border-accent/50" />
            <span className="absolute inset-0 border border-accent/80 bg-bg/40" />
          </div>
          <span className="absolute left-3 top-3 label text-accent">{t('workspaces.card')}</span>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-[15px] font-medium text-ink">{ws.name}</h3>
          <p className="mt-1.5 text-xs text-faint">{t('workspaces.private')}</p>
          <div className="mt-4 flex items-center gap-4 border-t border-line pt-3">
            <span className="flex items-center gap-1.5 label">
              <span className="inline-block h-1.5 w-1.5 bg-accent" />
              {t('workspaces.count', { n: count })}
            </span>
          </div>
        </div>
      </button>
    </div>
  )
}

// Archived project tile with restore / delete (staff) or plain open.
function ArchiveProjectCard({ project, isStaff, onOpen, onRestore, onDelete }) {
  const { t } = useT()
  return (
    <div className="group relative flex flex-col overflow-hidden border border-line bg-surface opacity-90 transition-colors hover:border-line2">
      {isStaff && (
        <div className="absolute right-2 top-2 z-10 flex gap-1.5">
          <button
            onClick={onRestore}
            className="border border-line bg-bg/80 px-2 py-1 label backdrop-blur transition-colors hover:text-ink"
          >
            {t('common.restore')}
          </button>
          <button
            onClick={onDelete}
            className="border border-line bg-bg/80 px-2 py-1 label backdrop-blur transition-colors hover:text-accent"
          >
            {t('common.delete')}
          </button>
        </div>
      )}
      <button onClick={onOpen} className="flex flex-1 flex-col text-left">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface2 grayscale">
          {project.cover_url ? (
            <img src={project.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="dotgrid h-full w-full" />
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-[15px] font-medium text-ink">{project.name}</h3>
          {project.description && <p className="mt-1.5 line-clamp-2 text-xs text-faint">{project.description}</p>}
        </div>
      </button>
    </div>
  )
}

export default function Projects() {
  const { isStaff } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([]) // all (active + archived)
  const [workspaces, setWorkspaces] = useState([]) // all (active + archived), created_at asc
  const [grouped, setGrouped] = useState(() => new Set()) // project ids inside any of my workspaces
  const [wsCount, setWsCount] = useState({}) // workspace id -> active project count
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [showWsForm, setShowWsForm] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: projs }, { data: ws }, { data: links }, { data: tix }] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, description, cover_url, created_at, archived')
        .order('created_at', { ascending: false }),
      supabase.from('workspaces').select('*').order('created_at', { ascending: true }),
      supabase.from('workspace_projects').select('workspace_id, project_id'),
      supabase.from('tickets').select('project_id, status'),
    ])

    const list = projs ?? []
    setProjects(list)
    setWorkspaces(ws ?? [])

    const activeIds = new Set(list.filter((p) => !p.archived).map((p) => p.id))
    const g = new Set()
    const wc = {}
    for (const l of links ?? []) {
      g.add(l.project_id)
      if (activeIds.has(l.project_id)) wc[l.workspace_id] = (wc[l.workspace_id] || 0) + 1
    }
    setGrouped(g)
    setWsCount(wc)

    const map = {}
    for (const tk of tix ?? []) {
      const c = (map[tk.project_id] ??= { open: 0, done: 0 })
      if (tk.status === 'done' || tk.status === 'rejected') c.done++
      else c.open++
    }
    setCounts(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function restoreProject(p) {
    await supabase.from('projects').update({ archived: false }).eq('id', p.id)
    load()
  }
  async function deleteProject(p) {
    if (!confirm(t('projects.confirmDelete', { name: p.name }))) return
    await supabase.from('projects').delete().eq('id', p.id)
    load()
  }
  async function restoreWs(w) {
    await supabase.from('workspaces').update({ archived: false }).eq('id', w.id)
    load()
  }
  async function deleteWs(w) {
    if (!confirm(t('workspaces.confirmDelete', { name: w.name }))) return
    await supabase.from('workspaces').delete().eq('id', w.id)
    load()
  }

  const activeWs = workspaces.filter((w) => !w.archived)
  const archivedWs = workspaces.filter((w) => w.archived)
  const ungroupedActive = projects.filter((p) => !p.archived && !grouped.has(p.id))
  const archivedProjects = projects.filter((p) => p.archived)

  const activeEmpty = activeWs.length === 0 && ungroupedActive.length === 0
  const archiveEmpty = archivedWs.length === 0 && archivedProjects.length === 0

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-[1320px] px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="label">{t('projects.catalog')} · MMXXVI</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{t('projects.heading')}</h1>
            <p className="mt-1.5 text-sm text-faint">{isStaff ? t('projects.subAdmin') : t('projects.subClient')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowCalendar(true)} className="btn-ghost flex items-center gap-2">
              <IconCalendar size={15} />
              {t('projects.calendar')}
            </button>
            <button onClick={() => setShowWsForm(true)} className="btn-ghost">
              {t('projects.newWorkspace')}
            </button>
            {isStaff && (
              <button onClick={() => setShowForm(true)} data-tour="new-project" className="btn-solid">
                {t('projects.newProject')}
              </button>
            )}
          </div>
        </div>

        {/* tabs */}
        <div className="mb-8 flex gap-2">
          {['active', 'archive'].map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`border px-3 py-1.5 text-xs transition-colors ${
                tab === k ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
              }`}
            >
              {k === 'active' ? t('projects.tabActive') : t('projects.tabArchive')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-6 w-6" />
          </div>
        ) : tab === 'active' ? (
          activeEmpty ? (
            <EmptyState title={t('projects.emptyTitle')} hint={isStaff ? t('projects.emptyAdmin') : t('projects.emptyClient')}>
              {isStaff && (
                <button onClick={() => setShowForm(true)} className="btn-ghost">
                  {t('projects.newProject')}
                </button>
              )}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {activeWs.map((w) => (
                <WorkspaceCard key={w.id} ws={w} count={wsCount[w.id] || 0} onOpen={() => navigate(`/workspaces/${w.id}`)} />
              ))}
              {ungroupedActive.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  index={i}
                  tour={i === 0 && activeWs.length === 0}
                  counts={counts[p.id]}
                  onOpen={() => navigate(`/projects/${p.id}`)}
                />
              ))}
            </div>
          )
        ) : archiveEmpty ? (
          <EmptyState title={t('projects.emptyArchiveTitle')} hint={t('projects.emptyArchiveHint')} />
        ) : (
          <div className="space-y-10">
            {archivedWs.length > 0 && (
              <section>
                <h2 className="label mb-3">{t('projects.archiveWorkspaces')}</h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedWs.map((w) => (
                    <WorkspaceCard
                      key={w.id}
                      ws={w}
                      count={0}
                      archived
                      onOpen={() => navigate(`/workspaces/${w.id}`)}
                      onRestore={() => restoreWs(w)}
                      onDelete={() => deleteWs(w)}
                    />
                  ))}
                </div>
              </section>
            )}
            {archivedProjects.length > 0 && (
              <section>
                <h2 className="label mb-3">{t('projects.archiveProjects')}</h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedProjects.map((p) => (
                    <ArchiveProjectCard
                      key={p.id}
                      project={p}
                      isStaff={isStaff}
                      onOpen={() => navigate(`/projects/${p.id}`)}
                      onRestore={() => restoreProject(p)}
                      onDelete={() => deleteProject(p)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <ProjectFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={load} />
      {showWsForm && <WorkspaceFormModal open={showWsForm} onClose={() => setShowWsForm(false)} onSaved={load} />}
      {showCalendar && (
        <CalendarModal onClose={() => setShowCalendar(false)} onOpenTicket={(_ticketId, projectId) => navigate(`/projects/${projectId}`)} />
      )}

      {!loading && (
        <Tour
          storageKey={isStaff ? 'projects-admin' : 'projects-client'}
          steps={
            isStaff
              ? [
                  {
                    title: t('tour.projAdmin0Title'),
                    text: t('tour.projAdmin0Text'),
                  },
                  {
                    target: '[data-tour="new-project"]',
                    title: t('tour.projAdmin1Title'),
                    text: t('tour.projAdmin1Text'),
                  },
                  {
                    target: '[data-tour="users"]',
                    title: t('tour.projAdmin2Title'),
                    text: t('tour.projAdmin2Text'),
                  },
                ]
              : [
                  {
                    title: t('tour.projClient0Title'),
                    text: t('tour.projClient0Text'),
                  },
                  ungroupedActive.length > 0 && {
                    target: '[data-tour="project-card"]',
                    title: t('tour.projClient1Title'),
                    text: t('tour.projClient1Text'),
                  },
                ].filter(Boolean)
          }
        />
      )}
    </div>
  )
}
