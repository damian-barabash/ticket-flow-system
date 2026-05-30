import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { notify } from '../lib/notify'
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, CATEGORY, ACTIVITY_RU } from '../lib/constants'
import { formatDate, timeAgo } from '../lib/format'
import { Spinner, Avatar, StatusBadge } from './ui'
import { Lightbox } from './Lightbox'

export function TicketDrawer({ ticketId, members, onClose, onChanged }) {
  const { user, isAdmin } = useAuth()
  const [ticket, setTicket] = useState(null)
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])
  const [atts, setAtts] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState([])
  const [lb, setLb] = useState(null)
  const scrollRef = useRef(null)
  const fileRef = useRef(null)

  const markRead = useCallback(async () => {
    await supabase
      .from('ticket_reads')
      .upsert({ ticket_id: ticketId, user_id: user.id, last_read_at: new Date().toISOString() })
  }, [ticketId, user.id])

  const load = useCallback(async () => {
    const [{ data: t }, { data: cm }, { data: ac }, { data: at }] = await Promise.all([
      supabase.from('tickets').select('*').eq('id', ticketId).single(),
      supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
      supabase.from('ticket_activity').select('*').eq('ticket_id', ticketId).order('created_at'),
      supabase.from('attachments').select('*').eq('ticket_id', ticketId).order('created_at'),
    ])
    setTicket(t)
    setComments(cm ?? [])
    setActivity(ac ?? [])

    // sign private ticket-media paths
    const signed = {}
    const paths = (at ?? []).map((a) => a.path).filter(Boolean)
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('ticket-media').createSignedUrls(paths, 3600)
      ;(urls ?? []).forEach((u) => {
        if (u.path) signed[u.path] = u.signedUrl
      })
    }
    setAtts((at ?? []).map((a) => ({ ...a, signed: signed[a.path] })))

    // involved profiles
    const ids = new Set()
    if (t?.created_by) ids.add(t.created_by)
    if (t?.assigned_to) ids.add(t.assigned_to)
    ;(cm ?? []).forEach((c) => c.author_id && ids.add(c.author_id))
    ;(ac ?? []).forEach((a) => a.actor_id && ids.add(a.actor_id))
    if (ids.size) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name, email').in('id', [...ids])
      const map = {}
      ;(ps ?? []).forEach((p) => (map[p.id] = p))
      setProfiles(map)
    }
    setLoading(false)
  }, [ticketId])

  useEffect(() => {
    setLoading(true)
    load().then(markRead)
    const ch = supabase
      .channel(`ticket-${ticketId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_activity', filter: `ticket_id=eq.${ticketId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `id=eq.${ticketId}` }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ticketId, load, markRead])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [comments.length, activity.length])

  async function setStatus(status) {
    if (!isAdmin || status === ticket.status) return
    await supabase.from('tickets').update({ status }).eq('id', ticketId)
    await markRead()
    notify('status_changed', ticketId, { status })
    onChanged?.()
  }

  async function setPriority(priority) {
    if (!isAdmin || priority === ticket.priority) return
    await supabase.from('tickets').update({ priority }).eq('id', ticketId)
    onChanged?.()
  }

  function addFiles(list) {
    const imgs = Array.from(list || []).filter((f) => f.type.startsWith('image/'))
    if (imgs.length) setFiles((p) => [...p, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
  }

  async function send(e) {
    e.preventDefault()
    if (!body.trim() && files.length === 0) return
    setSending(true)
    try {
      const { data: comment } = await supabase
        .from('ticket_comments')
        .insert({ ticket_id: ticketId, author_id: user.id, body: body.trim() || '(фото)' })
        .select()
        .single()
      for (const { file } of files) {
        const ext = file.name.split('.').pop() || 'png'
        const path = `${ticketId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('ticket-media').upload(path, file, { contentType: file.type })
        if (!upErr) {
          await supabase.from('attachments').insert({
            ticket_id: ticketId,
            comment_id: comment.id,
            path,
            name: file.name,
            content_type: file.type,
            size: file.size,
            uploaded_by: user.id,
          })
        }
      }
      setBody('')
      setFiles([])
      await markRead()
      notify('comment_added', ticketId)
      onChanged?.()
      load()
    } finally {
      setSending(false)
    }
  }

  // unified timeline: comments + non-comment activity
  const timeline = [
    ...comments.map((c) => ({ kind: 'comment', at: c.created_at, data: c })),
    ...activity
      .filter((a) => a.type !== 'commented')
      .map((a) => ({ kind: 'activity', at: a.created_at, data: a })),
  ].sort((x, y) => new Date(x.at) - new Date(y.at))

  const lbImages = atts

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-[560px] flex-col border-l border-line bg-bg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {loading || !ticket ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <>
            {/* header */}
            <div className="border-b border-line p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-faint">
                      № {String(ticket.number).padStart(3, '0')}
                    </span>
                    <span className="label-sm">{CATEGORY[ticket.category]?.ru}</span>
                  </div>
                  <h2 className="text-lg font-semibold leading-snug text-ink">{ticket.title}</h2>
                </div>
                <button onClick={onClose} className="shrink-0 text-faint hover:text-ink" aria-label="Закрыть">
                  ✕
                </button>
              </div>

              {/* status control */}
              <div className="mb-3">
                <span className="label mb-2 block">Статус</span>
                {isAdmin ? (
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_ORDER.map((k) => {
                      const active = ticket.status === k
                      return (
                        <button
                          key={k}
                          onClick={() => setStatus(k)}
                          className="flex items-center gap-1.5 border px-2.5 py-1 font-mono uppercase tracking-label text-[9px] transition-colors"
                          style={
                            active
                              ? { background: STATUS[k].dot, borderColor: STATUS[k].dot, color: '#0A0A0B' }
                              : { borderColor: '#262629', color: '#8A8A92' }
                          }
                        >
                          <span className="inline-block h-1.5 w-1.5" style={{ background: active ? '#0A0A0B' : STATUS[k].dot }} />
                          {STATUS[k].ru}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <StatusBadge status={ticket.status} />
                )}
              </div>

              {/* priority control */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div>
                  <span className="label mb-1.5 block">Приоритет</span>
                  {isAdmin ? (
                    <div className="flex gap-1.5">
                      {PRIORITY_ORDER.map((k) => (
                        <button
                          key={k}
                          onClick={() => setPriority(k)}
                          className="border px-2 py-1 font-mono uppercase tracking-label text-[9px] transition-colors"
                          style={
                            ticket.priority === k
                              ? { background: PRIORITY[k].text, borderColor: PRIORITY[k].text, color: '#0A0A0B' }
                              : { borderColor: '#262629', color: '#8A8A92' }
                          }
                        >
                          {PRIORITY[k].ru}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="font-mono text-[11px]" style={{ color: PRIORITY[ticket.priority]?.text }}>
                      {PRIORITY[ticket.priority]?.ru}
                    </span>
                  )}
                </div>
                <div>
                  <span className="label mb-1.5 block">Автор</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Avatar name={profiles[ticket.created_by]?.full_name} email={profiles[ticket.created_by]?.email} size={20} />
                    {profiles[ticket.created_by]?.full_name || profiles[ticket.created_by]?.email || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* scroll body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
              {ticket.description && (
                <p className="mb-5 whitespace-pre-wrap text-sm text-ink/90">{ticket.description}</p>
              )}

              {/* ticket-level photos (no comment) */}
              <TicketPhotos atts={atts.filter((a) => !a.comment_id)} onOpen={(i) => setLb(i)} all={lbImages} />

              {/* timeline */}
              <div className="mt-2 space-y-4">
                {timeline.map((item, i) =>
                  item.kind === 'comment' ? (
                    <CommentRow
                      key={`c${item.data.id}`}
                      comment={item.data}
                      author={profiles[item.data.author_id]}
                      mine={item.data.author_id === user.id}
                      atts={atts.filter((a) => a.comment_id === item.data.id)}
                      onOpenPhoto={(att) => setLb(lbImages.findIndex((x) => x.id === att.id))}
                    />
                  ) : (
                    <ActivityRow key={`a${item.data.id}`} a={item.data} actor={profiles[item.data.actor_id]} />
                  ),
                )}
              </div>
            </div>

            {/* composer */}
            <form onSubmit={send} className="border-t border-line p-4">
              {files.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative h-14 w-14 overflow-hidden border border-line">
                      <img src={f.url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                        className="absolute right-0 top-0 bg-bg/80 px-1 text-[10px] text-muted hover:text-accent"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="shrink-0 border border-line px-3 py-2.5 text-muted hover:border-line2 hover:text-ink"
                  title="Прикрепить фото"
                >
                  ＋
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onPaste={(e) => {
                    const imgs = Array.from(e.clipboardData?.items || []).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())
                    if (imgs.length) addFiles(imgs)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e)
                  }}
                  rows={1}
                  placeholder="Комментарий…"
                  className="field max-h-32 flex-1 resize-none border border-line px-3 py-2.5"
                />
                <button type="submit" disabled={sending} className="btn-solid shrink-0 px-4 py-2.5">
                  {sending ? <Spinner className="border-bg/40 border-t-bg" /> : 'Отпр.'}
                </button>
              </div>
            </form>
          </>
        )}
      </aside>

      {lb != null && (
        <Lightbox
          images={lbImages}
          index={lb}
          onClose={() => setLb(null)}
          onNav={(d) => setLb((i) => (i + d + lbImages.length) % lbImages.length)}
        />
      )}
    </div>
  )
}

function TicketPhotos({ atts, onOpen, all }) {
  if (!atts.length) return null
  return (
    <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {atts.map((a) => (
        <button
          key={a.id}
          onClick={() => onOpen(all.findIndex((x) => x.id === a.id))}
          className="aspect-square overflow-hidden border border-line"
        >
          {a.signed ? <img src={a.signed} alt="" className="h-full w-full object-cover" /> : <div className="dotgrid h-full w-full" />}
        </button>
      ))}
    </div>
  )
}

function CommentRow({ comment, author, mine, atts, onOpenPhoto }) {
  return (
    <div className={`flex gap-3 ${mine ? 'flex-row-reverse text-right' : ''}`}>
      <Avatar name={author?.full_name} email={author?.email} size={28} />
      <div className={`min-w-0 max-w-[82%] ${mine ? 'items-end' : ''}`}>
        <div className={`mb-1 flex items-center gap-2 ${mine ? 'justify-end' : ''}`}>
          <span className="text-xs text-muted">{mine ? 'Вы' : author?.full_name || author?.email || '—'}</span>
          <span className="label-sm">{timeAgo(comment.created_at)}</span>
        </div>
        <div
          className={`inline-block border px-3 py-2 text-sm ${
            mine ? 'border-accent/30 bg-accentSoft text-ink' : 'border-line bg-surface text-ink/90'
          }`}
        >
          <p className="whitespace-pre-wrap">{comment.body}</p>
        </div>
        {atts.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-2 ${mine ? 'justify-end' : ''}`}>
            {atts.map((a) => (
              <button key={a.id} onClick={() => onOpenPhoto(a)} className="h-16 w-16 overflow-hidden border border-line">
                {a.signed ? <img src={a.signed} alt="" className="h-full w-full object-cover" /> : <div className="dotgrid h-full w-full" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityRow({ a, actor }) {
  const who = actor?.full_name || actor?.email || 'Кто-то'
  let detail = ACTIVITY_RU[a.type] || a.type
  if (a.type === 'status_changed') detail = `сменил статус → ${STATUS[a.to_val]?.ru || a.to_val}`
  if (a.type === 'priority_changed') detail = `приоритет → ${PRIORITY[a.to_val]?.ru || a.to_val}`
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="h-1 w-1 shrink-0 rounded-full bg-line2" />
      <span className="label-sm normal-case tracking-normal text-faint">
        <span className="text-muted">{who}</span> {detail} · {formatDate(a.created_at)}
      </span>
    </div>
  )
}
