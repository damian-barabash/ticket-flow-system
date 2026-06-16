import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { Spinner, EmptyState } from '../components/ui'
import { TicketCard } from '../components/TicketCard'
import { CreateTicketModal } from '../components/CreateTicketModal'
import { TicketDrawer } from '../components/TicketDrawer'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { ManageMembersModal } from '../components/ManageMembersModal'
import { ReleasesBlock } from '../components/ReleasesBlock'
import { DeadlinesBlock } from '../components/DeadlinesBlock'
import { isDisplayableImage } from '../lib/files'
import { Tour } from '../components/Tour'
import { STATUS, STATUS_ORDER, PRIORITY_ORDER } from '../lib/constants'

// Compare two version strings, newest first. Numeric segments compared in order
// (1.10 > 1.9); empty/missing versions sink to the bottom; non-numeric → string fallback.
function cmpVersionDesc(av, bv) {
  if (!av && !bv) return 0
  if (!av) return 1
  if (!bv) return -1
  const pa = av.split(/[^\d]+/).filter(Boolean).map(Number)
  const pb = bv.split(/[^\d]+/).filter(Boolean).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0)
    if (d) return d
  }
  return av < bv ? 1 : av > bv ? -1 : 0
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isStaff } = useAuth()
  const { t } = useT()

  // Done tickets live in their own tab, so the active board's status filter omits "done".
  const FILTERS = [
    { key: 'all', label: t('project.filterAll') },
    ...STATUS_ORDER.filter((k) => k !== 'done').map((k) => ({ key: k, label: t('enum.status.' + k), dot: STATUS[k].dot })),
  ]

  const [project, setProject] = useState(null)
  const [tickets, setTickets] = useState([])
  const [reads, setReads] = useState({})
  const [counts, setCounts] = useState({})
  const [creators, setCreators] = useState({})
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState('active') // active | done
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [versionFilter, setVersionFilter] = useState('all') // done tab + version sort: pin to one fixed_version
  const [query, setQuery] = useState('')
  const [openTicket, setOpenTicket] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  // "By version" only makes sense on the Done tab (fixed_version). Available to admin & client.
  const SORTS = [
    { key: 'recent', label: t('project.sortRecent') },
    { key: 'priority', label: t('project.sortPriority') },
    ...(tab === 'done' ? [{ key: 'version', label: t('project.sortVersion') }] : []),
  ]

  const load = useCallback(async () => {
    const [{ data: proj }, { data: tix }, { data: rd }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('tickets').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('ticket_reads').select('ticket_id, last_read_at'),
    ])
    setProject(proj)
    const list = tix ?? []
    setTickets(list)
    const rmap = {}
    ;(rd ?? []).forEach((r) => (rmap[r.ticket_id] = r.last_read_at))
    setReads(rmap)

    const ids = list.map((t) => t.id)
    if (ids.length) {
      const [{ data: cm }, { data: profs }, { data: at }] = await Promise.all([
        supabase.from('ticket_comments').select('ticket_id').in('ticket_id', ids),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', [...new Set(list.map((t) => t.created_by).filter(Boolean))]),
        // ticket-level photos for card previews
        supabase.from('attachments').select('ticket_id, path, name, content_type').is('comment_id', null).in('ticket_id', ids).order('created_at'),
      ])
      const cc = {}
      ;(cm ?? []).forEach((c) => (cc[c.ticket_id] = (cc[c.ticket_id] || 0) + 1))
      setCounts(cc)
      const cr = {}
      ;(profs ?? []).forEach((p) => (cr[p.id] = p))
      setCreators(cr)

      // keep first 2 browser-renderable photos per ticket, batch-sign them (ticket-media is private)
      const firstTwo = {}
      ;(at ?? []).forEach((a) => {
        if (!a.path || !isDisplayableImage(a)) return
        const arr = firstTwo[a.ticket_id] || (firstTwo[a.ticket_id] = [])
        if (arr.length < 2) arr.push(a.path)
      })
      const allPaths = Object.values(firstTwo).flat()
      const signed = {}
      if (allPaths.length) {
        const { data: urls } = await supabase.storage.from('ticket-media').createSignedUrls(allPaths, 3600)
        ;(urls ?? []).forEach((u) => u.path && (signed[u.path] = u.signedUrl))
      }
      const pmap = {}
      Object.entries(firstTwo).forEach(([tid, paths]) => {
        const arr = paths.map((p) => signed[p]).filter(Boolean)
        if (arr.length) pmap[tid] = arr
      })
      setPhotos(pmap)
    } else {
      setCounts({})
      setCreators({})
      setPhotos({})
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
    const ch = supabase
      .channel(`project-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `project_id=eq.${id}` }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [id, load])

  const stat = useMemo(() => {
    const o = { new: 0, in_progress: 0, on_hold: 0, done: 0, rejected: 0 }
    tickets.forEach((t) => (o[t.status] = (o[t.status] || 0) + 1))
    return o
  }, [tickets])

  const tabCounts = useMemo(() => {
    let done = 0
    tickets.forEach((t) => t.status === 'done' && done++)
    return { done, active: tickets.length - done }
  }, [tickets])

  // distinct fixed_version values among done tickets (newest first) → version-filter chips
  const doneVersions = useMemo(() => {
    const set = new Set()
    let hasNone = false
    tickets.forEach((t) => {
      if (t.status !== 'done') return
      if (t.fixed_version) set.add(t.fixed_version)
      else hasNone = true
    })
    return { list: [...set].sort(cmpVersionDesc), hasNone }
  }, [tickets])

  // version filter only lives alongside the version sort on the Done tab; reset it otherwise
  function changeSort(key) {
    setSort(key)
    if (key !== 'version') setVersionFilter('all')
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rank = (p) => PRIORITY_ORDER.indexOf(p) // low=0 … urgent=3
    return tickets
      .filter((t) => {
        // tab split: done tickets are tucked away in their own tab
        if (tab === 'done' ? t.status !== 'done' : t.status === 'done') return false
        if (tab === 'active' && filter !== 'all' && t.status !== filter) return false
        // done tab, version sort: optionally pin to a single fixed_version
        if (tab === 'done' && sort === 'version' && versionFilter !== 'all') {
          if (versionFilter === '__none__' ? t.fixed_version : t.fixed_version !== versionFilter) return false
        }
        if (q && !(`${t.title} ${t.description || ''}`.toLowerCase().includes(q) || String(t.number).includes(q)))
          return false
        return true
      })
      .sort((a, b) => {
        // clients: active admin-assigned tasks are pinned to the very top
        if (!isStaff) {
          const at = a.is_task && a.status !== 'done' ? 1 : 0
          const bt = b.is_task && b.status !== 'done' ? 1 : 0
          if (at !== bt) return bt - at
        }
        if (sort === 'version') {
          const d = cmpVersionDesc(a.fixed_version, b.fixed_version)
          if (d) return d
        }
        if (sort === 'priority') {
          const d = rank(b.priority) - rank(a.priority)
          if (d) return d
        }
        // tie-break / default: newest first
        return new Date(b.created_at) - new Date(a.created_at)
      })
  }, [tickets, tab, filter, sort, versionFilter, query, isStaff])

  function isUnread(t) {
    const r = reads[t.id]
    return !r || new Date(r) < new Date(t.updated_at)
  }

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
        <button onClick={() => navigate('/projects')} className="label mb-5 hover:text-ink transition-colors">
          {t('common.toProjects')}
        </button>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !project ? (
          <EmptyState title={t('project.notFound')} />
        ) : (
          <>
            {/* header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-4">
                {project.cover_url && (
                  <div className="hidden h-16 w-24 shrink-0 overflow-hidden border border-line sm:block">
                    <img src={project.cover_url} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div>
                  <span className="label">{t('project.label')} · MMXXVI</span>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{project.name}</h1>
                  {project.description && <p className="mt-1 max-w-lg text-sm text-faint">{project.description}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isStaff && (
                  <>
                    <button onClick={() => setShowMembers(true)} className="btn-ghost" data-tour="members">
                      {t('project.members')}
                    </button>
                    <button onClick={() => setShowEdit(true)} className="btn-ghost">
                      {t('project.edit')}
                    </button>
                  </>
                )}
                <button onClick={() => setShowCreate(true)} className="btn-solid" data-tour="new-ticket">
                  {t('project.newTicket')}
                </button>
              </div>
            </div>

            {/* goals & deadlines (legendary block) */}
            <DeadlinesBlock projectId={id} />

            {/* project releases (files + links) */}
            <ReleasesBlock projectId={id} />

            {/* stat chips */}
            <div className="mb-5 flex flex-wrap gap-2">
              {STATUS_ORDER.map((k) => (
                <span key={k} className="flex items-center gap-1.5 border border-line px-3 py-1.5">
                  <span className="inline-block h-1.5 w-1.5" style={{ background: STATUS[k].dot }} />
                  <span className="label-sm">{t('enum.status.' + k)}</span>
                  <span className="font-mono text-[11px] text-ink">{stat[k] || 0}</span>
                </span>
              ))}
            </div>

            {/* active / done tabs */}
            <div className="mb-5 flex gap-6 border-b border-line">
              {[
                { key: 'active', label: t('project.tabActive'), n: tabCounts.active },
                { key: 'done', label: t('project.tabDone'), n: tabCounts.done },
              ].map((tabItem) => (
                <button
                  key={tabItem.key}
                  onClick={() => {
                    setTab(tabItem.key)
                    setFilter('all')
                    setVersionFilter('all')
                    if (tabItem.key !== 'done' && sort === 'version') setSort('recent')
                  }}
                  className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 font-mono uppercase tracking-label text-[11px] transition-colors ${
                    tab === tabItem.key ? 'border-accent text-ink' : 'border-transparent text-faint hover:text-muted'
                  }`}
                >
                  {tabItem.label}
                  <span
                    className={`font-mono text-[10px] ${tab === tabItem.key ? 'text-accent' : 'text-faint'}`}
                  >
                    {tabItem.n}
                  </span>
                </button>
              ))}
            </div>

            {/* toolbar */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              {tab === 'active' ? (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`flex shrink-0 items-center gap-1.5 border px-3 py-1.5 font-mono uppercase tracking-label text-[10px] transition-colors ${
                        filter === f.key ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
                      }`}
                    >
                      {f.dot && <span className="inline-block h-1.5 w-1.5" style={{ background: f.dot }} />}
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : tab === 'done' && sort === 'version' && (doneVersions.list.length > 0 || doneVersions.hasNone) ? (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {[
                    { key: 'all', label: t('project.filterAll') },
                    ...doneVersions.list.map((v) => ({ key: v, label: v })),
                    ...(doneVersions.hasNone ? [{ key: '__none__', label: t('ticket.noVersion') }] : []),
                  ].map((vf) => (
                    <button
                      key={vf.key}
                      onClick={() => setVersionFilter(vf.key)}
                      className={`flex shrink-0 items-center gap-1.5 border px-3 py-1.5 font-mono uppercase tracking-label text-[10px] transition-colors ${
                        versionFilter === vf.key ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
                      }`}
                    >
                      {vf.key !== 'all' && vf.key !== '__none__' && <span className="text-[#3FB950]">✓</span>}
                      {vf.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="label hidden sm:inline">{t('project.sort')}</span>
                <div className="flex gap-1.5">
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => changeSort(s.key)}
                      className={`shrink-0 border px-3 py-1.5 font-mono uppercase tracking-label text-[10px] transition-colors ${
                        sort === s.key ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="field w-full sm:w-44"
                />
              </div>
            </div>

            {/* list */}
            {visible.length === 0 ? (
              <EmptyState
                title={
                  tab === 'done'
                    ? t('project.emptyDoneTitle')
                    : tickets.length === 0
                    ? t('project.emptyNoneTitle')
                    : t('project.emptySearchTitle')
                }
                hint={
                  tab === 'done'
                    ? t('project.emptyDoneHint')
                    : tickets.length === 0
                    ? t('project.emptyNoneHint')
                    : t('project.emptySearchHint')
                }
              >
                {tab === 'active' && tickets.length === 0 && (
                  <button onClick={() => setShowCreate(true)} className="btn-ghost">
                    {t('project.newTicket')}
                  </button>
                )}
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {visible.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    unread={isUnread(t)}
                    commentCount={counts[t.id] || 0}
                    creator={creators[t.created_by]}
                    photos={photos[t.id]}
                    onOpen={() => setOpenTicket(t.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showCreate && (
        <CreateTicketModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          projectId={id}
          onCreated={load}
        />
      )}
      {openTicket && (
        <TicketDrawer
          ticketId={openTicket}
          onClose={() => {
            setOpenTicket(null)
            load()
          }}
          onChanged={load}
        />
      )}
      {isStaff && showEdit && (
        <ProjectFormModal open={showEdit} onClose={() => setShowEdit(false)} project={project} onSaved={load} />
      )}
      {isStaff && showMembers && (
        <ManageMembersModal open={showMembers} onClose={() => setShowMembers(false)} projectId={id} />
      )}

      {!loading && project && (
        <Tour
          storageKey="ticket-board"
          steps={[
            {
              target: '[data-tour="new-ticket"]',
              title: t('tour.boardTitle'),
              text: t('tour.boardText'),
            },
          ]}
        />
      )}
    </div>
  )
}
