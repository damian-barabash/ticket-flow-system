import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { notify } from '../lib/notify'
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER } from '../lib/constants'
import { formatDate, formatDay, timeAgo, dueTone } from '../lib/format'
import {
  Avatar,
  EmptyState,
  ErrorState,
  Icon,
  Modal,
  PriorityBars,
  Skeleton,
  Spinner,
  StatusBadge,
  useConfirm,
  useEsc,
  useScrollLock,
  useToast,
} from './ui'
import { Thumb } from './Thumb'
import { isImageFile, imageExt, imageContentType } from '../lib/files'
import { signUrls } from '../lib/signed'
import { channelName, useDebounced, uid } from '../lib/realtime'
import { errText } from '../lib/errors'
import { AssigneePicker } from './AssigneePicker'
import { ticketNo } from './TicketCard'

const Lightbox = lazy(() => import('./Lightbox').then((m) => ({ default: m.Lightbox })))

const isDesktopInput = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches && window.innerWidth >= 768

async function withSigned(rows) {
  const signed = await signUrls('ticket-media', rows.map((a) => a.path))
  return rows.map((a) => ({ ...a, signed: signed[a.path] }))
}

// Right drawer (desktop) / full screen (mobile). The ticket ROW is owned by the
// board (`ticket` prop, patched optimistically + by realtime); the drawer loads
// the thread (comments, activity, photos) and calls the board's mutators.
export function TicketDrawer({
  ticketId,
  ticket,
  people, // { [id]: { full_name, email, role } }
  onClose,
  onUpsert, // (row) → board merges the freshly fetched row
  mutate, // (tid, patch) → Promise<boolean>  optimistic update
  closeFlow, // (tid, patch) → closes drawer + toast with Undo
  assign, // (tid, userId)
  removeTicket, // (tid, paths)
  markRead, // (tid)
}) {
  const { user, isStaff } = useAuth()
  const { t } = useT()
  const toast = useToast()
  const confirm = useConfirm()

  const [state, setState] = useState('loading') // loading | ready | error | missing
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])
  const [atts, setAtts] = useState([])
  const [extra, setExtra] = useState({}) // profiles of people no longer in the project
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([]) // [{ file, url }]
  const [sending, setSending] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [lb, setLb] = useState(null)
  const [fix, setFix] = useState(null) // { version } when the "fixed in version" prompt is open
  const [relVersions, setRelVersions] = useState([])
  const [closing, setClosing] = useState(false)
  const [drag, setDrag] = useState(false)

  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const addPhotoRef = useRef(null)
  const taRef = useRef(null)
  const req = useRef(0)
  const alive = useRef(true)
  const closeTimer = useRef(0)
  const filesRef = useRef(files)
  filesRef.current = files

  useScrollLock(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(closeTimer.current)
      // revoke previews that were never sent
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.url))
    }
  }, [])

  const requestClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => onClose?.(), 140)
  }, [closing, onClose])
  useEsc(requestClose, !closing)

  // ── load thread ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const my = ++req.current
    const [tk, cm, ac, at] = await Promise.all([
      supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle(),
      supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
      supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at'),
      supabase.from('attachments').select('*').eq('ticket_id', ticketId).order('created_at'),
    ])
    if (!alive.current || my !== req.current) return
    const err = tk.error || cm.error || ac.error || at.error
    if (err) {
      console.warn('[drawer] load failed', err)
      setState('error')
      return
    }
    if (!tk.data) {
      setState('missing')
      return
    }
    onUpsert?.(tk.data)
    setComments(cm.data ?? [])
    setActivity(ac.data ?? [])
    setAtts(await withSigned(at.data ?? []))
    if (!alive.current || my !== req.current) return
    setState('ready')
    markRead?.(ticketId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  const reloadAtts = useDebounced(async () => {
    const { data, error } = await supabase.from('attachments').select('*').eq('ticket_id', ticketId).order('created_at')
    if (error || !alive.current) return
    const rows = await withSigned(data ?? [])
    if (alive.current) setAtts((cur) => [...rows, ...cur.filter((a) => a.pending)])
  }, 900)
  const readLater = useDebounced(() => markRead?.(ticketId), 600)

  useEffect(() => {
    setState('loading')
    load()
    // patch from payloads — never refetch the whole thread
    const ch = supabase
      .channel(channelName(`ticket-${ticketId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` }, ({ new: c }) => {
        setComments((xs) =>
          xs.some((x) => x.id === c.id) ? xs : [...xs.filter((x) => !(x.pending && x.author_id === c.author_id && x.body === c.body)), c],
        )
        if (c.author_id !== user.id) {
          reloadAtts() // photos of that comment land right after it
          readLater()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` }, ({ new: c }) =>
        setComments((xs) => xs.map((x) => (x.id === c.id ? { ...x, ...c } : x))),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ticket_comments' }, ({ old }) =>
        setComments((xs) => xs.filter((x) => x.id !== old.id)),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_activity', filter: `ticket_id=eq.${ticketId}` }, ({ new: a }) =>
        setActivity((xs) => (xs.some((x) => x.id === a.id) ? xs : [...xs, a])),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [ticketId, load, user.id, reloadAtts, readLater])

  // profiles of authors/actors that are no longer project people
  useEffect(() => {
    if (!people) return
    const ids = new Set()
    if (ticket?.created_by) ids.add(ticket.created_by)
    comments.forEach((c) => c.author_id && ids.add(c.author_id))
    activity.forEach((a) => {
      if (a.actor_id) ids.add(a.actor_id)
      if (a.type === 'assigned') [a.from_val, a.to_val].forEach((v) => v && /^[0-9a-f-]{36}$/.test(v) && ids.add(v))
    })
    const missing = [...ids].filter((i) => !people[i] && !extra[i])
    if (!missing.length) return
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', missing)
      .then(({ data }) => {
        if (data?.length && alive.current) setExtra((e) => ({ ...e, ...Object.fromEntries(data.map((p) => [p.id, p])) }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, comments.length, activity.length, ticket?.created_by])

  const who = useCallback((id) => (id && (people?.[id] || extra[id])) || null, [people, extra])

  // stick to the bottom when the thread grows
  const threadLen = comments.length + activity.length
  useEffect(() => {
    if (state !== 'ready') return
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [threadLen, state])

  // ── permissions ───────────────────────────────────────────────────────────
  const tk = ticket
  const closed = tk && (tk.status === 'done' || tk.status === 'rejected')
  const isAssignee = tk?.assigned_to && tk.assigned_to === user.id
  const canStatus = isStaff || isAssignee
  const clientTask = !isStaff && !isAssignee && tk?.is_task
  const canDeletePhoto = useCallback((a) => isStaff || a.uploaded_by === user.id, [isStaff, user.id])

  // ── actions ───────────────────────────────────────────────────────────────
  function changeStatus(next) {
    if (!tk || next === tk.status) return
    if (next === 'done' && isStaff) {
      openFix()
      return
    }
    if (next === 'done' || next === 'rejected') {
      closeFlow(ticketId, { status: next })
      return
    }
    mutate(ticketId, { status: next })
  }

  async function openFix() {
    setFix({ version: tk.fixed_version || '' })
    if (!relVersions.length && tk?.project_id) {
      const { data } = await supabase
        .from('project_releases')
        .select('version')
        .eq('project_id', tk.project_id)
        .not('version', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (alive.current) setRelVersions([...new Set((data ?? []).map((r) => r.version).filter(Boolean))])
    }
  }

  function confirmFix(e) {
    e?.preventDefault()
    const version = fix.version.trim() || null
    setFix(null)
    if (tk.status === 'done') {
      // editing the version of an already-done ticket
      mutate(ticketId, { fixed_version: version })
      return
    }
    closeFlow(ticketId, { status: 'done', fixed_version: version })
  }

  function setDue(value) {
    mutate(ticketId, { due_date: value || null })
  }

  async function onDelete() {
    const ok = await confirm({
      title: t('ticket.deleteTicket'),
      body: t('ticket.confirmDeleteTicket', { title: tk.title }),
      danger: true,
      confirmLabel: t('common.delete'),
    })
    if (!ok) return
    removeTicket(ticketId, atts.map((a) => a.path).filter(Boolean))
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#/projects/${tk.project_id}?ticket=${ticketId}`
    navigator.clipboard?.writeText(url).then(
      () => toast.show(t('panel.linkCopied')),
      () => toast.show(url),
    )
  }

  // ── photos ────────────────────────────────────────────────────────────────
  function addFiles(list) {
    const imgs = Array.from(list || []).filter(isImageFile)
    if (imgs.length) setFiles((p) => [...p, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
  }
  function dropFile(i) {
    setFiles((p) => {
      const f = p[i]
      if (f) URL.revokeObjectURL(f.url)
      return p.filter((_, j) => j !== i)
    })
  }

  // Upload to storage FIRST; the DB rows are written only once every file is
  // up — a failed upload never leaves a half-created comment behind.
  async function uploadAll(list) {
    const done = []
    try {
      for (const file of list) {
        const path = `${ticketId}/${uid()}.${imageExt(file)}`
        const contentType = imageContentType(file)
        const { error } = await supabase.storage.from('ticket-media').upload(path, file, { contentType })
        if (error) throw error
        done.push({ path, name: file.name, content_type: contentType, size: file.size })
      }
      return done
    } catch (e) {
      if (done.length) supabase.storage.from('ticket-media').remove(done.map((d) => d.path))
      throw e
    }
  }

  async function addTicketPhotos(list) {
    const imgs = Array.from(list || []).filter(isImageFile)
    if (addPhotoRef.current) addPhotoRef.current.value = ''
    if (!imgs.length) return
    setUploadingPhotos(true)
    try {
      const up = await uploadAll(imgs)
      const { data, error } = await supabase
        .from('attachments')
        .insert(up.map((u) => ({ ...u, ticket_id: ticketId, comment_id: null, uploaded_by: user.id })))
        .select()
      if (error) {
        supabase.storage.from('ticket-media').remove(up.map((u) => u.path))
        throw error
      }
      const rows = await withSigned(data ?? [])
      if (alive.current) setAtts((a) => [...a, ...rows])
      markRead?.(ticketId)
    } catch (err) {
      toast.show(errText(t, err, 'panel.errPhoto'), { tone: 'error' })
    } finally {
      if (alive.current) setUploadingPhotos(false)
    }
  }

  async function deletePhoto(att) {
    if (!canDeletePhoto(att)) return
    const ok = await confirm({ title: t('ticket.deletePhoto'), body: t('ticket.confirmDeletePhoto'), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    const before = atts
    setAtts((p) => p.filter((a) => a.id !== att.id))
    // DB row first, then the file (a dangling row would show a broken tile)
    const { error } = await supabase.from('attachments').delete().eq('id', att.id)
    if (error) {
      setAtts(before)
      toast.show(errText(t, error, 'panel.errPhoto'), { tone: 'error' })
      return
    }
    if (att.path) supabase.storage.from('ticket-media').remove([att.path])
  }

  // ── comments ──────────────────────────────────────────────────────────────
  async function send(e) {
    e?.preventDefault()
    const text = body.trim()
    const sendFiles = files
    if ((!text && sendFiles.length === 0) || sending) return
    setSending(true)
    const tmpId = 'tmp-' + uid()
    const optimistic = {
      id: tmpId,
      pending: true,
      ticket_id: ticketId,
      author_id: user.id,
      body: text || t('ticket.photoFallback'),
      created_at: new Date().toISOString(),
      previews: sendFiles.map((f) => f.url),
    }
    setComments((xs) => [...xs, optimistic])
    setBody('')
    setFiles([])
    try {
      const up = sendFiles.length ? await uploadAll(sendFiles.map((f) => f.file)) : []
      const { data: comment, error: cErr } = await supabase
        .from('ticket_comments')
        .insert({ ticket_id: ticketId, author_id: user.id, body: optimistic.body })
        .select()
        .single()
      if (cErr) {
        if (up.length) supabase.storage.from('ticket-media').remove(up.map((u) => u.path))
        throw cErr
      }
      if (up.length) {
        const { data: rows, error: aErr } = await supabase
          .from('attachments')
          .insert(up.map((u) => ({ ...u, ticket_id: ticketId, comment_id: comment.id, uploaded_by: user.id })))
          .select()
        if (aErr) {
          // roll the whole comment back so a retry can't duplicate it
          await supabase.from('ticket_comments').delete().eq('id', comment.id)
          supabase.storage.from('ticket-media').remove(up.map((u) => u.path))
          throw aErr
        }
        const signedRows = await withSigned(rows ?? [])
        if (alive.current) setAtts((a) => [...a, ...signedRows])
      }
      sendFiles.forEach((f) => URL.revokeObjectURL(f.url))
      if (alive.current) {
        setComments((xs) => {
          const without = xs.filter((x) => x.id !== tmpId)
          return without.some((x) => x.id === comment.id) ? without : [...without, comment]
        })
      }
      notify('comment_added', ticketId, { comment_id: comment.id })
      markRead?.(ticketId)
    } catch (err) {
      if (alive.current) {
        setComments((xs) => xs.filter((x) => x.id !== tmpId))
        setBody((b) => b || text)
        setFiles((f) => (f.length ? f : sendFiles))
      }
      toast.show(errText(t, err, 'panel.errSend'), { tone: 'error' })
    } finally {
      if (alive.current) {
        setSending(false)
        taRef.current?.focus()
      }
    }
  }

  // autosize the composer
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [body])

  // ── derived ───────────────────────────────────────────────────────────────
  const timeline = useMemo(
    () =>
      [
        ...comments.map((c) => ({ kind: 'comment', at: c.created_at, data: c })),
        ...activity.filter((a) => a.type !== 'commented').map((a) => ({ kind: 'activity', at: a.created_at, data: a })),
      ].sort((x, y) => new Date(x.at) - new Date(y.at)),
    [comments, activity],
  )
  const ticketPhotos = useMemo(() => atts.filter((a) => !a.comment_id), [atts])
  const attsByComment = useMemo(() => {
    const m = {}
    atts.forEach((a) => a.comment_id && (m[a.comment_id] ||= []).push(a))
    return m
  }, [atts])
  const author = who(tk?.created_by)
  const due = tk?.due_date ? dueTone(tk.due_date, closed) : null

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] flex justify-end bg-black/60 ${closing ? 'scrim-out' : 'scrim-in'}`}
        onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
        onDragOver={(e) => {
          if (state !== 'ready') return
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={(e) => e.target === e.currentTarget && setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <aside
          className={`relative flex h-full w-full flex-col border-l border-line bg-bg sm:max-w-[680px] ${closing ? 'drawer-out' : 'drawer-in'}`}
          role="dialog"
          aria-modal="true"
          aria-label={tk ? `${ticketNo(tk.number)} ${tk.title}` : t('panel.ticket')}
        >
          {/* header — the way out is ALWAYS visible */}
          <div className="flex items-start gap-3 border-b border-line px-4 pb-4 pt-3 sm:px-6 sm:pt-4">
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {tk ? (
                  <>
                    <span className="num text-[14px] font-medium text-muted">{ticketNo(tk.number)}</span>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">{t('enum.category.' + tk.category)}</span>
                    {tk.is_task && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${!isStaff ? 'bg-accent text-white' : 'border border-accent/50 text-accent'}`}>
                        <Icon name="star" size={12} /> {!isStaff ? t('ticket.taskForYou') : t('ticket.taskForClient')}
                      </span>
                    )}
                  </>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
              </div>
              {tk ? (
                <h2 className="mt-1.5 break-words font-display text-[22px] font-bold leading-[1.15] tracking-tight text-ink sm:text-[26px]">
                  {tk.title}
                </h2>
              ) : (
                <Skeleton className="mt-2 h-7 w-3/4" />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {tk && state === 'ready' && (
                <button onClick={copyLink} className="icon-btn press hidden sm:inline-flex" title={t('panel.copyLink')} aria-label={t('panel.copyLink')}>
                  <Icon name="link" size={17} />
                </button>
              )}
              {isStaff && tk && state === 'ready' && (
                <button onClick={onDelete} className="icon-btn press hover:!border-accent hover:!text-accent" title={t('ticket.deleteTicket')} aria-label={t('ticket.deleteTicket')}>
                  <Icon name="trash" size={17} />
                </button>
              )}
              <button onClick={requestClose} className="icon-btn press border-line2 text-ink" title={t('common.close') + ' (Esc)'} aria-label={t('common.close')}>
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>

          {state === 'error' ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <ErrorState onRetry={() => { setState('loading'); load() }} onClose={requestClose} />
            </div>
          ) : state === 'missing' ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon="ticket" title={t('panel.ticketMissing')} hint={t('panel.ticketMissingHint')}>
                <button onClick={requestClose} className="btn-ghost">
                  <Icon name="arrowLeft" size={16} /> {t('panel.backToBoard')}
                </button>
              </EmptyState>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
                {/* properties */}
                {tk ? (
                  <div className="space-y-5 border-b border-line px-4 py-5 sm:px-6">
                    {/* status */}
                    <div>
                      <div className="label mb-2">{t('ticket.status')}</div>
                      {canStatus ? (
                        <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-4">
                          {STATUS_ORDER.map((k) => {
                            const active = tk.status === k
                            const st = STATUS[k]
                            return (
                              <button
                                key={k}
                                onClick={() => changeStatus(k)}
                                aria-pressed={active}
                                className={`press flex min-h-[40px] items-center gap-2 border px-2.5 text-left text-[12px] font-bold uppercase leading-tight tracking-[0.04em] transition-colors ${active ? 'wipe' : 'hover:bg-surface2'}`}
                                style={
                                  active
                                    ? { background: st.dot, borderColor: st.dot, color: '#0A0A0A', '--wipe': '#fff' }
                                    : { borderColor: 'rgb(var(--c-line))', color: st.text }
                                }
                              >
                                {k === 'done' ? (
                                  <Icon name="check" size={15} stroke={2.4} />
                                ) : k === 'rejected' ? (
                                  <Icon name="close" size={15} stroke={2.4} />
                                ) : (
                                  <span className="inline-block h-2 w-2 shrink-0" style={{ background: active ? '#0A0A0A' : st.dot }} />
                                )}
                                {t('enum.status.' + k)}
                              </button>
                            )
                          })}
                        </div>
                      ) : clientTask ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={tk.status} />
                          {tk.status !== 'done' ? (
                            <button onClick={() => closeFlow(ticketId, { status: 'done' })} className="btn-accent btn-sm">
                              <Icon name="check" size={16} /> {t('ticket.taskDoneClient')}
                            </button>
                          ) : (
                            <button onClick={() => mutate(ticketId, { status: 'in_progress' })} className="btn-ghost btn-sm">
                              <Icon name="restore" size={15} /> {t('ticket.reopen')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <StatusBadge status={tk.status} />
                      )}
                    </div>

                    {/* fixed-in version (once done) */}
                    {tk.status === 'done' && (
                      <div>
                        <div className="label mb-2">{t('ticket.fixedVersion')}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {tk.fixed_version ? (
                            <span className="num inline-flex h-8 items-center gap-1.5 border border-ok/40 px-2.5 text-[13px] text-ok">
                              <Icon name="check" size={14} /> {tk.fixed_version}
                            </span>
                          ) : (
                            <span className="text-[14px] text-faint">{t('ticket.noVersion')}</span>
                          )}
                          {isStaff && (
                            <button onClick={openFix} className="btn-quiet btn-sm">
                              <Icon name="pencil" size={14} /> {t('common.edit')}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      {/* priority */}
                      <div>
                        <div className="label mb-2">{t('ticket.priority')}</div>
                        {isStaff ? (
                          <div className="grid grid-cols-4 border border-line">
                            {PRIORITY_ORDER.map((k, i) => {
                              const active = tk.priority === k
                              return (
                                <button
                                  key={k}
                                  onClick={() => k !== tk.priority && mutate(ticketId, { priority: k })}
                                  aria-pressed={active}
                                  title={t('enum.priority.' + k)}
                                  className={`press flex h-10 flex-col items-center justify-center gap-0.5 text-[11px] font-bold uppercase tracking-[0.04em] transition-colors ${i ? 'border-l border-line' : ''} ${active ? '' : 'hover:bg-surface2'}`}
                                  style={active ? { background: PRIORITY[k].text, color: '#0A0A0A' } : { color: PRIORITY[k].text }}
                                >
                                  <PriorityBars priority={k} color={active ? '#0A0A0A' : undefined} />
                                  <span className="max-w-full truncate px-1">{t('enum.priority.' + k)}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="flex h-10 items-center gap-2 text-[14px] font-semibold uppercase" style={{ color: PRIORITY[tk.priority]?.text }}>
                            <PriorityBars priority={tk.priority} /> {t('enum.priority.' + (PRIORITY[tk.priority] ? tk.priority : 'medium'))}
                          </span>
                        )}
                      </div>

                      {/* assignee */}
                      <div>
                        <div className="label mb-2">{t('panel.assignee')}</div>
                        <AssigneePicker projectId={tk.project_id} value={tk.assigned_to || null} onChange={(uidv) => assign(ticketId, uidv)} />
                      </div>

                      {/* due date */}
                      <div>
                        <div className="label mb-2">{t('ticket.deadline')}</div>
                        {isStaff ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={tk.due_date ? String(tk.due_date).slice(0, 10) : ''}
                              onChange={(e) => setDue(e.target.value)}
                              className="input-box h-10 py-0 [color-scheme:dark]"
                              style={due?.overdue ? { borderColor: due.color, color: due.color } : undefined}
                            />
                            {tk.due_date && (
                              <button onClick={() => setDue('')} className="icon-btn press" title={t('panel.clearDate')} aria-label={t('panel.clearDate')}>
                                <Icon name="close" size={16} />
                              </button>
                            )}
                          </div>
                        ) : tk.due_date ? (
                          <span className="flex h-10 items-center gap-2 text-[15px] font-medium" style={{ color: due.color }}>
                            <Icon name="calendar" size={16} /> {formatDay(tk.due_date)}
                          </span>
                        ) : (
                          <span className="flex h-10 items-center text-[14px] text-faint">{t('ticket.dueNone')}</span>
                        )}
                      </div>

                      {/* author */}
                      <div>
                        <div className="label mb-2">{t('ticket.author')}</div>
                        <span className="flex h-10 items-center gap-2.5 text-[14px] text-ink">
                          <Avatar name={author?.full_name} email={author?.email} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate">{author?.full_name || author?.email || '—'}</span>
                            <span className="block text-[12px] text-faint">{formatDate(tk.created_at)}</span>
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 border-b border-line px-6 py-5">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-2/3" />
                  </div>
                )}

                {/* description + photos */}
                <div className="px-4 py-5 sm:px-6">
                  {tk?.description && (
                    <p className="mb-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink/90">{tk.description}</p>
                  )}

                  <div className="mb-6">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="label">
                        {t('ticket.photos')} {ticketPhotos.length > 0 && <span className="num text-faint">· {ticketPhotos.length}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => addPhotoRef.current?.click()}
                        disabled={uploadingPhotos || state !== 'ready'}
                        className="btn-quiet btn-sm"
                      >
                        {uploadingPhotos ? <Spinner size={14} /> : <Icon name="plus" size={16} />} {t('panel.addPhoto')}
                      </button>
                      <input ref={addPhotoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addTicketPhotos(e.target.files)} />
                    </div>
                    {ticketPhotos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {ticketPhotos.map((a) => (
                          <PhotoTile key={a.id} att={a} onOpen={() => setLb(atts.findIndex((x) => x.id === a.id))} canDelete={canDeletePhoto(a)} onDelete={() => deletePhoto(a)} />
                        ))}
                      </div>
                    ) : state === 'ready' ? (
                      <button
                        onClick={() => addPhotoRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 border border-dashed border-line2 py-4 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
                      >
                        <Icon name="image" size={18} /> {t('panel.dropPhotos')}
                      </button>
                    ) : null}
                  </div>

                  {/* timeline */}
                  <div className="label mb-3">{t('panel.timeline')}</div>
                  {state === 'loading' ? (
                    <div className="space-y-4">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="h-8 w-8" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-12 w-4/5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : timeline.length === 0 ? (
                    <p className="text-[14px] text-faint">{t('panel.noComments')}</p>
                  ) : (
                    <div className="space-y-4">
                      {timeline.map((item) =>
                        item.kind === 'comment' ? (
                          <CommentRow
                            key={`c${item.data.id}`}
                            comment={item.data}
                            author={who(item.data.author_id)}
                            mine={item.data.author_id === user.id}
                            atts={attsByComment[item.data.id] || []}
                            onOpenPhoto={(att) => setLb(atts.findIndex((x) => x.id === att.id))}
                            canDelete={canDeletePhoto}
                            onDelete={deletePhoto}
                          />
                        ) : (
                          <ActivityRow key={`a${item.data.id}`} a={item.data} who={who} />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* composer */}
              <form onSubmit={send} className="border-t border-line bg-bg px-3 py-3 sm:px-5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                {files.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <div key={f.url} className="relative h-16 w-16 overflow-hidden border border-line">
                        <img src={f.url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => dropFile(i)}
                          className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center bg-bg/90 text-ink hover:bg-accent hover:text-white"
                          aria-label={t('ticket.deletePhoto')}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="icon-btn press h-11 w-11"
                    title={t('ticket.attachPhoto')}
                    aria-label={t('ticket.attachPhoto')}
                    disabled={state !== 'ready'}
                  >
                    <Icon name="paperclip" size={18} />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                  <textarea
                    ref={taRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onPaste={(e) => {
                      const imgs = Array.from(e.clipboardData?.items || [])
                        .filter((i) => i.type.startsWith('image/'))
                        .map((i) => i.getAsFile())
                        .filter(Boolean)
                      if (imgs.length) addFiles(imgs)
                    }}
                    onKeyDown={(e) => {
                      // Enter sends on desktop only; on phones Enter is a newline
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && isDesktopInput()) {
                        e.preventDefault()
                        send(e)
                      }
                    }}
                    rows={1}
                    disabled={state !== 'ready'}
                    placeholder={isDesktopInput() ? t('panel.composerDesktop') : t('panel.composerMobile')}
                    className="input-box min-h-[44px] flex-1 resize-none py-2.5 leading-snug"
                  />
                  <button
                    type="submit"
                    disabled={sending || state !== 'ready' || (!body.trim() && !files.length)}
                    className="btn-accent h-11 min-h-0 w-11 shrink-0 px-0 sm:w-auto sm:px-4"
                    aria-label={t('ticket.send')}
                  >
                    {sending ? <Spinner size={14} className="border-white/40 border-t-white" /> : <Icon name="send" size={17} />}
                    <span className="hidden sm:inline">{t('ticket.send')}</span>
                  </button>
                </div>
              </form>
            </>
          )}

          {drag && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent/10">
              <span className="display text-[32px] text-ink">{t('panel.dropHere')}</span>
            </div>
          )}
        </aside>
      </div>

      {lb != null && lb >= 0 && (
        <Suspense fallback={null}>
          <Lightbox images={atts} index={lb} onClose={() => setLb(null)} onNav={(d) => setLb((i) => (i + d + atts.length) % atts.length)} />
        </Suspense>
      )}

      {/* "fixed in version" prompt — above the drawer */}
      {fix && (
        <Modal open onClose={() => setFix(null)} title={t('ticket.fixVersionTitle')} width="max-w-md" z="z-[90]">
          <form onSubmit={confirmFix}>
            <p className="mb-5 text-[15px] text-muted">{t('ticket.fixVersionHint')}</p>
            <label className="field-label mb-1" htmlFor="fix-version">
              {t('common.version')}
            </label>
            <input
              id="fix-version"
              list="fix-version-list"
              autoFocus
              value={fix.version}
              onChange={(e) => setFix({ version: e.target.value })}
              placeholder={t('ticket.fixVersionPlaceholder')}
              className="field num"
            />
            <datalist id="fix-version-list">
              {relVersions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            {relVersions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {relVersions.slice(0, 6).map((v) => (
                  <button type="button" key={v} onClick={() => setFix({ version: v })} className={`chip num ${fix.version === v ? 'chip-on' : ''}`}>
                    {v}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setFix(null)} className="btn-ghost">
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn-accent">
                <Icon name="check" size={16} /> {tk?.status === 'done' ? t('common.save') : t('ticket.markDone')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

function PhotoTile({ att, onOpen, canDelete, onDelete, size = 'aspect-square' }) {
  const { t } = useT()
  return (
    <div className={`group relative ${size} overflow-hidden border border-line bg-surface2`}>
      <button onClick={onOpen} className="h-full w-full">
        <Thumb att={att} />
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute right-0 top-0 z-10 flex h-7 w-7 items-center justify-center bg-bg/90 text-ink transition-opacity hover:bg-accent hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          title={t('ticket.deletePhoto')}
          aria-label={t('ticket.deletePhoto')}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  )
}

function CommentRow({ comment, author, mine, atts, onOpenPhoto, canDelete, onDelete }) {
  const { t } = useT()
  return (
    <div className={`rise-in flex gap-3 ${mine ? 'flex-row-reverse' : ''} ${comment.pending ? 'opacity-60' : ''}`}>
      <Avatar name={author?.full_name} email={author?.email} size={32} />
      <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div className={`mb-1 flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[13px] font-semibold text-ink">{mine ? t('ticket.you') : author?.full_name || author?.email || '—'}</span>
          <span className="text-[12px] text-faint" title={formatDate(comment.created_at)}>
            {comment.pending ? <Spinner size={10} /> : timeAgo(comment.created_at)}
          </span>
        </div>
        <div className={`border px-3.5 py-2.5 text-[15px] leading-relaxed ${mine ? 'border-accent/35 bg-accentSoft text-ink' : 'border-line bg-surface text-ink/90'}`}>
          <p className="whitespace-pre-wrap break-words">{comment.body}</p>
        </div>
        {(atts.length > 0 || comment.previews?.length > 0) && (
          <div className={`mt-2 flex flex-wrap gap-2 ${mine ? 'justify-end' : ''}`}>
            {atts.map((a) => (
              <div key={a.id} className="w-[72px]">
                <PhotoTile att={a} onOpen={() => onOpenPhoto(a)} canDelete={canDelete(a)} onDelete={() => onDelete(a)} />
              </div>
            ))}
            {comment.pending &&
              comment.previews.map((u) => (
                <div key={u} className="h-[72px] w-[72px] overflow-hidden border border-line">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityRow({ a, who }) {
  const { t } = useT()
  const actor = who(a.actor_id)
  const name = actor?.full_name || actor?.email || t('ticket.someone')
  let detail = t('enum.activity.' + a.type)
  let color
  if (a.type === 'status_changed') {
    detail = t('ticket.actStatusTo', { v: STATUS[a.to_val] ? t('enum.status.' + a.to_val) : a.to_val })
    color = STATUS[a.to_val]?.dot
  }
  if (a.type === 'priority_changed') detail = t('ticket.actPriorityTo', { v: PRIORITY[a.to_val] ? t('enum.priority.' + a.to_val) : a.to_val })
  if (a.type === 'assigned') {
    const to = who(a.to_val)
    detail = a.to_val
      ? t('panel.actAssigned', { who: to?.full_name || to?.email || '—' })
      : t('panel.actUnassigned')
  }
  return (
    <div className="flex items-start gap-3 pl-[11px]">
      <span className="mt-[7px] h-2 w-2 shrink-0" style={{ background: color || 'rgb(var(--c-line2))' }} />
      <span className="text-[13px] leading-relaxed text-muted">
        <span className="font-semibold text-ink/80">{name}</span> {detail}
        <span className="text-faint"> · {timeAgo(a.created_at)}</span>
      </span>
    </div>
  )
}
