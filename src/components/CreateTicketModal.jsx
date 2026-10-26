import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { notify } from '../lib/notify'
import { Check, FormError, Icon, Modal, PriorityBars, Spinner } from './ui'
import { CATEGORY_ORDER, PRIORITY, PRIORITY_ORDER } from '../lib/constants'
import { isImageFile, imageExt, imageContentType } from '../lib/files'
import { uid } from '../lib/realtime'
import { errText } from '../lib/errors'
import { AssigneePicker, assignTicket } from './AssigneePicker'

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plusDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

// New ticket. Duplicate-safe: the ticket row is inserted ONCE per modal session;
// a failed photo upload can be retried without creating a second ticket.
export function CreateTicketModal({ open, onClose, projectId, onCreated }) {
  const { user, isStaff } = useAuth()
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('change')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState(null)
  const [isTask, setIsTask] = useState(false)
  const [files, setFiles] = useState([]) // [{ key, file, url, done }]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)
  const created = useRef(null) // inserted ticket row
  const assigned = useRef(false)
  const filesRef = useRef(files)
  filesRef.current = files

  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  function addFiles(list) {
    const imgs = Array.from(list || []).filter(isImageFile)
    if (imgs.length) setFiles((prev) => [...prev, ...imgs.map((f) => ({ key: uid(), file: f, url: URL.createObjectURL(f), done: false }))])
  }
  function removeFile(key) {
    setFiles((prev) => {
      const f = prev.find((x) => x.key === key)
      if (f) URL.revokeObjectURL(f.url)
      return prev.filter((x) => x.key !== key)
    })
  }

  function onPaste(e) {
    const imgs = Array.from(e.clipboardData?.items || [])
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean)
    if (imgs.length) addFiles(imgs)
  }

  function close() {
    // ticket exists even if some photos failed → the board must show it
    if (created.current) onCreated?.(created.current)
    onClose()
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (busy || !title.trim()) return
    setError('')
    setBusy(true)
    try {
      let row = created.current
      if (!row) {
        const { data, error: tErr } = await supabase
          .from('tickets')
          .insert({
            id: uid(),
            project_id: projectId,
            title: title.trim(),
            description: description.trim() || null,
            category,
            priority,
            due_date: dueDate || null,
            is_task: isTask,
            created_by: user.id,
          })
          .select()
          .single()
        if (tErr) throw tErr
        row = data
        created.current = row
        supabase
          .from('ticket_reads')
          .upsert({ ticket_id: row.id, user_id: user.id, last_read_at: new Date(Date.parse(row.updated_at) + 1).toISOString() })
          .then(() => {})
        notify('ticket_created', row.id)
      }
      if (assignee && !assigned.current) {
        assigned.current = true
        try {
          const r = await assignTicket(row.id, assignee)
          if (r?.error) throw r.error
          row = { ...row, assigned_to: assignee }
          created.current = row
        } catch (err) {
          assigned.current = false
          console.warn('[create] assign failed', err)
        }
      }

      // photos → ticket-media/<ticketId>/…; each file is uploaded at most once
      let failed = 0
      for (const f of filesRef.current) {
        if (f.done) continue
        try {
          const path = `${row.id}/${uid()}.${imageExt(f.file)}`
          const contentType = imageContentType(f.file)
          const { error: upErr } = await supabase.storage.from('ticket-media').upload(path, f.file, { contentType })
          if (upErr) throw upErr
          const { error: aErr } = await supabase.from('attachments').insert({
            ticket_id: row.id,
            path,
            name: f.file.name,
            content_type: contentType,
            size: f.file.size,
            uploaded_by: user.id,
          })
          if (aErr) {
            supabase.storage.from('ticket-media').remove([path])
            throw aErr
          }
          setFiles((xs) => xs.map((x) => (x.key === f.key ? { ...x, done: true } : x)))
          f.done = true
        } catch (err) {
          console.warn('[create] photo failed', err)
          failed++
        }
      }
      if (failed) {
        setError(t('panel.createPartial', { n: failed }))
        return
      }
      onCreated?.(row)
      created.current = null
      onClose()
    } catch (err) {
      setError(errText(t, err, 'createTicket.error'))
    } finally {
      setBusy(false)
    }
  }

  const isCreated = !!created.current
  const pending = files.filter((f) => !f.done).length

  return (
    <Modal open={open} onClose={close} title={t('createTicket.title')} tag={t('panel.newTicketTag')} width="max-w-2xl">
      <form onSubmit={onSubmit} onPaste={onPaste}>
        <label className="field-label" htmlFor="ct-title">
          {t('createTicket.what')}
        </label>
        <input
          id="ct-title"
          required
          autoFocus
          disabled={isCreated}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('createTicket.whatPlaceholder')}
          className="field mb-6 text-[17px]"
          maxLength={300}
        />

        <label className="field-label" htmlFor="ct-desc">
          {t('createTicket.description')}
        </label>
        <textarea
          id="ct-desc"
          disabled={isCreated}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={t('createTicket.descriptionPlaceholder')}
          className="field mb-6 resize-none"
        />

        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="field-label mb-2">{t('createTicket.type')}</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_ORDER.map((k) => (
                <button type="button" key={k} disabled={isCreated} onClick={() => setCategory(k)} className={`chip press ${category === k ? 'chip-on' : ''}`}>
                  {t('enum.category.' + k)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="field-label mb-2">{t('createTicket.priority')}</div>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_ORDER.map((k) => {
                const on = priority === k
                return (
                  <button
                    type="button"
                    key={k}
                    disabled={isCreated}
                    onClick={() => setPriority(k)}
                    className="chip press"
                    style={on ? { background: PRIORITY[k].text, borderColor: PRIORITY[k].text, color: '#0A0A0A' } : { color: PRIORITY[k].text }}
                  >
                    <PriorityBars priority={k} color={on ? '#0A0A0A' : undefined} />
                    {t('enum.priority.' + k)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="field-label mb-2">{t('panel.assignee')}</div>
            <AssigneePicker projectId={projectId} value={assignee} onChange={setAssignee} />
          </div>
          <div>
            <label className="field-label mb-2 block" htmlFor="ct-due">
              {t('createTicket.deadline')}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="ct-due"
                type="date"
                disabled={isCreated}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-box h-10 py-0 [color-scheme:dark]"
              />
              {dueDate && (
                <button type="button" onClick={() => setDueDate('')} className="icon-btn press" aria-label={t('panel.clearDate')}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            {!isCreated && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { l: t('panel.dueToday'), v: plusDays(0) },
                  { l: t('panel.dueTomorrow'), v: plusDays(1) },
                  { l: t('panel.dueWeek'), v: plusDays(7) },
                ].map((d) => (
                  <button type="button" key={d.l} onClick={() => setDueDate(d.v)} className={`chip press ${dueDate === d.v ? 'chip-on' : ''}`} style={{ minHeight: 30 }}>
                    {d.l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* task toggle: admin → for project clients; client → personal task */}
        <button
          type="button"
          disabled={isCreated}
          onClick={() => setIsTask((v) => !v)}
          className={`press mb-6 flex w-full items-start gap-3 border px-4 py-3.5 text-left transition-colors ${
            isTask ? 'border-accent bg-accentSoft' : 'border-line hover:border-line2'
          }`}
        >
          <Check on={isTask} className="mt-0.5" />
          <span className="min-w-0">
            <span className={`block text-[14px] font-semibold uppercase tracking-[0.04em] ${isTask ? 'text-accent' : 'text-ink'}`}>
              {t(isStaff ? 'createTicket.taskToggle' : 'createTicket.taskToggleSelf')}
            </span>
            <span className="mt-1 block text-[14px] text-muted">{t(isStaff ? 'createTicket.taskHint' : 'createTicket.taskHintSelf')}</span>
          </span>
        </button>

        {/* photos */}
        <div className="field-label mb-2">{t('createTicket.photo')}</div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer items-center justify-center gap-3 border border-dashed px-4 py-6 text-center transition-colors ${
            drag ? 'border-accent bg-accentSoft' : 'border-line2 hover:border-ink'
          }`}
        >
          <Icon name="image" size={20} className="text-muted" />
          <span className="text-[14px] text-muted">{t('createTicket.dropzone')}</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {files.map((f) => (
              <div key={f.key} className="relative aspect-square overflow-hidden border border-line">
                <img src={f.url} alt="" className="h-full w-full object-cover" />
                {f.done ? (
                  <span className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center bg-ok text-bg">
                    <Icon name="check" size={14} stroke={2.4} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeFile(f.key)}
                    className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center bg-bg/90 text-ink hover:bg-accent hover:text-white"
                    aria-label={t('ticket.deletePhoto')}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className="btn-ghost">
            {isCreated ? t('common.close') : t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !title.trim()} className="btn-accent">
            {busy ? (
              <Spinner className="border-white/40 border-t-white" />
            ) : isCreated ? (
              <>
                <Icon name="refresh" size={16} /> {t('panel.retryUpload', { n: pending })}
              </>
            ) : (
              <>
                <Icon name="plus" size={16} /> {t('createTicket.submit')}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
