import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { CountBadge, EmptyState, ErrorState, Icon, Segmented, Skeleton, useConfirm, useToast } from '../components/ui'
import { TicketCard, TicketCardSkeleton, ticketNo } from '../components/TicketCard'
import { TicketDrawer } from '../components/TicketDrawer'
import { ReleasesBlock } from '../components/ReleasesBlock'
import { DeadlinesBlock } from '../components/DeadlinesBlock'
import { Tour } from '../components/Tour'
import { isDisplayableImage } from '../lib/files'
import { STATUS, STATUS_ORDER, PRIORITY_ORDER } from '../lib/constants'
import { daysUntil } from '../lib/format'
import { notify } from '../lib/notify'
import { signUrls } from '../lib/signed'
import { channelName, inChunks, useDebounced } from '../lib/realtime'
import { errText } from '../lib/errors'
import { useMediaQuery } from '../lib/hooks'
import { useChatUnread } from '../lib/chat'
import { assignTicket, usePeople } from '../components/AssigneePicker'
import { loadCalendar, prefetch } from '../lib/prefetch'

const CreateTicketModal = lazy(() => import('../components/CreateTicketModal').then((m) => ({ default: m.CreateTicketModal })))
const ProjectFormModal = lazy(() => import('../components/ProjectFormModal').then((m) => ({ default: m.ProjectFormModal })))
const ManageMembersModal = lazy(() => import('../components/ManageMembersModal').then((m) => ({ default: m.ManageMembersModal })))
const ProjectChat = lazy(() => import('../components/chat/ProjectChat').then((m) => ({ default: m.ProjectChat })))

const PAGE = 200
const CLOSED = ['done', 'rejected']
const isClosed = (s) => CLOSED.includes(s)

// Compare two version strings, newest first.
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

