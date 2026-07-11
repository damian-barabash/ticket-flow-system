import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { Spinner, EmptyState, IconTrash } from '../components/ui'
import { WorkspaceFormModal } from '../components/WorkspaceFormModal'
import { AddProjectsModal } from '../components/AddProjectsModal'

// A workspace-scoped project grid card with a "remove from workspace" control.
// The card is a <div> (not a <button>) so the remove button can be a sibling.
function WsProjectCard({ project, counts, onOpen, onRemove }) {
  const { t } = useT()
  const open = counts?.open ?? 0
  const done = counts?.done ?? 0
  return (
    <div className="group relative flex flex-col overflow-hidden border border-line bg-surface transition-colors hover:border-line2">
      <button
        onClick={onRemove}
        title={t('workspaces.removeProject')}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center border border-line bg-bg/80 text-faint backdrop-blur transition-colors hover:border-accent/50 hover:text-accent"
      >
        <IconTrash size={14} />
      </button>
      <button onClick={onOpen} className="flex flex-1 flex-col text-left">
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
    </div>
  )
}

export default function WorkspaceDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const [ws, setWs] = useState(null)
  const [projects, setProjects] = useState([])
  const [counts, setCounts] = useState({})
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // Workspace row — RLS returns it only to its creator.
    const { data: wsRow } = await supabase.from('workspaces').select('*').eq('id', id).maybeSingle()
    if (!wsRow) {
      setWs(null)
      setLoading(false)
      return
    }
    setWs(wsRow)

    // Links across ALL my workspaces → this workspace's projects + globally grouped set.
    const { data: myWs } = await supabase.from('workspaces').select('id')
    const myWsIds = new Set((myWs ?? []).map((w) => w.id))
    const { data: links } = await supabase.from('workspace_projects').select('workspace_id, project_id')
    const grouped = new Set()
    const hereIds = []
    for (const l of links ?? []) {
      if (myWsIds.has(l.workspace_id)) grouped.add(l.project_id)
      if (l.workspace_id === id) hereIds.push(l.project_id)
    }

    const { data: projs } = await supabase
      .from('projects')
      .select('id, name, description, cover_url, created_at, archived')
      .eq('archived', false)
    const active = projs ?? []
    setProjects(active.filter((p) => hereIds.includes(p.id)))
    // Available to add: active projects not already grouped into any of my workspaces.
    setAvailable(active.filter((p) => !grouped.has(p.id)))

    const { data: tix } = await supabase.from('tickets').select('project_id, status')
    const map = {}
    for (const tk of tix ?? []) {
      const c = (map[tk.project_id] ??= { open: 0, done: 0 })
      if (tk.status === 'done' || tk.status === 'rejected') c.done++
      else c.open++
    }
    setCounts(map)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function removeProject(p) {
    if (!confirm(t('workspaces.confirmRemove'))) return
    setProjects((xs) => xs.filter((x) => x.id !== p.id))
    const { error } = await supabase.from('workspace_projects').delete().eq('workspace_id', id).eq('project_id', p.id)
    if (error) load()
    else load()
  }

  async function archiveWs() {
    if (!confirm(t('workspaces.confirmArchive'))) return
    await supabase.from('workspaces').update({ archived: true }).eq('id', id)
    navigate('/projects')
  }

  async function deleteWs() {
    if (!confirm(t('workspaces.confirmDelete', { name: ws?.name }))) return
    // Cascade removes workspace_projects links → projects return to the main screen.
    await supabase.from('workspaces').delete().eq('id', id)
    navigate('/projects')
  }

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-[1320px] px-6 py-10">
        <button onClick={() => navigate('/projects')} className="label mb-5 hover:text-ink transition-colors">
          {t('common.toProjects')}
        </button>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !ws ? (
          <EmptyState title={t('workspaces.notFound')} />
        ) : (
          <>
            <div className="mb-9 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="label text-accent">{t('workspaces.label')} · {t('workspaces.private')}</span>
                <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight text-ink">
                  {ws.name}
                </h1>
                <p className="mt-1.5 text-sm text-faint">{t('workspaces.count', { n: projects.length })}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowEdit(true)} className="btn-ghost">
                  {t('common.edit')}
                </button>
                <button onClick={archiveWs} className="btn-ghost">
                  {t('workspaces.archive')}
                </button>
                <button onClick={deleteWs} className="btn-ghost text-faint hover:text-accent">
                  {t('workspaces.delete')}
                </button>
                <button onClick={() => setShowAdd(true)} className="btn-solid">
                  {t('workspaces.addProjects')}
                </button>
              </div>
            </div>

            {projects.length === 0 ? (
              <EmptyState title={t('workspaces.empty')} hint={t('workspaces.emptyHint')}>
                <button onClick={() => setShowAdd(true)} className="btn-ghost">
                  {t('workspaces.addProjects')}
                </button>
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <WsProjectCard
                    key={p.id}
                    project={p}
                    counts={counts[p.id]}
                    onOpen={() => navigate(`/projects/${p.id}`)}
                    onRemove={() => removeProject(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showEdit && ws && (
        <WorkspaceFormModal open={showEdit} workspace={ws} onClose={() => setShowEdit(false)} onSaved={load} />
      )}
      {showAdd && ws && (
        <AddProjectsModal
          open={showAdd}
          workspaceId={id}
          available={available}
          onClose={() => setShowAdd(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
