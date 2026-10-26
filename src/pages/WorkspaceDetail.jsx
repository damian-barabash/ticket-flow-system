import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { EmptyState, ErrorState, Icon, useConfirm, useToast } from '../components/ui'
import { WorkspaceFormModal } from '../components/WorkspaceFormModal'
import { AddProjectsModal } from '../components/AddProjectsModal'
import { ProjectCard, GridSkeleton, PageHeader } from './Projects'
import { useChatUnread } from '../lib/chat'
import { errText } from '../lib/errors'

export default function WorkspaceDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { counts: chatCounts } = useChatUnread()
  const [data, setData] = useState(null) // { ws, projects, available, stats }
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const req = useRef(0)

  const load = useCallback(async () => {
    const my = ++req.current
    // one round-trip: everything in parallel
    const [w, myWs, links, projs, stats] = await Promise.all([
      supabase.from('workspaces').select('*').eq('id', id).maybeSingle(),
      supabase.from('workspaces').select('id'),
      supabase.from('workspace_projects').select('workspace_id, project_id'),
      supabase.from('projects').select('id, name, description, cover_url, created_at, archived').eq('archived', false).order('created_at', { ascending: false }),
      supabase.rpc('project_stats'),
    ])
    if (my !== req.current) return
    const err = w.error || myWs.error || links.error || projs.error
    if (err) {
      setError(err)
      return
    }
    setError(null)
    if (!w.data) {
      setMissing(true)
      return
    }
    const mine = new Set((myWs.data ?? []).map((x) => x.id))
    const grouped = new Set()
    const here = new Set()
    for (const l of links.data ?? []) {
      if (mine.has(l.workspace_id)) grouped.add(l.project_id)
      if (l.workspace_id === id) here.add(l.project_id)
    }
    const active = projs.data ?? []
    const st = {}
    ;(stats.data ?? []).forEach((r) => {
      st[r.project_id] = { open: Number(r.open), done: Number(r.done), unread: Number(r.unread), overdue: Number(r.overdue) }
    })
    setData({
      ws: w.data,
      projects: active.filter((p) => here.has(p.id)),
      available: active.filter((p) => !grouped.has(p.id)),
      stats: st,
    })
  }, [id])

  useEffect(() => {
    setData(null)
    setMissing(false)
    load()
  }, [load])

  async function removeProject(p) {
    const ok = await confirm({ title: t('panel.removeFromWs'), body: t('workspaces.confirmRemove'), confirmLabel: t('panel.remove') })
    if (!ok) return
    const before = data
    setData((d) => ({ ...d, projects: d.projects.filter((x) => x.id !== p.id), available: [p, ...d.available] }))
    const { error: e } = await supabase.from('workspace_projects').delete().eq('workspace_id', id).eq('project_id', p.id)
    if (e) {
      setData(before)
      toast.show(errText(t, e), { tone: 'error' })
    }
  }

  async function archiveWs() {
    const ok = await confirm({ title: t('workspaces.archive'), body: t('workspaces.confirmArchive'), confirmLabel: t('workspaces.archive') })
    if (!ok) return
    const { error: e } = await supabase.from('workspaces').update({ archived: true }).eq('id', id)
    if (e) return toast.show(errText(t, e), { tone: 'error' })
    toast.show(t('panel.archived', { name: data?.ws?.name }))
    navigate('/projects')
  }

  async function deleteWs() {
    const ok = await confirm({ title: t('workspaces.delete'), body: t('workspaces.confirmDelete', { name: data?.ws?.name }), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    const { error: e } = await supabase.from('workspaces').delete().eq('id', id)
    if (e) return toast.show(errText(t, e), { tone: 'error' })
    toast.show(t('panel.deleted', { name: data?.ws?.name }))
    navigate('/projects')
  }

  const openProject = useCallback((pid) => navigate(`/projects/${pid}`), [navigate])
  const crumbs = useMemo(() => (data?.ws ? [{ label: data.ws.name }] : []), [data?.ws])

  return (
    <div className="min-h-screen bg-bg">
      <TopBar crumbs={crumbs} />
      <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {error && !data ? (
          <ErrorState message={errText(t, error, 'common.loadError')} onRetry={load} onClose={() => navigate('/projects')} closeLabel={t('common.toProjects')} />
        ) : missing ? (
          <EmptyState icon="layers" title={t('workspaces.notFound')}>
            <button onClick={() => navigate('/projects')} className="btn-ghost">
              <Icon name="arrowLeft" size={16} /> {t('common.toProjects')}
            </button>
          </EmptyState>
        ) : !data ? (
          <GridSkeleton n={3} />
        ) : (
          <>
            <PageHeader tag={`${t('workspaces.label')} · ${t('workspaces.private')}`} title={data.ws.name} sub={t('workspaces.count', { n: data.projects.length })}>
              <button onClick={() => setShowEdit(true)} className="btn-ghost btn-sm">
                <Icon name="pencil" size={16} /> {t('common.edit')}
              </button>
              <button onClick={archiveWs} className="btn-ghost btn-sm">
                <Icon name="archive" size={16} /> {t('workspaces.archive')}
              </button>
              <button onClick={deleteWs} className="btn-danger btn-sm">
                <Icon name="trash" size={16} /> {t('common.delete')}
              </button>
              <button onClick={() => setShowAdd(true)} className="btn-accent btn-sm">
                <Icon name="plus" size={16} /> {t('workspaces.addProjects')}
              </button>
            </PageHeader>

            {data.projects.length === 0 ? (
              <EmptyState icon="layers" title={t('workspaces.empty')} hint={t('workspaces.emptyHint')}>
                <button onClick={() => setShowAdd(true)} className="btn-accent">
                  <Icon name="plus" size={16} /> {t('workspaces.addProjects')}
                </button>
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
                {data.projects.map((p, i) => (
                  <div key={p.id} className="relative flex flex-col">
                    <ProjectCard project={p} index={i} stats={data.stats[p.id]} chat={chatCounts?.[p.id] || 0} onOpen={openProject} />
                    <button
                      onClick={() => removeProject(p)}
                      className="press flex h-10 items-center justify-center gap-2 border border-t-0 border-line text-[12px] font-semibold uppercase tracking-[0.06em] text-muted transition-colors hover:bg-surface2 hover:text-accent"
                    >
                      <Icon name="minus" size={15} /> {t('panel.removeFromWs')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showEdit && data?.ws && (
        <WorkspaceFormModal
          open
          workspace={data.ws}
          onClose={() => setShowEdit(false)}
          onSaved={(row) => row && setData((d) => ({ ...d, ws: row }))}
        />
      )}
      {showAdd && data?.ws && <AddProjectsModal open workspaceId={id} available={data.available} onClose={() => setShowAdd(false)} onSaved={load} />}
    </div>
  )
}
