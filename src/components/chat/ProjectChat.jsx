import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useT } from '../../context/LangContext'
import { notifyChat } from '../../lib/notify'
import { markChatRead } from '../../lib/chat'
import { formatSize } from '../../lib/format'
import { isDisplayableImage } from '../../lib/files'
import { usePeople, personName } from '../AssigneePicker'
import { Avatar, Icon, Spinner, ErrorState, useEsc, useConfirm } from '../ui'
import { Lightbox } from '../Lightbox'
import { FileFallback } from '../Thumb'
import { uploadChatFile, signPaths, cachedSigned, removeChatFiles, uuid, MAX_BYTES } from './media'

const PAGE = 50
const GROUP_GAP = 5 * 60 * 1000
const COLS = 'id, project_id, author_id, body, attachments, reply_to, ticket_id, created_at, edited_at, deleted_at'
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const dayKey = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// ticket-number → id cache (per project)
const ticketIds = new Map()
async function resolveTicket(projectId, num) {
  const k = projectId + ':' + num
  if (ticketIds.has(k)) return ticketIds.get(k)
  const { data } = await supabase.from('tickets').select('id').eq('project_id', projectId).eq('number', num).maybeSingle()
  const id = data?.id ?? null
  if (id) ticketIds.set(k, id)
  return id
}

function dayLabel(iso, t, lang) {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (dayKey(d) === dayKey(today)) return t('chat.today')
  if (dayKey(d) === dayKey(y)) return t('chat.yesterday')
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

// Text with clickable URLs and #012 ticket references.
function RichText({ text, onTicket }) {
  const parts = useMemo(() => {
    const out = []
    const re = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(^|[\s(])#(\d{1,6})\b/g
    let last = 0
    let m
    while ((m = re.exec(text))) {
      if (m[1]) {
        out.push(text.slice(last, m.index))
        out.push({ url: m[1] })
        last = m.index + m[1].length
      } else {
        const start = m.index + m[2].length
        out.push(text.slice(last, start))
        out.push({ num: Number(m[3]), raw: '#' + m[3] })
        last = start + 1 + m[3].length
      }
    }
    out.push(text.slice(last))
    return out
  }, [text])
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      p
    ) : p.url ? (
      <a key={i} href={p.url} target="_blank" rel="noreferrer" className="break-all text-ink underline decoration-accent decoration-2 underline-offset-2 hover:text-accent">
        {p.url}
      </a>
    ) : (
      <button
        key={i}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTicket(p.num)
        }}
        className="num border-b-2 border-accent px-0.5 font-semibold text-ink transition-colors hover:bg-accent hover:text-white"
      >
        {p.raw}
      </button>
    ),
  )
}