// Board snapshot per project → revisiting a project paints instantly.
const boardCache = new Map()

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const { user, isStaff } = useAuth()
  const { t } = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const wide = useMediaQuery('(min-width: 1100px)')
  const { counts: chatCounts } = useChatUnread()
  const { byId: people } = usePeople(id)

  const cached = boardCache.get(id)
  const [project, setProject] = useState(cached?.project ?? null)
  const [tickets, setTickets] = useState(cached?.tickets ?? [])
  const [closedTotal, setClosedTotal] = useState(cached?.closedTotal ?? 0)
  const [closedLoaded, setClosedLoaded] = useState(cached?.closedLoaded ?? 0)
  const [counts, setCounts] = useState(cached?.counts ?? {})
  const [reads, setReads] = useState(cached?.reads ?? {})
  const [photos, setPhotos] = useState(cached?.photos ?? {})
  const [ready, setReady] = useState(!!cached)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [tab, setTab] = useState('active') // active | done
  const [filter, setFilter] = useState('all') // status (active) or kind (done)
  const [who, setWho] = useState('all') // all | mine | created
  const [sort, setSort] = useState('recent')
  const [versionFilter, setVersionFilter] = useState('all')
  const [query, setQuery] = useState('')
  const dq = useDeferredValue(query)
  const [leaving, setLeaving] = useState(() => new Set())
  const [bump, setBump] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  const openId = sp.get('ticket')
  const chatOpen = sp.get('chat') === '1'

  const req = useRef(0)
  const ticketsRef = useRef(tickets)
  ticketsRef.current = tickets
  const touched = useRef({}) // tid → ts of my last mutation (to keep my own changes "read")
  const pushed = useRef({ ticket: false, chat: false })

  // keep the snapshot fresh
  useEffect(() => {
    if (ready && project) boardCache.set(id, { project, tickets, closedTotal, closedLoaded, counts, reads, photos })
  }, [id, ready, project, tickets, closedTotal, closedLoaded, counts, reads, photos])

  // ── side data (counts, reads, photos) — never blocks the board ─────────────
  const loadPhotos = useCallback(async (ids) => {
    if (!ids.length) return
    const { data } = await inChunks(ids, 120, (c) =>
      supabase.from('attachments').select('ticket_id, path, name, content_type').is('comment_id', null).in('ticket_id', c).order('created_at'),
    )
    const first = {}
    data.forEach((a) => {
      if (!a.path || !isDisplayableImage(a)) return
      const arr = (first[a.ticket_id] ||= [])
      if (arr.length < 3) arr.push(a.path)
    })
    const signed = await signUrls('ticket-media', Object.values(first).flat())
    const map = {}
    ids.forEach((tid) => {
      const arr = (first[tid] || []).map((p) => signed[p]).filter(Boolean)
      map[tid] = arr.length ? arr : undefined
    })
    setPhotos((p) => ({ ...p, ...map }))
  }, [])

  const loadSide = useCallback(
    async (list, my) => {
      const ids = list.map((x) => x.id)
      const [cc, rd] = await Promise.all([
        supabase.rpc('ticket_comment_counts', { p_project: id }),
        inChunks(ids, 150, (c) => supabase.from('ticket_reads').select('ticket_id, last_read_at').eq('user_id', user.id).in('ticket_id', c)),
      ])
      if (my !== req.current) return
      if (!cc.error) {
        const m = {}
        ;(cc.data ?? []).forEach((r) => (m[r.ticket_id] = Number(r.comments)))
        setCounts(m)
      }
      if (!rd.error) {
        const m = {}
        rd.data.forEach((r) => (m[r.ticket_id] = r.last_read_at))
        setReads(m)
      }
      loadPhotos(ids)
    },
    [id, user.id, loadPhotos],
  )

  const load = useCallback(async () => {
    const my = ++req.current
    const [pr, act, cls] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('tickets').select('*').eq('project_id', id).not('status', 'in', '(done,rejected)').order('created_at', { ascending: false }).limit(500),
      supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .eq('project_id', id)
        .in('status', CLOSED)
        .order('updated_at', { ascending: false })
        .range(0, PAGE - 1),
    ])
    if (my !== req.current) return
    const err = pr.error || act.error || cls.error
    if (err) {
      setError(err)
      return
    }
    setError(null)
    if (!pr.data) {
      setNotFound(true)
      setReady(true)
      return
    }
    setNotFound(false)
    setProject(pr.data)
    const list = [...(act.data ?? []), ...(cls.data ?? [])]
    // keep tickets fetched by a deep link that are outside the first page
    setTickets((cur) => {
      const ids = new Set(list.map((x) => x.id))
      return [...list, ...cur.filter((x) => !ids.has(x.id) && x.project_id === id && isClosed(x.status))]
    })
    setClosedTotal(cls.count ?? (cls.data ?? []).length)
    setClosedLoaded((cls.data ?? []).length)
    setReady(true)
    loadSide(list, my)
  }, [id, loadSide])

  async function loadMoreClosed() {
    setLoadingMore(true)
    const { data, error: e } = await supabase
      .from('tickets')
      .select('*')
      .eq('project_id', id)
      .in('status', CLOSED)
      .order('updated_at', { ascending: false })
      .range(closedLoaded, closedLoaded + PAGE - 1)
    setLoadingMore(false)
    if (e) return toast.show(errText(t, e), { tone: 'error' })
    setTickets((cur) => {
      const have = new Set(cur.map((x) => x.id))
      return [...cur, ...(data ?? []).filter((x) => !have.has(x.id))]
    })
    setClosedLoaded((n) => n + (data ?? []).length)
    loadPhotos((data ?? []).map((x) => x.id))
  }

  const markRead = useCallback(
    (tid, updatedAt) => {
      const tk = ticketsRef.current.find((x) => x.id === tid)
      const base = Date.parse(updatedAt || tk?.updated_at || 0) || 0
      const ts = new Date(Math.max(Date.now(), base + 1)).toISOString()
      setReads((r) => ({ ...r, [tid]: ts }))
      supabase
        .from('ticket_reads')
        .upsert({ ticket_id: tid, user_id: user.id, last_read_at: ts })
        .then(({ error: e }) => e && console.warn('[reads]', e))
    },
    [user.id],
  )

  const refreshCounts = useDebounced(async () => {
    const { data, error: e } = await supabase.rpc('ticket_comment_counts', { p_project: id })
    if (e) return
    const m = {}
    ;(data ?? []).forEach((r) => (m[r.ticket_id] = Number(r.comments)))
    setCounts(m)
  }, 400)

  const photoTimers = useRef({})
  const photosLater = useCallback(
    (tid, ms = 2500) => {
      clearTimeout(photoTimers.current[tid])
      photoTimers.current[tid] = setTimeout(() => loadPhotos([tid]), ms)
    },
    [loadPhotos],
  )
  useEffect(() => () => Object.values(photoTimers.current).forEach(clearTimeout), [])

  // ── initial load + realtime (patch from payload) ──────────────────────────
  useEffect(() => {
    const c = boardCache.get(id)
    if (!c) {
      setReady(false)
      setProject(null)
      setTickets([])
      setCounts({})
      setReads({})
      setPhotos({})
    }
    load()
    const ch = supabase
      .channel(channelName(`project-${id}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets', filter: `project_id=eq.${id}` }, ({ new: row }) => {
        if (ticketsRef.current.some((x) => x.id === row.id)) return
        setTickets((xs) => (xs.some((x) => x.id === row.id) ? xs : [row, ...xs]))
        if (isClosed(row.status)) setClosedTotal((n) => n + 1)
        photosLater(row.id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `project_id=eq.${id}` }, ({ new: row }) => {
        const cur = ticketsRef.current.find((x) => x.id === row.id)
        if (!cur) {
          // e.g. a closed ticket beyond the loaded page was reopened
          if (!isClosed(row.status)) {
            setTickets((xs) => (xs.some((x) => x.id === row.id) ? xs : [row, ...xs]))
            setClosedTotal((n) => Math.max(0, n - 1))
          }
          return
        }
        if (isClosed(cur.status) !== isClosed(row.status)) setClosedTotal((n) => Math.max(0, n + (isClosed(row.status) ? 1 : -1)))
        setTickets((xs) => xs.map((x) => (x.id === row.id ? { ...x, ...row } : x)))
        if (touched.current[row.id] > Date.now() - 8000) markRead(row.id, row.updated_at)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tickets' }, ({ old }) => {
        const gone = ticketsRef.current.find((x) => x.id === old.id)
        if (!gone) return
        if (isClosed(gone.status)) setClosedTotal((n) => Math.max(0, n - 1))
        setTickets((xs) => xs.filter((x) => x.id !== old.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments' }, ({ new: c }) => {
        if (!ticketsRef.current.some((x) => x.id === c.ticket_id)) return
        setCounts((m) => ({ ...m, [c.ticket_id]: (m[c.ticket_id] || 0) + 1 }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ticket_comments' }, () => refreshCounts())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // a ticket opened by deep link was deleted / doesn't belong here
  useEffect(() => {
    if (!openId) pushed.current.ticket = false
  }, [openId])
  useEffect(() => {
    if (!chatOpen) pushed.current.chat = false
  }, [chatOpen])

  // ── navigation helpers (drawer + chat live in the URL) ──────────────────────
  const openTicket = useCallback(
    (tid) => {
      setSp(
        (p) => {
          const n = new URLSearchParams(p)
          n.set('ticket', tid)
          return n
        },
        { replace: !!sp.get('ticket') },
      )
      pushed.current.ticket = true
    },
    [setSp, sp],
  )
  const closeDrawer = useCallback(() => {
    if (pushed.current.ticket) {
      pushed.current.ticket = false
      navigate(-1)
    } else {
      setSp(
        (p) => {
          const n = new URLSearchParams(p)
          n.delete('ticket')
          return n
        },
        { replace: true },
      )
    }
  }, [navigate, setSp])
  const openChat = useCallback(() => {
    setSp((p) => {
      const n = new URLSearchParams(p)
      n.set('chat', '1')
      return n
    })
    pushed.current.chat = true
  }, [setSp])
  const closeChat = useCallback(() => {
    if (pushed.current.chat && !openId) {
      pushed.current.chat = false
      navigate(-1)
    } else {
      setSp(
        (p) => {
          const n = new URLSearchParams(p)
          n.delete('chat')
          return n
        },
        { replace: true },
      )
    }
  }, [navigate, setSp, openId])

  // ── mutations (optimistic, rollback + toast on error) ──────────────────────
  const patchLocal = useCallback((tid, patch) => {
    setTickets((xs) => xs.map((x) => (x.id === tid ? { ...x, ...patch } : x)))
  }, [])

  const mutate = useCallback(
    async (tid, patch, opts = {}) => {
      const cur = ticketsRef.current.find((x) => x.id === tid)
      if (!cur) return false
      const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k]]))
      const flips = 'status' in patch && isClosed(cur.status) !== isClosed(patch.status)
      patchLocal(tid, patch)
      if (flips) setClosedTotal((n) => Math.max(0, n + (isClosed(patch.status) ? 1 : -1)))
      touched.current[tid] = Date.now()
      const { error: e } = await supabase.from('tickets').update(patch).eq('id', tid)
      if (e) {
        patchLocal(tid, prev)
        if (flips) setClosedTotal((n) => Math.max(0, n + (isClosed(patch.status) ? -1 : 1)))
        toast.show(errText(t, e), { tone: 'error' })
        return false
      }
      if ('status' in patch && opts.notify !== false) notify('status_changed', tid, { status: patch.status })
      markRead(tid)
      return true
    },
    [patchLocal, markRead, toast, t],
  )

  // UX rule: done/rejected → close the drawer, card flies out, toast with Undo + Open.
  const closeFlow = useCallback(
    (tid, patch) => {
      const cur = ticketsRef.current.find((x) => x.id === tid)
      if (!cur) return
      const prev = { status: cur.status, ...('fixed_version' in patch ? { fixed_version: cur.fixed_version } : {}) }
      closeDrawer()
      setLeaving((s) => new Set(s).add(tid))
      setTimeout(() => {
        setLeaving((s) => {
          const n = new Set(s)
          n.delete(tid)
          return n
        })
        setBump((b) => b + 1)
      }, 280)
      mutate(tid, patch)
      toast.show(t('panel.movedTo', { no: ticketNo(cur.number), status: t('enum.status.' + patch.status) }), {
        actions: [
          { label: t('common.undo'), onClick: () => mutate(tid, prev) },
          { label: t('common.open'), onClick: () => openTicket(tid) },
        ],
      })
    },
    [closeDrawer, mutate, toast, t, openTicket],
  )

  const assign = useCallback(
    async (tid, userId) => {
      const cur = ticketsRef.current.find((x) => x.id === tid)
      if (!cur || (cur.assigned_to || null) === (userId || null)) return
      const prev = cur.assigned_to ?? null
      patchLocal(tid, { assigned_to: userId || null })
      touched.current[tid] = Date.now()
      try {
        const r = await assignTicket(tid, userId || null)
        if (r?.error) throw r.error
      } catch (e) {
        patchLocal(tid, { assigned_to: prev })
        toast.show(errText(t, e), { tone: 'error' })
      }
    },
    [patchLocal, toast, t],
  )

  const removeTicket = useCallback(
    async (tid, paths = []) => {
      const cur = ticketsRef.current.find((x) => x.id === tid)
      closeDrawer()
      setTickets((xs) => xs.filter((x) => x.id !== tid))
      if (cur && isClosed(cur.status)) setClosedTotal((n) => Math.max(0, n - 1))
      // Files first: storage RLS (read policy) needs the ticket to still exist,
      // so after the row is gone the objects could never be removed.
      if (paths.length) {
        const { error: se } = await supabase.storage.from('ticket-media').remove(paths)
        if (se) console.warn('[delete] storage cleanup failed', se)
      }
      const { error: e } = await supabase.from('tickets').delete().eq('id', tid)
      if (e) {
        if (cur) setTickets((xs) => [cur, ...xs])
        if (cur && isClosed(cur.status)) setClosedTotal((n) => n + 1)
        toast.show(errText(t, e), { tone: 'error' })
        return
      }
      toast.show(t('panel.ticketDeleted', { no: ticketNo(cur?.number) }))
    },
    [closeDrawer, toast, t],
  )

  const onUpsert = useCallback(
    (row) => {
      if (row.project_id !== id) {
        navigate(`/projects/${row.project_id}?ticket=${row.id}`, { replace: true })
        return
      }
      setTickets((xs) => (xs.some((x) => x.id === row.id) ? xs.map((x) => (x.id === row.id ? { ...x, ...row } : x)) : [row, ...xs]))
    },
    [id, navigate],
  )

  // the ticket open in the drawer disappeared (deleted by someone else)
  const openTicketRow = openId ? tickets.find((x) => x.id === openId) : null
  const hadOpen = useRef(false)
  useEffect(() => {
    if (openTicketRow) hadOpen.current = true
    else if (openId && hadOpen.current && ready) {
      hadOpen.current = false
      toast.show(t('panel.ticketGone'), { tone: 'error' })
      closeDrawer()
    }
    if (!openId) hadOpen.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicketRow, openId])

  async function archiveProject() {
    const ok = await confirm({ title: t('project.archive'), body: t('project.confirmArchive', { name: project?.name }), confirmLabel: t('project.archive') })
    if (!ok) return
    const { error: e } = await supabase.from('projects').update({ archived: true }).eq('id', id)
    if (e) return toast.show(errText(t, e), { tone: 'error' })
    toast.show(t('panel.archived', { name: project?.name }))
    navigate('/projects')
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const activeList = useMemo(() => tickets.filter((x) => !isClosed(x.status)), [tickets])
  const statusCounts = useMemo(() => {
    const o = {}
    activeList.forEach((x) => (o[x.status] = (o[x.status] || 0) + 1))
    return o
  }, [activeList])
  const overdue = useMemo(() => activeList.filter((x) => x.due_date && daysUntil(x.due_date) < 0).length, [activeList])

  const isUnread = useCallback(
    (x) => {
      const r = reads[x.id]
      if (!r) return x.created_by !== user.id
      return new Date(r) < new Date(x.updated_at)
    },
    [reads, user.id],
  )
  const unreadCount = useMemo(() => activeList.filter(isUnread).length, [activeList, isUnread])

  const doneVersions = useMemo(() => {
    const set = new Set()
    let hasNone = false
    tickets.forEach((x) => {
      if (x.status !== 'done') return
      if (x.fixed_version) set.add(x.fixed_version)
      else hasNone = true
    })
    return { list: [...set].sort(cmpVersionDesc), hasNone }
  }, [tickets])

  const visible = useMemo(() => {
    const q = dq.trim().toLowerCase()
    const rank = (p) => PRIORITY_ORDER.indexOf(p)
    return tickets
      .filter((x) => {
        const closed = isClosed(x.status)
        if (tab === 'active' ? closed && !leaving.has(x.id) : !closed) return false
        if (tab === 'active' && filter !== 'all' && x.status !== filter && !leaving.has(x.id)) return false
        if (tab === 'done' && filter !== 'all' && x.status !== filter) return false
        if (who === 'mine' && x.assigned_to !== user.id) return false
        if (who === 'created' && x.created_by !== user.id) return false
        if (tab === 'done' && sort === 'version' && versionFilter !== 'all') {
          if (versionFilter === '__none__' ? x.fixed_version : x.fixed_version !== versionFilter) return false
        }
        if (q && !(`${x.title} ${x.description || ''}`.toLowerCase().includes(q) || String(x.number).includes(q.replace('#', ''))))
          return false
        return true
      })
      .sort((a, b) => {
        if (!isStaff && tab === 'active') {
          const at = a.is_task ? 1 : 0
          const bt = b.is_task ? 1 : 0
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
        if (sort === 'due') {
          const da = a.due_date ? Date.parse(a.due_date) : Infinity
          const db = b.due_date ? Date.parse(b.due_date) : Infinity
          if (da !== db) return da - db
        }
        if (tab === 'done') return new Date(b.updated_at) - new Date(a.updated_at)
        return new Date(b.created_at) - new Date(a.created_at)
      })
  }, [tickets, tab, filter, who, sort, versionFilter, dq, isStaff, leaving, user.id])

  const switchTab = (k) => {
    setTab(k)
    setFilter('all')
    setVersionFilter('all')
    if (k !== 'done' && sort === 'version') setSort('recent')
  }

  const tourSteps = useMemo(() => [{ target: '[data-tour="new-ticket"]', title: t('tour.boardTitle'), text: t('tour.boardText') }], [t])

  const SORTS = [
    { key: 'recent', label: t('project.sortRecent') },
    { key: 'priority', label: t('project.sortPriority') },
    { key: 'due', label: t('panel.sortDue') },
    ...(tab === 'done' ? [{ key: 'version', label: t('project.sortVersion') }] : []),
  ]

  const chatUnread = chatCounts?.[id] || 0
  const split = chatOpen && wide
  const crumbs = project
    ? [{ label: project.name, to: `/projects/${id}` }, ...(openTicketRow ? [{ label: ticketNo(openTicketRow.number), mono: true }] : [])]
    : []

  // ── render ────────────────────────────────────────────────────────────────
  const renderBoard = () => (
    <>
      {/* header */}
      <section className="page-in mb-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            {project.cover_url && (
              <div className="hidden h-[72px] w-[72px] shrink-0 overflow-hidden border border-line sm:block">
                <img src={project.cover_url} alt="" className="h-full w-full object-cover" decoding="async" />
              </div>
            )}
            <div className="min-w-0">
              <span className="tag text-muted">{t('project.label')}</span>
              <h1
                title={project.name}
                className={`display mt-2 break-words text-ink lg:truncate lg:pb-1 ${split ? 'text-[40px] lg:text-[44px] xl:text-[52px]' : 'text-[40px] sm:text-[56px] lg:text-[52px] 2xl:text-[68px]'}`}
              >
                {project.name}
              </h1>
              {project.description && <p className="mt-3 max-w-2xl text-[15px] text-muted">{project.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
            <button
              onClick={() => navigate(`/calendar?project=${id}`)}
              onMouseEnter={() => prefetch(loadCalendar)}
              className="btn-ghost btn-sm"
            >
              <Icon name="calendar" size={16} /> {t('panel.calendar')}
            </button>
            <button onClick={chatOpen ? closeChat : openChat} className={`btn-sm ${chatOpen ? 'btn-solid' : 'btn-ghost'}`} data-tour="chat">
              <Icon name="chat" size={16} /> {t('panel.chat')}
              <CountBadge n={chatUnread} />
            </button>
            {isStaff && (
              <>
                <button onClick={() => setShowMembers(true)} className="btn-ghost btn-sm" data-tour="members">
                  <Icon name="users" size={16} /> {t('project.members')}
                </button>
                <button onClick={() => setShowEdit(true)} className="btn-ghost btn-sm">
                  <Icon name="pencil" size={16} /> {t('common.edit')}
                </button>
                <button onClick={archiveProject} className="icon-btn press h-9 w-9" title={t('project.archive')} aria-label={t('project.archive')}>
                  <Icon name="archive" size={16} />
                </button>
              </>
            )}
            <button onClick={() => setShowCreate(true)} className="btn-accent btn-sm" data-tour="new-ticket">
              <Icon name="plus" size={16} /> {t('panel.newTicket')}
            </button>
          </div>
        </div>

        {/* stats */}
        <div className="mt-6 grid grid-cols-4 border border-line bg-surface sm:max-w-2xl">
          {[
            { n: activeList.length, l: t('panel.statOpen'), c: 'text-ink' },
            { n: overdue, l: t('panel.statOverdue'), c: overdue ? 'text-accent' : 'text-faint' },
            { n: unreadCount, l: t('panel.statUnread'), c: unreadCount ? 'text-accent' : 'text-faint' },
            { n: closedTotal, l: t('panel.statClosed'), c: 'text-ok' },
          ].map((x, i) => (
            <div key={i} className={`min-w-0 px-3 py-3 sm:px-4 ${i ? 'border-l border-line' : ''}`}>
              <div className={`num text-[22px] font-medium leading-none sm:text-[26px] ${x.c}`}>{x.n}</div>
              <div className="mt-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted sm:text-[12px]">{x.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* goals + releases */}
      <div className={`mb-8 grid grid-cols-1 items-start gap-4 ${split ? '2xl:grid-cols-2' : 'lg:grid-cols-2'}`}>
        <DeadlinesBlock projectId={id} />
        <ReleasesBlock projectId={id} />
      </div>

      {/* tabs + search */}
      <div className="sticky top-16 z-20 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            value={tab}
            onChange={switchTab}
            items={[
              { key: 'active', label: t('project.tabActive'), n: activeList.length },
              { key: 'done', label: t('panel.tabClosed'), n: <span key={bump} className={bump ? 'bump' : ''}>{closedTotal}</span> },
            ]}
          />
          <label className="relative block sm:w-72">
            <Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('panel.searchTickets')}
              className="input-box h-10 py-0 pl-10 pr-9"
              type="search"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted hover:text-ink" aria-label={t('common.close')}>
                <Icon name="close" size={15} />
              </button>
            )}
          </label>
        </div>

        {/* filters */}
        <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {(tab === 'active'
            ? [{ key: 'all', label: t('project.filterAll'), n: activeList.length }, ...STATUS_ORDER.filter((k) => !isClosed(k)).map((k) => ({ key: k, label: t('enum.status.' + k), dot: STATUS[k].dot, n: statusCounts[k] || 0 }))]
            : [
                { key: 'all', label: t('project.filterAll') },
                { key: 'done', label: t('enum.status.done'), dot: STATUS.done.dot },
                { key: 'rejected', label: t('enum.status.rejected'), dot: STATUS.rejected.dot },
              ]
          ).map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`chip press shrink-0 ${filter === f.key ? 'chip-on' : ''}`}>
              {f.dot && <span className="inline-block h-2 w-2" style={{ background: f.dot }} />}
              {f.label}
              {f.n != null && <span className={`num text-[12px] ${filter === f.key ? 'text-bg/60' : 'text-faint'}`}>{f.n}</span>}
            </button>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-line" />
          {[
            { key: 'mine', label: t('panel.assignedToMe'), icon: 'user' },
            { key: 'created', label: t('panel.createdByMe'), icon: 'pencil' },
          ].map((f) => (
            <button key={f.key} onClick={() => setWho((w) => (w === f.key ? 'all' : f.key))} className={`chip press shrink-0 ${who === f.key ? 'chip-accent' : ''}`}>
              <Icon name={f.icon} size={14} /> {f.label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-line" />
          <span className="flex shrink-0 items-center gap-1.5 text-faint">
            <Icon name="sort" size={15} />
          </span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setSort(s.key)
                if (s.key !== 'version') setVersionFilter('all')
              }}
              className={`chip press shrink-0 ${sort === s.key ? 'chip-on' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {tab === 'done' && sort === 'version' && (doneVersions.list.length > 0 || doneVersions.hasNone) && (
          <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {[
              { key: 'all', label: t('panel.allVersions') },
              ...doneVersions.list.map((v) => ({ key: v, label: v, v: true })),
              ...(doneVersions.hasNone ? [{ key: '__none__', label: t('ticket.noVersion') }] : []),
            ].map((vf) => (
              <button key={vf.key} onClick={() => setVersionFilter(vf.key)} className={`chip press shrink-0 ${vf.v ? 'num' : ''} ${versionFilter === vf.key ? 'chip-on' : ''}`}>
                {vf.v && <Icon name="check" size={13} className={versionFilter === vf.key ? '' : 'text-ok'} />}
                {vf.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* list */}
      {visible.length === 0 ? (
        <EmptyState
          icon={tab === 'done' ? 'checkCircle' : 'ticket'}
          title={
            tab === 'done'
              ? t('project.emptyDoneTitle')
              : activeList.length === 0
              ? t('project.emptyNoneTitle')
              : t('project.emptySearchTitle')
          }
          hint={tab === 'done' ? t('panel.emptyClosedHint') : activeList.length === 0 ? t('project.emptyNoneHint') : t('project.emptySearchHint')}
        >
          {tab === 'active' && activeList.length === 0 && (
            <button onClick={() => setShowCreate(true)} className="btn-accent">
              <Icon name="plus" size={16} /> {t('panel.newTicket')}
            </button>
          )}
          {(filter !== 'all' || who !== 'all' || query) && (
            <button
              onClick={() => {
                setFilter('all')
                setWho('all')
                setQuery('')
              }}
              className="btn-ghost"
            >
              {t('panel.resetFilters')}
            </button>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {visible.map((x, i) => (
            <TicketCard
              key={x.id}
              ticket={x}
              index={i}
              unread={isUnread(x)}
              commentCount={counts[x.id] || 0}
              photos={photos[x.id]}
              leaving={leaving.has(x.id)}
              onOpen={openTicket}
            />
          ))}
        </div>
      )}
      {tab === 'done' && closedLoaded < closedTotal && (
        <div className="mt-6 flex justify-center">
          <button onClick={loadMoreClosed} disabled={loadingMore} className="btn-ghost">
            {loadingMore ? <span className="spin-square inline-block h-3.5 w-3.5 border-2 border-line2 border-t-accent" /> : <Icon name="down" size={16} />}
            {t('panel.loadMore', { n: closedTotal - closedLoaded })}
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-bg">
      <TopBar crumbs={crumbs} />

      <div className={`mx-auto max-w-[1440px] ${split ? 'grid grid-cols-[minmax(0,1fr)_minmax(380px,440px)]' : ''}`}>
        <main className={`min-w-0 px-4 pb-28 pt-6 sm:px-6 sm:pt-10 ${split ? '' : 'mx-auto max-w-[1180px]'}`}>
          {error && !project ? (
            <div className="py-16">
              <ErrorState message={errText(t, error, 'common.loadError')} onRetry={load} onClose={() => navigate('/projects')} closeLabel={t('common.toProjects')} />
            </div>
          ) : !ready ? (
            <div className="space-y-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-2/3" />
              <Skeleton className="h-16 w-full max-w-2xl" />
              <div className="grid grid-cols-1 gap-2.5 pt-6">
                {[0, 1, 2, 3].map((i) => (
                  <TicketCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : notFound || !project ? (
            <div className="py-16">
              <EmptyState icon="folder" title={t('project.notFound')} hint={t('panel.projectMissingHint')}>
                <button onClick={() => navigate('/projects')} className="btn-ghost">
                  <Icon name="arrowLeft" size={16} /> {t('common.toProjects')}
                </button>
              </EmptyState>
            </div>
          ) : (
            renderBoard()
          )}
        </main>

        {split && project && (
          <aside className="sticky top-16 h-[calc(100dvh-64px)] min-w-0 border-l border-line bg-surface">
            <Suspense fallback={<ChatSkeleton />}>
              <ProjectChat projectId={id} projectName={project.name} onOpenTicket={openTicket} onClose={closeChat} embedded />
            </Suspense>
          </aside>
        )}
      </div>

      {/* mobile / narrow: chat full screen with back */}
      {chatOpen && !wide && project && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] bg-bg"><ChatSkeleton /></div>}>
          <ProjectChat projectId={id} projectName={project.name} onOpenTicket={openTicket} onClose={closeChat} embedded={false} />
        </Suspense>
      )}

      {/* mobile FAB */}
      {ready && project && !openId && !(chatOpen && !wide) && (
        <button
          onClick={() => setShowCreate(true)}
          className="btn-accent fixed bottom-5 right-4 z-30 h-14 w-14 px-0 shadow-[0_16px_40px_-12px_rgba(242,35,27,0.7)] sm:hidden"
          aria-label={t('panel.newTicket')}
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Icon name="plus" size={24} stroke={2.2} />
        </button>
      )}

      {openId && (
        <TicketDrawer
          key={openId}
          ticketId={openId}
          ticket={openTicketRow}
          people={people}
          onClose={closeDrawer}
          onUpsert={onUpsert}
          mutate={mutate}
          closeFlow={closeFlow}
          assign={assign}
          removeTicket={removeTicket}
          markRead={markRead}
        />
      )}

      <Suspense fallback={null}>
        {showCreate && (
          <CreateTicketModal
            open
            onClose={() => setShowCreate(false)}
            projectId={id}
            onCreated={(row) => {
              if (!row) return
              setTickets((xs) => (xs.some((x) => x.id === row.id) ? xs : [row, ...xs]))
              markRead(row.id, row.updated_at)
              loadPhotos([row.id])
              if (tab !== 'active') switchTab('active')
              toast.show(t('panel.ticketCreated', { no: ticketNo(row.number) }), {
                actions: [{ label: t('common.open'), onClick: () => openTicket(row.id) }],
              })
            }}
          />
        )}
        {isStaff && showEdit && project && (
          <ProjectFormModal
            open
            onClose={() => setShowEdit(false)}
            project={project}
            onSaved={(row) => {
              if (row) setProject(row)
              toast.show(t('common.saved'))
            }}
          />
        )}
        {isStaff && showMembers && <ManageMembersModal open onClose={() => setShowMembers(false)} projectId={id} />}
      </Suspense>

      {ready && project && <Tour storageKey="ticket-board" steps={tourSteps} />}
    </div>
  )
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-14 w-3/4" />
      <Skeleton className="ml-auto h-14 w-2/3" />
      <Skeleton className="h-14 w-1/2" />
    </div>
  )
}
