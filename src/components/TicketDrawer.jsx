import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { notify } from '../lib/notify'
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER } from '../lib/constants'
import { formatDate, timeAgo } from '../lib/format'
import { Spinner, Avatar, StatusBadge } from './ui'
import { Lightbox } from './Lightbox'
import { Thumb } from './Thumb'
import { isImageFile, imageExt, imageContentType } from '../lib/files'

export function TicketDrawer({ ticketId, members, onClose, onChanged }) {
  const { user, isStaff } = useAuth()
  const { t } = useT()
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
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [relVersions, setRelVersions] = useState([])
  const [fixModal, setFixModal] = useState(false)
  const [fixInput, setFixInput] = useState('')
  const [savingFix, setSavingFix] = useState(false)
  const [savingClientStatus, setSavingClientStatus] = useState(false)
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const addPhotoRef = useRef(null)

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

    // existing release versions of this project → datalist suggestions for "fixed in version"
    if (t?.project_id) {
      const { data: rels } = await supabase
        .from('project_releases')
        .select('version')
        .eq('project_id', t.project_id)
        .not('version', 'is', null)
        .order('created_at', { ascending: false })
      setRelVersions([...new Set((rels ?? []).map((r) => r.version).filter(Boolean))])
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
    if (!isStaff || status === ticket.status) return
    // marking done → ask which project version fixes it (optional)
    if (status === 'done') {
      setFixInput(ticket.fixed_version || '')
      setFixModal(true)
      return
    }
    await supabase.from('tickets').update({ status }).eq('id', ticketId)
    await markRead()
    notify('status_changed', ticketId, { status })
    onChanged?.()
  }

  // confirm "done" with an optional fixed-in version; also used to edit the version later
  async function confirmDone(e) {
    e?.preventDefault()
    setSavingFix(true)
    const version = fixInput.trim() || null
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'done', fixed_version: version })
        .eq('id', ticketId)
      if (error) throw error
      setFixModal(false)
      await markRead()
      notify('status_changed', ticketId, { status: 'done', fixed_version: version })
      onChanged?.()
      load()
    } catch (err) {
      alert((err.message || err))
    } finally {
      setSavingFix(false)
    }
  }

  function openVersionEditor() {
    setFixInput(ticket.fixed_version || '')
    setFixModal(true)
  }

  // Client-side status toggle for admin-assigned task tickets (mark done / reopen).
  // No version prompt — fixed_version is an admin concept.
  async function clientSetStatus(status) {
    if (isStaff || !ticket.is_task || status === ticket.status) return
    setSavingClientStatus(true)
    try {
      const { error } = await supabase.from('tickets').update({ status }).eq('id', ticketId)
      if (error) throw error
      await markRead()
      notify('status_changed', ticketId, { status })
      onChanged?.()
      load()
    } catch (err) {
      alert(err.message || err)
    } finally {
      setSavingClientStatus(false)
    }
  }

  async function setPriority(priority) {
    if (!isStaff || priority === ticket.priority) return
    await supabase.from('tickets').update({ priority }).eq('id', ticketId)
    onChanged?.()
  }

  function addFiles(list) {
    const imgs = Array.from(list || []).filter(isImageFile)
    if (imgs.length) setFiles((p) => [...p, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
  }

  // upload one image to ticket-media/<ticketId>/... and return its DB attachment payload
  async function uploadOne(file, commentId = null) {
    const path = `${ticketId}/${crypto.randomUUID()}.${imageExt(file)}`
    const contentType = imageContentType(file)
    const { error: upErr } = await supabase.storage.from('ticket-media').upload(path, file, { contentType })
    if (upErr) throw upErr
    const { error: aErr } = await supabase.from('attachments').insert({
      ticket_id: ticketId,
      comment_id: commentId,
      path,
      name: file.name,
      content_type: contentType,
      size: file.size,
      uploaded_by: user.id,
    })
    if (aErr) throw aErr
  }

  // add ticket-level photos (no comment) directly to an existing ticket
  async function addTicketPhotos(list) {
    const imgs = Array.from(list || []).filter(isImageFile)
    if (!imgs.length) return
    setUploadingPhotos(true)
    try {
      for (const file of imgs) await uploadOne(file)
      await markRead()
      onChanged?.()
      await load()
    } catch (err) {
      alert(t('ticket.errUploadPhoto') + (err.message || err))
    } finally {
      setUploadingPhotos(false)
      if (addPhotoRef.current) addPhotoRef.current.value = ''
    }
  }

  const canDeletePhoto = useCallback((a) => isStaff || a.uploaded_by === user.id, [isStaff, user.id])

  // delete a single attachment: storage object first, then the DB row
  async function deletePhoto(att) {
    if (!canDeletePhoto(att)) return
    if (!confirm(t('ticket.confirmDeletePhoto'))) return
    setAtts((p) => p.map((a) => (a.id === att.id ? { ...a, deleting: true } : a)))
    try {
      if (att.path) await supabase.storage.from('ticket-media').remove([att.path])
      const { error } = await supabase.from('attachments').delete().eq('id', att.id)
      if (error) throw error
      setAtts((p) => p.filter((a) => a.id !== att.id))
      onChanged?.()
    } catch (err) {
      alert(t('ticket.errDeletePhoto') + (err.message || err))
      setAtts((p) => p.map((a) => (a.id === att.id ? { ...a, deleting: false } : a)))
    }
  }

  async function deleteTicket() {
    if (!isStaff) return
    if (!confirm(t('ticket.confirmDeleteTicket', { title: ticket.title }))) return
    setDeleting(true)
    try {
      // remove storage objects first (DB cascade won't touch the bucket)
      const paths = atts.map((a) => a.path).filter(Boolean)
      if (paths.length) await supabase.storage.from('ticket-media').remove(paths)
      const { error } = await supabase.from('tickets').delete().eq('id', ticketId)
      if (error) throw error
      onChanged?.()
      onClose()
    } catch (err) {
      alert(t('ticket.errDeleteTicket') + (err.message || err))
      setDeleting(false)
    }
  }

  async function send(e) {
    e?.preventDefault()
    if (!body.trim() && files.length === 0) return
    setSending(true)
    try {
      const { data: comment } = await supabase
        .from('ticket_comments')
        .insert({ ticket_id: ticketId, author_id: user.id, body: body.trim() || t('ticket.photoFallback') })
        .select()
        .single()
      for (const { file } of files) await uploadOne(file, comment.id)
      setBody('')
      setFiles([])
      await markRead()
      notify('comment_added', ticketId)
      onChanged?.()
      load()
    } catch (err) {
      alert(t('ticket.errSend') + (err.message || err))
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
   <>
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
                    <span className="label-sm">{t('enum.category.' + ticket.category)}</span>
                    {ticket.is_task && (
                      <span
                        className={`flex items-center gap-1 px-1.5 py-0.5 font-mono uppercase tracking-label text-[9px] ${
                          !isStaff ? 'bg-accent text-bg' : 'border border-accent/40 text-accent'
                        }`}
                      >
                        ★ {!isStaff ? t('ticket.taskForYou') : t('ticket.taskForClient')}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold leading-snug text-ink">{ticket.title}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isStaff && (
                    <button
                      onClick={deleteTicket}
                      disabled={deleting}
                      className="px-1.5 text-faint transition-colors hover:text-accent disabled:opacity-50"
                      title={t('ticket.deleteTicket')}
                      aria-label={t('ticket.deleteTicket')}
                    >
                      {deleting ? <Spinner className="h-3.5 w-3.5" /> : '🗑'}
                    </button>
                  )}
                  <button onClick={onClose} className="px-1.5 text-faint hover:text-ink" aria-label={t('common.close')}>
                    ✕
                  </button>
                </div>
              </div>

              {/* status control */}
              <div className="mb-3">
                <span className="label mb-2 block">{t('ticket.status')}</span>
                {isStaff ? (
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
                          {t('enum.status.' + k)}
                        </button>
                      )
                    })}
                  </div>
                ) : ticket.is_task ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={ticket.status} />
                    {ticket.status !== 'done' ? (
                      <button
                        onClick={() => clientSetStatus('done')}
                        disabled={savingClientStatus}
                        className="btn-solid px-3 py-1.5 text-[11px] disabled:opacity-50"
                      >
                        {savingClientStatus ? <Spinner className="border-bg/40 border-t-bg" /> : t('ticket.taskDoneClient')}
                      </button>
                    ) : (
                      <button
                        onClick={() => clientSetStatus('in_progress')}
                        disabled={savingClientStatus}
                        className="label text-muted transition-colors hover:text-ink disabled:opacity-50"
                      >
                        {t('ticket.reopen')}
                      </button>
                    )}
                  </div>
                ) : (
                  <StatusBadge status={ticket.status} />
                )}
              </div>

              {/* fixed-in version (shown once done) */}
              {ticket.status === 'done' && (
                <div className="mb-3">
                  <span className="label mb-1.5 block">{t('ticket.fixedVersion')}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {ticket.fixed_version ? (
                      <span
                        className="inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px]"
                        style={{ borderColor: 'rgba(63,185,80,0.4)', color: '#3FB950' }}
                      >
                        <span>✓</span>
                        {ticket.fixed_version}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-faint">{t('ticket.noVersion')}</span>
                    )}
                    {isStaff && (
                      <button onClick={openVersionEditor} className="label text-muted transition-colors hover:text-ink">
                        {t('ticket.editVersion')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* priority control */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div>
                  <span className="label mb-1.5 block">{t('ticket.priority')}</span>
                  {isStaff ? (
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
                          {t('enum.priority.' + k)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="font-mono text-[11px]" style={{ color: PRIORITY[ticket.priority]?.text }}>
                      {t('enum.priority.' + ticket.priority)}
                    </span>
                  )}
                </div>
                <div>
                  <span className="label mb-1.5 block">{t('ticket.author')}</span>
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
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label">{t('ticket.photos')}</span>
                  <button
                    type="button"
                    onClick={() => addPhotoRef.current?.click()}
                    disabled={uploadingPhotos}
                    className="label flex items-center gap-1.5 text-muted transition-colors hover:text-ink disabled:opacity-50"
                  >
                    {uploadingPhotos ? <Spinner className="h-3 w-3" /> : '＋'} {t('ticket.addPhoto')}
                  </button>
                  <input
                    ref={addPhotoRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addTicketPhotos(e.target.files)}
                  />
                </div>
                <TicketPhotos
                  atts={atts.filter((a) => !a.comment_id)}
                  onOpen={(i) => setLb(i)}
                  all={lbImages}
                  canDelete={canDeletePhoto}
                  onDelete={deletePhoto}
                />
              </div>

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
                      canDelete={canDeletePhoto}
                      onDelete={deletePhoto}
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
                  title={t('ticket.attachPhoto')}
                >
                  ＋
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onPaste={(e) => {
                    const imgs = Array.from(e.clipboardData?.items || []).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean)
                    if (imgs.length) addFiles(imgs)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      send(e)
                    }
                  }}
                  rows={1}
                  placeholder={t('ticket.composerPlaceholder')}
                  className="field max-h-32 flex-1 resize-none border border-line px-3 py-2.5"
                />
                <button type="submit" disabled={sending} className="btn-solid shrink-0 px-4 py-2.5">
                  {sending ? <Spinner className="border-bg/40 border-t-bg" /> : t('ticket.send')}
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

    {/* "fixed in version" prompt — sits above the drawer (z-70) */}
    {fixModal && (
      <div
        className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-12 backdrop-blur-sm"
        onMouseDown={() => !savingFix && setFixModal(false)}
      >
        <form
          onSubmit={confirmDone}
          onMouseDown={(e) => e.stopPropagation()}
          className="brackets relative w-full max-w-sm border border-line bg-surface p-7"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-mono uppercase tracking-label text-[12px] text-ink">{t('ticket.fixVersionTitle')}</h2>
            <button
              type="button"
              onClick={() => setFixModal(false)}
              className="font-mono text-faint transition-colors hover:text-ink"
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          <p className="mb-4 text-sm text-faint">{t('ticket.fixVersionHint')}</p>
          <label className="label mb-1.5 block">{t('common.version')}</label>
          <input
            list="fix-version-list"
            autoFocus
            value={fixInput}
            onChange={(e) => setFixInput(e.target.value)}
            placeholder={t('ticket.fixVersionPlaceholder')}
            className="field w-full border border-line px-3 py-2.5"
          />
          <datalist id="fix-version-list">
            {relVersions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setFixModal(false)} disabled={savingFix} className="btn-ghost px-4 py-2.5">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={savingFix} className="btn-solid px-4 py-2.5">
              {savingFix ? <Spinner className="border-bg/40 border-t-bg" /> : t('ticket.markDone')}
            </button>
          </div>
        </form>
      </div>
    )}
   </>
  )
}

function PhotoDeleteBtn({ att, onDelete }) {
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onDelete(att)
      }}
      disabled={att.deleting}
      className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center bg-bg/85 text-[10px] text-muted opacity-100 transition-opacity hover:text-accent disabled:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      title={t('ticket.deletePhoto')}
      aria-label={t('ticket.deletePhoto')}
    >
      {att.deleting ? <Spinner className="h-3 w-3" /> : '✕'}
    </button>
  )
}

