import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { notify } from '../lib/notify'
import { Modal, Spinner } from './ui'
import { CATEGORY, CATEGORY_ORDER, PRIORITY, PRIORITY_ORDER } from '../lib/constants'
import { isImageFile, imageExt, imageContentType } from '../lib/files'

export function CreateTicketModal({ open, onClose, projectId, onCreated }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('change')
  const [priority, setPriority] = useState('medium')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)

  function reset() {
    setTitle('')
    setDescription('')
    setCategory('change')
    setPriority('medium')
    setFiles([])
    setError('')
  }

  function addFiles(list) {
    const imgs = Array.from(list || []).filter(isImageFile)
    if (imgs.length) setFiles((prev) => [...prev, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
  }

  function onPaste(e) {
    const imgs = Array.from(e.clipboardData?.items || [])
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean)
    if (imgs.length) addFiles(imgs)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data: ticket, error: tErr } = await supabase
        .from('tickets')
        .insert({
          project_id: projectId,
          title: title.trim(),
          description: description.trim() || null,
          category,
          priority,
          created_by: user.id,
        })
        .select()
        .single()
      if (tErr) throw tErr

      // mark my own ticket as read so it isn't "unread" to me
      await supabase.from('ticket_reads').upsert({ ticket_id: ticket.id, user_id: user.id, last_read_at: new Date().toISOString() })

      // upload photos to ticket-media/<ticketId>/...
      for (const { file } of files) {
        const path = `${ticket.id}/${crypto.randomUUID()}.${imageExt(file)}`
        const contentType = imageContentType(file)
        const { error: upErr } = await supabase.storage
          .from('ticket-media')
          .upload(path, file, { contentType })
        if (upErr) throw upErr
        const { error: aErr } = await supabase.from('attachments').insert({
          ticket_id: ticket.id,
          path,
          name: file.name,
          content_type: contentType,
          size: file.size,
          uploaded_by: user.id,
        })
        if (aErr) throw aErr
      }

      notify('ticket_created', ticket.id)
      onCreated?.(ticket)
      reset()
      onClose()
    } catch (err) {
      setError(err.message || 'Ошибка создания тикета')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Новый тикет" width="max-w-xl">
      <form onSubmit={onSubmit} onPaste={onPaste}>
        <label className="label mb-2 block">Что нужно сделать</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Коротко — заголовок тикета"
          className="field mb-5"
        />

        <label className="label mb-2 block">Описание</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Подробности, что и где поправить"
          className="field resize-none mb-5"
        />

        <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="label mb-2 block">Тип</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map((k) => (
                <Chip key={k} active={category === k} onClick={() => setCategory(k)}>
                  {CATEGORY[k].ru}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <label className="label mb-2 block">Приоритет</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_ORDER.map((k) => (
                <Chip key={k} active={priority === k} onClick={() => setPriority(k)} color={PRIORITY[k].text}>
                  {PRIORITY[k].ru}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* photos */}
        <label className="label mb-2 block">Фото</label>
        <div
          onClick={() => fileRef.current?.click()}
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
          className={`mb-2 cursor-pointer border border-dashed px-4 py-6 text-center transition-colors ${
            drag ? 'border-accent bg-accentSoft' : 'border-line2 hover:border-line2'
          }`}
        >
          <span className="label">Перетащите, вставьте (Ctrl+V) или нажмите</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        {files.length > 0 && (
          <div className="mb-5 mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square overflow-hidden border border-line">
                <img src={f.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-0 top-0 bg-bg/80 px-1.5 text-xs text-muted hover:text-accent"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-5 mt-3 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Отмена
          </button>
          <button type="submit" disabled={busy || !title.trim()} className="btn-solid">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : 'Создать тикет'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Chip({ active, onClick, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-1.5 font-mono uppercase tracking-label text-[10px] transition-colors ${
        active ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
      }`}
      style={active && color ? { background: color, borderColor: color, color: '#0A0A0B' } : undefined}
    >
      {children}
    </button>
  )
}