function Attachments({ items, onOpen, mine }) {
  const { t } = useT()
  const imgs = items.filter((a) => isDisplayableImage(a))
  const files = items.filter((a) => !isDisplayableImage(a))
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {imgs.length > 0 && (
        <div className={`grid gap-1 ${imgs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {imgs.map((a) => {
            const src = a._local || cachedSigned(a.path)
            return (
              <button
                key={a.path || a._local}
                type="button"
                onClick={() => onOpen(a)}
                className={`relative block overflow-hidden border border-line bg-surface2 ${imgs.length === 1 ? 'max-h-[320px] max-w-[320px]' : 'aspect-square w-[150px]'}`}
              >
                {src ? (
                  <img
                    src={src}
                    alt={a.name}
                    loading="lazy"
                    decoding="async"
                    className={imgs.length === 1 ? 'max-h-[320px] w-auto object-contain' : 'h-full w-full object-cover'}
                  />
                ) : (
                  <span className="block h-[120px] w-[160px]">
                    <FileFallback att={a} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {files.map((a) => (
        <button
          key={a.path || a._local}
          type="button"
          onClick={() => onOpen(a)}
          className={`flex max-w-[300px] items-center gap-3 border px-3 py-2 text-left transition-colors ${mine ? 'border-accent/30 hover:border-accent' : 'border-line2 hover:border-ink'}`}
        >
          <Icon name="paperclip" size={18} className="text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] text-ink">{a.name || t('chat.file')}</span>
            <span className="block text-[12px] text-faint">{formatSize(a.size)}</span>
          </span>
          <Icon name="download" size={16} className="text-faint" />
        </button>
      ))}
    </div>
  )
}

const Message = memo(function Message({
  m,
  mine,
  author,
  first,
  last,
  reply,
  replyAuthor,
  active,
  onActivate,
  onReply,
  onEdit,
  onDelete,
  onRetry,
  onDiscard,
  onTicket,
  onOpenAtt,
  onJump,
}) {
  const { t } = useT()
  const deleted = !!m.deleted_at
  const failed = m._status === 'failed'
  const sending = m._status === 'sending'
  return (
    <div
      id={'msg-' + m.id}
      className={`chat-pop group flex gap-2.5 px-4 ${mine ? 'flex-row-reverse' : ''} ${first ? 'mt-3' : 'mt-0.5'}`}
      onClick={() => onActivate(m.id)}
    >
      {!mine && (
        <div className="w-8 shrink-0">{first && <Avatar name={author?.full_name} email={author?.email || '?'} size={32} />}</div>
      )}
      <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {first && !mine && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-ink">{author ? personName(author) : t('chat.someone')}</span>
            {author?.is_owner && <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">{t('assignee.owner')}</span>}
          </div>
        )}
        <div className={`relative flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
          <div
            className={`min-w-0 border px-3 py-2 text-[15px] leading-[1.45] ${
              deleted
                ? 'border-dashed border-line2 bg-transparent text-faint italic'
                : mine
                  ? 'border-accent/35 bg-accent/[0.13] text-ink'
                  : 'border-line bg-surface2 text-ink'
            } ${sending ? 'opacity-70' : ''} ${failed ? 'border-accent' : ''}`}
          >
            {deleted ? (
              <span className="flex items-center gap-1.5 text-[14px]">
                <Icon name="trash" size={14} /> {t('chat.deleted')}
              </span>
            ) : (
              <>
                {m.reply_to && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onJump(m.reply_to)
                    }}
                    className="mb-1.5 block w-full border-l-2 border-accent bg-black/25 px-2 py-1 text-left"
                  >
                    <span className="block text-[12px] font-semibold text-muted">{reply ? (replyAuthor ? personName(replyAuthor) : t('chat.someone')) : '…'}</span>
                    <span className="line-clamp-2 block text-[13px] text-faint">
                      {reply ? (reply.deleted_at ? t('chat.deleted') : reply.body || (reply.attachments?.length ? t('chat.attachment') : '')) : ''}
                    </span>
                  </button>
                )}
                {m.body && (
                  <div className="whitespace-pre-wrap break-words">
                    <RichText text={m.body} onTicket={onTicket} />
                  </div>
                )}
                {m.attachments?.length > 0 && <Attachments items={m.attachments} onOpen={onOpenAtt} mine={mine} />}
              </>
            )}
          </div>
          {/* hover / tap actions */}
          {!deleted && !m._status && (
            <div
              className={`flex shrink-0 gap-0.5 transition-opacity ${active ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}
            >
              <button type="button" className="icon-btn-sm" title={t('chat.reply')} aria-label={t('chat.reply')} onClick={(e) => (e.stopPropagation(), onReply(m))}>
                <Icon name="reply" size={15} />
              </button>
              {mine && (
                <>
                  <button type="button" className="icon-btn-sm" title={t('common.edit')} aria-label={t('common.edit')} onClick={(e) => (e.stopPropagation(), onEdit(m))}>
                    <Icon name="pencil" size={15} />
                  </button>
                  <button type="button" className="icon-btn-sm hover:!text-accent" title={t('common.delete')} aria-label={t('common.delete')} onClick={(e) => (e.stopPropagation(), onDelete(m))}>
                    <Icon name="trash" size={15} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {(last || failed || sending) && (
          <div className={`mt-1 flex items-center gap-2 text-[12px] text-faint ${mine ? 'flex-row-reverse' : ''}`}>
            {failed ? (
              <>
                <span className="text-accent">{t('chat.failed')}</span>
                <button type="button" className="btn-link text-[12px]" onClick={(e) => (e.stopPropagation(), onRetry(m))}>
                  {t('common.retry')}
                </button>
                <button type="button" className="text-muted underline hover:text-ink" onClick={(e) => (e.stopPropagation(), onDiscard(m))}>
                  {t('chat.discard')}
                </button>
              </>
            ) : sending ? (
              <span className="flex items-center gap-1.5">
                <Spinner size={10} /> {t('chat.sending')}
              </span>
            ) : (
              <>
                <span className="num">{hhmm(m.created_at)}</span>
                {m.edited_at && !deleted && <span className="italic">{t('chat.edited')}</span>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

export function ProjectChat({ projectId, projectName, onOpenTicket, onClose, embedded = false }) {
  const { t, lang } = useT()
  const { user } = useAuth()
  const me = user?.id
  const { byId } = usePeople(projectId)
  const confirm = useConfirm()

  const [msgs, setMsgs] = useState([]) // ascending
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [extra, setExtra] = useState({}) // reply targets not in the loaded page
  const [, setSignTick] = useState(0)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([]) // pending: {id, file, preview}
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [active, setActive] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [newBelow, setNewBelow] = useState(0)
  const [lightbox, setLightbox] = useState(null) // {images, index}
  const [toast, setToast] = useState('')

  const scrollRef = useRef(null)
  const taRef = useRef(null)
  const fileRef = useRef(null)
  const atBottom = useRef(true)
  const anchor = useRef(null) // for prepend scroll preservation
  const msgsRef = useRef(msgs)
  msgsRef.current = msgs

  const flash = (s) => {
    setToast(s)
    setTimeout(() => setToast(''), 3200)
  }

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    atBottom.current = true
    setNewBelow(0)
  }, [])

  // sign attachment URLs for a batch of messages
  const signFor = useCallback(async (list) => {
    const paths = []
    list.forEach((m) => (m.attachments || []).forEach((a) => a.path && paths.push(a.path)))
    if (!paths.length) return
    await signPaths(paths)
    setSignTick((x) => x + 1)
  }, [])

  const markRead = useRef(null)
  const scheduleRead = useCallback(() => {
    clearTimeout(markRead.current)
    markRead.current = setTimeout(() => {
      if (document.visibilityState === 'visible') markChatRead(projectId)
    }, 400)
  }, [projectId])

  // initial load
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('project_messages')
      .select(COLS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const list = (data ?? []).reverse()
    setMsgs(list)
    setHasMore((data ?? []).length === PAGE)
    setLoading(false)
    signFor(list)
    markChatRead(projectId)
    requestAnimationFrame(() => scrollToBottom())
  }, [projectId, signFor, scrollToBottom])

  useEffect(() => {
    setMsgs([])
    setExtra({})
    setReplyTo(null)
    setEditing(null)
    load()
  }, [load])

  // realtime: patch from payload
  useEffect(() => {
    if (!projectId) return
    const name = `chat-${projectId}-${Math.random().toString(36).slice(2)}`
    const ch = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_messages', filter: `project_id=eq.${projectId}` }, (p) => {
        if (p.eventType === 'DELETE') {
          setMsgs((xs) => xs.filter((x) => x.id !== p.old?.id))
          return
        }
        const row = p.new
        if (!row?.id) return
        setMsgs((xs) => {
          const i = xs.findIndex((x) => x.id === row.id)
          if (i >= 0) {
            const copy = xs.slice()
            const keepLocal = xs[i]._status === 'sending'
            copy[i] = keepLocal ? { ...xs[i], ...row, attachments: xs[i].attachments } : { ...row }
            return copy
          }
          if (p.eventType !== 'INSERT') return xs
          return [...xs, row].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        })
        if (p.eventType === 'INSERT') signFor([row])
        if (p.eventType === 'INSERT' && row.author_id !== me) {
          if (atBottom.current) requestAnimationFrame(() => scrollToBottom(true))
          else setNewBelow((n) => n + 1)
          if (document.hasFocus()) scheduleRead()
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [projectId, me, signFor, scrollToBottom, scheduleRead])

  // mark read on focus / visibility
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && scheduleRead()
    window.addEventListener('focus', on)
    document.addEventListener('visibilitychange', on)
    return () => {
      window.removeEventListener('focus', on)
      document.removeEventListener('visibilitychange', on)
      clearTimeout(markRead.current)
    }
  }, [scheduleRead])

  // lazily fetch reply targets that are not loaded
  useEffect(() => {
    const have = new Set(msgs.map((m) => m.id))
    const missing = [...new Set(msgs.map((m) => m.reply_to).filter((id) => id && !have.has(id) && !(id in extra)))]
    if (!missing.length) return
    setExtra((e) => ({ ...e, ...Object.fromEntries(missing.map((id) => [id, null])) }))
    supabase
      .from('project_messages')
      .select(COLS)
      .in('id', missing)
      .then(({ data }) => {
        if (data?.length) setExtra((e) => ({ ...e, ...Object.fromEntries(data.map((r) => [r.id, r])) }))
      })
  }, [msgs, extra])

  async function loadOlder() {
    if (loadingOlder || !hasMore || !msgs.length) return
    setLoadingOlder(true)
    const oldest = msgs.find((m) => !m._status) || msgs[0]
    const { data, error: err } = await supabase
      .from('project_messages')
      .select(COLS)
      .eq('project_id', projectId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    setLoadingOlder(false)
    if (err) return flash(t('common.loadError'))
    const el = scrollRef.current
    anchor.current = el ? { h: el.scrollHeight, top: el.scrollTop } : null
    const older = (data ?? []).reverse()
    setHasMore((data ?? []).length === PAGE)
    setMsgs((xs) => {
      const ids = new Set(xs.map((x) => x.id))
      return [...older.filter((x) => !ids.has(x.id)), ...xs]
    })
    signFor(older)
  }

  useLayoutEffect(() => {
    const a = anchor.current
    const el = scrollRef.current
    if (a && el) {
      el.scrollTop = el.scrollHeight - a.h + a.top
      anchor.current = null
    }
  }, [msgs])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottom.current = near
    if (near && newBelow) {
      setNewBelow(0)
      scheduleRead()
    }
    if (el.scrollTop < 120) loadOlder()
  }

  // keep pinned to the bottom when images finish loading
  const onMediaLoad = useCallback(() => {
    if (atBottom.current) scrollToBottom()
  }, [scrollToBottom])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const h = (e) => e.target.tagName === 'IMG' && onMediaLoad()
    el.addEventListener('load', h, true)
    return () => el.removeEventListener('load', h, true)
  }, [onMediaLoad, loading])

  // ── composer ──
  function addFiles(list) {
    const arr = Array.from(list || [])
    if (!arr.length) return
    const ok = []
    for (const f of arr) {
      if (f.size > MAX_BYTES) {
        flash(t('chat.tooBig', { name: f.name }))
        continue
      }
      const isImg = (f.type || '').startsWith('image/') && isDisplayableImage(f)
      ok.push({ id: uuid(), file: f, preview: isImg ? URL.createObjectURL(f) : null })
    }
    setFiles((xs) => [...xs, ...ok].slice(0, 10))
    taRef.current?.focus()
  }
  function removePending(id) {
    setFiles((xs) => {
      const f = xs.find((x) => x.id === id)
      if (f?.preview) URL.revokeObjectURL(f.preview)
      return xs.filter((x) => x.id !== id)
    })
  }

  function autosize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(200, ta.scrollHeight) + 'px'
  }
  useLayoutEffect(autosize, [text])

  async function deliver(msg, pending) {
    // upload attachments then insert (id generated client-side → realtime merge is idempotent)
    try {
      let atts = msg._uploaded || []
      if (pending?.length && !atts.length) {
        atts = await Promise.all(pending.map((p) => uploadChatFile(projectId, p.file)))
        msg._uploaded = atts
        await signPaths(atts.map((a) => a.path))
      }
      const row = { id: msg.id, project_id: projectId, body: msg.body, attachments: atts, reply_to: msg.reply_to }
      const { data, error: err } = await supabase.from('project_messages').insert(row).select(COLS).single()
      if (err && err.code !== '23505') throw err
      setMsgs((xs) => xs.map((x) => (x.id === msg.id ? { ...(data || x), _status: undefined, _pending: undefined, _uploaded: undefined } : x)))
      ;(pending || []).forEach((p) => p.preview && setTimeout(() => URL.revokeObjectURL(p.preview), 5000))
      markChatRead(projectId)
      notifyChat(msg.id)
    } catch {
      setMsgs((xs) => xs.map((x) => (x.id === msg.id ? { ...x, _status: 'failed', _uploaded: msg._uploaded } : x)))
    }
  }

  async function send() {
    const body = text.trim()
    if (editing) return saveEdit()
    if (!body && !files.length) return
    const id = uuid()
    const pending = files
    const msg = {
      id,
      project_id: projectId,
      author_id: me,
      body,
      reply_to: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
      attachments: pending.map((p) => ({
        _local: p.preview,
        name: p.file.name,
        size: p.file.size,
        content_type: p.file.type || 'application/octet-stream',
      })),
      _status: 'sending',
      _pending: pending,
    }
    setMsgs((xs) => [...xs, msg])
    setText('')
    setFiles([])
    setReplyTo(null)
    requestAnimationFrame(() => scrollToBottom(true))
    deliver(msg, pending)
  }
  function retry(m) {
    setMsgs((xs) => xs.map((x) => (x.id === m.id ? { ...x, _status: 'sending' } : x)))
    deliver(m, m._pending)
  }
  function discard(m) {
    if (m._uploaded?.length) removeChatFiles(m._uploaded.map((a) => a.path))
    setMsgs((xs) => xs.filter((x) => x.id !== m.id))
  }

  function startEdit(m) {
    setEditing(m)
    setReplyTo(null)
    setText(m.body || '')
    setActive(null)
    requestAnimationFrame(() => {
      taRef.current?.focus()
      const l = taRef.current?.value.length ?? 0
      taRef.current?.setSelectionRange(l, l)
    })
  }
  function cancelEdit() {
    setEditing(null)
    setText('')
  }
  async function saveEdit() {
    const m = editing
    const body = text.trim()
    if (!m) return
    if (!body && !m.attachments?.length) return
    if (body === (m.body || '')) return cancelEdit()
    const prev = msgsRef.current.find((x) => x.id === m.id)
    const edited_at = new Date().toISOString()
    setMsgs((xs) => xs.map((x) => (x.id === m.id ? { ...x, body, edited_at } : x)))
    setEditing(null)
    setText('')
    const { error: err } = await supabase.from('project_messages').update({ body, edited_at }).eq('id', m.id)
    if (err) {
      setMsgs((xs) => xs.map((x) => (x.id === m.id ? prev : x)))
      flash(t('common.error'))
    }
  }
  async function remove(m) {
    if (!(await confirm({ title: t('chat.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
    const prev = msgsRef.current.find((x) => x.id === m.id)
    const deleted_at = new Date().toISOString()
    setMsgs((xs) => xs.map((x) => (x.id === m.id ? { ...x, deleted_at, body: '', attachments: [] } : x)))
    setActive(null)
    if (editing?.id === m.id) cancelEdit()
    const { error: err } = await supabase.from('project_messages').update({ deleted_at, body: '', attachments: [] }).eq('id', m.id)
    if (err) {
      setMsgs((xs) => xs.map((x) => (x.id === m.id ? prev : x)))
      flash(t('common.error'))
    } else if (prev?.attachments?.length) removeChatFiles(prev.attachments.map((a) => a.path).filter(Boolean))
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault()
      send()
    } else if (e.key === 'ArrowUp' && !text && !editing) {
      const mine = [...msgsRef.current].reverse().find((x) => x.author_id === me && !x.deleted_at && !x._status)
      if (mine) {
        e.preventDefault()
        startEdit(mine)
      }
    }
  }
  function onPaste(e) {
    const items = Array.from(e.clipboardData?.files || [])
    if (items.length) {
      e.preventDefault()
      addFiles(items)
    }
  }

  // Esc: cancel edit / reply first, then close the chat
  useEsc(() => {
    if (lightbox) return
    if (editing) cancelEdit()
    else if (replyTo) setReplyTo(null)
    else if (active) setActive(null)
    else onClose?.()
  }, true)

  const openTicket = useCallback(
    async (num) => {
      const id = await resolveTicket(projectId, num)
      if (id) onOpenTicket?.(id)
      else flash(t('chat.noTicket', { n: '#' + String(num).padStart(3, '0') }))
    },
    [projectId, onOpenTicket, t],
  )

  const openAtt = useCallback(
    async (msg, att) => {
      const atts = msg.attachments || []
      const paths = atts.map((a) => a.path).filter(Boolean)
      const urls = paths.length ? await signPaths(paths) : {}
      const withUrl = atts.map((a) => ({ ...a, signed: a._local || urls[a.path] }))
      if (!isDisplayableImage(att)) {
        const u = att._local || urls[att.path]
        if (u) window.open(u, '_blank', 'noreferrer')
        return
      }
      const images = withUrl.filter((a) => isDisplayableImage(a))
      const index = Math.max(0, images.findIndex((a) => (a.path || a._local) === (att.path || att._local)))
      setLightbox({ images, index })
    },
    [],
  )

  const jumpTo = useCallback((id) => {
    const el = document.getElementById('msg-' + id)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('chat-flash')
    setTimeout(() => el.classList.remove('chat-flash'), 1200)
  }, [])

  const all = useMemo(() => {
    const m = { ...extra }
    msgs.forEach((x) => (m[x.id] = x))
    return m
  }, [msgs, extra])

  const handlers = useMemo(
    () => ({
      onActivate: (id) => setActive((a) => (a === id ? null : id)),
      onReply: (m) => {
        setReplyTo(m)
        setEditing(null)
        setActive(null)
        taRef.current?.focus()
      },
    }),
    [],
  )

  // render rows with day separators + grouping
  const rows = []
  let prev = null
  msgs.forEach((m, i) => {
    const next = msgs[i + 1]
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
    if (newDay)
      rows.push(
        <div key={'d' + m.id} className="my-4 flex items-center gap-3 px-4">
          <span className="h-px flex-1 bg-line" />
          <span className="label">{dayLabel(m.created_at, t, lang)}</span>
          <span className="h-px flex-1 bg-line" />
        </div>,
      )
    const first =
      newDay || prev.author_id !== m.author_id || new Date(m.created_at) - new Date(prev.created_at) > GROUP_GAP || !!m.reply_to
    const last =
      !next ||
      next.author_id !== m.author_id ||
      dayKey(next.created_at) !== dayKey(m.created_at) ||
      new Date(next.created_at) - new Date(m.created_at) > GROUP_GAP ||
      !!next.reply_to
    const reply = m.reply_to ? all[m.reply_to] : null
    rows.push(
      <Message
        key={m.id}
        m={m}
        mine={m.author_id === me}
        author={byId[m.author_id]}
        first={first}
        last={last}
        reply={reply}
        replyAuthor={reply ? byId[reply.author_id] : null}
        active={active === m.id}
        onActivate={handlers.onActivate}
        onReply={handlers.onReply}
        onEdit={startEdit}
        onDelete={remove}
        onRetry={retry}
        onDiscard={discard}
        onTicket={openTicket}
        onOpenAtt={(a) => openAtt(m, a)}
        onJump={jumpTo}
      />,
    )
    prev = m
  })

  const canSend = editing ? !!text.trim() || editing.attachments?.length : !!text.trim() || files.length > 0
  const shell = embedded
    ? 'relative flex h-full min-h-0 flex-col bg-bg'
    : 'chat-page fixed inset-0 z-[60] flex flex-col bg-bg'

  return (
    <section
      className={shell}
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        addFiles(e.dataTransfer?.files)
      }}
      aria-label={t('chat.title')}
    >
      <style>{CHAT_CSS}</style>
      {/* header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        {!embedded && (
          <button onClick={onClose} className="icon-btn" aria-label={t('common.back')}>
            <Icon name="back" size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="tag">{t('chat.title')}</div>
          {projectName && <div className="mt-0.5 truncate text-[14px] text-muted">{projectName}</div>}
        </div>
        {embedded && (
          <button onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
            <Icon name="close" size={18} />
          </button>
        )}
      </header>

      {/* messages */}
      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3" onClick={() => setActive(null)}>
        {loading ? (
          <div className="space-y-4 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex gap-2.5 ${i % 2 ? 'flex-row-reverse' : ''}`}>
                {i % 2 === 0 && <div className="h-8 w-8 animate-pulse bg-surface2" />}
                <div className="h-12 animate-pulse bg-surface2" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <ErrorState onRetry={load} onClose={onClose} />
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center border border-line2 text-accent">
              <Icon name="chat" size={26} />
            </div>
            <div className="display mt-5 text-[28px] text-ink">{t('chat.emptyTitle')}</div>
            <p className="mt-2 max-w-xs text-[14px] text-muted">{t('chat.emptyHint')}</p>
            <button
              className="btn-ghost btn-sm mt-5"
              onClick={(e) => {
                e.stopPropagation()
                setText(t('chat.hiText'))
                taRef.current?.focus()
              }}
            >
              {t('chat.sayHi')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-10 items-center justify-center">
              {loadingOlder ? <Spinner /> : !hasMore && <span className="label-sm">{t('chat.start')}</span>}
            </div>
            {rows}
          </>
        )}
      </div>

      {newBelow > 0 && (
        <button
          onClick={() => {
            scrollToBottom(true)
            scheduleRead()
          }}
          className="absolute bottom-[96px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 bg-accent px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg"
        >
          <Icon name="down" size={14} /> {t('chat.newMessages', { n: newBelow })}
        </button>
      )}

      {toast && (
        <div className="pop absolute inset-x-4 bottom-[96px] z-10 mx-auto max-w-sm border border-line2 bg-surface2 px-3 py-2 text-center text-[13px] text-ink">
          {toast}
        </div>
      )}

      {/* composer */}
      <div className="shrink-0 border-t border-line bg-surface" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {(replyTo || editing) && (
          <div className="flex items-center gap-3 border-b border-line px-4 py-2">
            <Icon name={editing ? 'pencil' : 'reply'} size={16} className="text-accent" />
            <div className="min-w-0 flex-1 border-l-2 border-accent pl-2">
              <div className="text-[12px] font-semibold text-muted">
                {editing ? t('chat.editing') : t('chat.replyingTo', { name: personName(byId[replyTo.author_id]) })}
              </div>
              <div className="truncate text-[13px] text-faint">{(editing || replyTo).body || t('chat.attachment')}</div>
            </div>
            <button className="icon-btn-sm" onClick={() => (editing ? cancelEdit() : setReplyTo(null))} aria-label={t('common.cancel')}>
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
            {files.map((f) => (
              <div key={f.id} className="relative h-16 w-16 shrink-0 border border-line2 bg-surface2">
                {f.preview ? (
                  <img src={f.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-1 text-center">
                    <Icon name="paperclip" size={16} className="text-muted" />
                    <span className="mt-1 w-full truncate text-[11px] text-faint">{f.file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removePending(f.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center bg-ink text-bg"
                  aria-label={t('common.delete')}
                >
                  <Icon name="close" size={12} stroke={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-3">
          {!editing && (
            <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label={t('chat.attach')} title={t('chat.attach')}>
              <Icon name="paperclip" size={18} />
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            maxLength={8000}
            placeholder={t('chat.placeholder')}
            className="input-box min-h-[40px] flex-1 resize-none py-2 leading-[1.4]"
            style={{ maxHeight: 200 }}
          />
          <button
            className="btn-accent h-10 min-h-0 w-12 px-0"
            onClick={send}
            disabled={!canSend}
            aria-label={editing ? t('common.save') : t('chat.send')}
            title={editing ? t('common.save') : t('chat.send')}
          >
            <Icon name={editing ? 'check' : 'send'} size={18} />
          </button>
        </div>
        <div className="hidden px-4 pb-2 text-[12px] text-faint sm:block">{t('chat.hint')}</div>
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-accent bg-black/70">
          <div className="flex flex-col items-center gap-2 text-ink">
            <Icon name="upload" size={30} className="text-accent" />
            <span className="tag">{t('chat.dropHere')}</span>
          </div>
        </div>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNav={(d) => setLightbox((l) => (l ? { ...l, index: (l.index + d + l.images.length) % l.images.length } : l))}
        />
      )}
    </section>
  )
}

const CHAT_CSS = `
@keyframes chatPop { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
.chat-pop { animation: chatPop 160ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes chatPage { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
.chat-page { animation: chatPage 160ms cubic-bezier(.2,.8,.2,1) both; }
.chat-flash > div { outline: 2px solid rgb(var(--c-accent)); outline-offset: 2px; transition: outline-color 1s; }
@media (prefers-reduced-motion: reduce) { .chat-pop, .chat-page { animation: none } }
`

export default ProjectChat