function TicketPhotos({ atts, onOpen, all, canDelete, onDelete }) {
  if (!atts.length) return null
  return (
    <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {atts.map((a) => (
        <div key={a.id} className="group relative aspect-square overflow-hidden border border-line">
          <button onClick={() => onOpen(all.findIndex((x) => x.id === a.id))} className="h-full w-full">
            <Thumb att={a} />
          </button>
          {canDelete?.(a) && <PhotoDeleteBtn att={a} onDelete={onDelete} />}
        </div>
      ))}
    </div>
  )
}

function CommentRow({ comment, author, mine, atts, onOpenPhoto, canDelete, onDelete }) {
  const { t } = useT()
  return (
    <div className={`flex gap-3 ${mine ? 'flex-row-reverse text-right' : ''}`}>
      <Avatar name={author?.full_name} email={author?.email} size={28} />
      <div className={`min-w-0 max-w-[82%] ${mine ? 'items-end' : ''}`}>
        <div className={`mb-1 flex items-center gap-2 ${mine ? 'justify-end' : ''}`}>
          <span className="text-xs text-muted">{mine ? t('ticket.you') : author?.full_name || author?.email || '—'}</span>
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
              <div key={a.id} className="group relative h-16 w-16 overflow-hidden border border-line">
                <button onClick={() => onOpenPhoto(a)} className="h-full w-full">
                  <Thumb att={a} />
                </button>
                {canDelete?.(a) && <PhotoDeleteBtn att={a} onDelete={onDelete} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityRow({ a, actor }) {
  const { t } = useT()
  const who = actor?.full_name || actor?.email || t('ticket.someone')
  let detail = t('enum.activity.' + a.type)
  if (a.type === 'status_changed') detail = t('ticket.actStatusTo', { v: STATUS[a.to_val] ? t('enum.status.' + a.to_val) : a.to_val })
  if (a.type === 'priority_changed') detail = t('ticket.actPriorityTo', { v: PRIORITY[a.to_val] ? t('enum.priority.' + a.to_val) : a.to_val })
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="h-1 w-1 shrink-0 rounded-full bg-line2" />
      <span className="label-sm normal-case tracking-normal text-faint">
        <span className="text-muted">{who}</span> {detail} · {formatDate(a.created_at)}
      </span>
    </div>
  )
}
