import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatSize } from '../lib/format'
import { Modal, Spinner } from './ui'

// strip the extension to use a file's name as a default title
const baseName = (n) => n.replace(/\.[^.]+$/, '')

// Add one or more project "releases" at once — any mix of files and links.
// Each item carries an optional title + version. (Admin only.)
export function ReleaseFormModal({ open, onClose, onSaved, projectId, initial = 'file' }) {
  const { user } = useAuth()
  const [fileItems, setFileItems] = useState([])
  const [linkItems, setLinkItems] = useState(initial === 'link' ? [emptyLink()] : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  function emptyLinkRow() {
    setLinkItems((p) => [...p, emptyLink()])
  }

  function addFiles(list) {
    const picked = Array.from(list || [])
    if (!picked.length) return
    setFileItems((p) => [...p, ...picked.map((f) => ({ file: f, title: baseName(f.name), version: '' }))])
  }

  const setFileField = (i, key, val) =>
    setFileItems((p) => p.map((it, j) => (j === i ? { ...it, [key]: val } : it)))
  const setLinkField = (i, key, val) =>
    setLinkItems((p) => p.map((it, j) => (j === i ? { ...it, [key]: val } : it)))
  const removeFile = (i) => setFileItems((p) => p.filter((_, j) => j !== i))
  const removeLink = (i) => setLinkItems((p) => p.filter((_, j) => j !== i))

  // upload one file to project-files/<projectId>/... and return its DB payload
  async function uploadFile(it) {
    const ext = it.file.name.split('.').pop() || 'bin'
    const path = `${projectId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('project-files')
      .upload(path, it.file, { contentType: it.file.type || 'application/octet-stream' })
    if (upErr) throw upErr
    return {
      project_id: projectId,
      kind: 'file',
      title: it.title.trim() || it.file.name,
      version: it.version.trim() || null,
      path,
      name: it.file.name,
      content_type: it.file.type || null,
      size: it.file.size,
      created_by: user.id,
    }
  }

  const validLinks = linkItems.filter((l) => l.url.trim())
  const canSave = fileItems.length > 0 || validLinks.length > 0

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setError('')
    setBusy(true)
    try {
      const rows = []
      for (const it of fileItems) rows.push(await uploadFile(it))
      for (const l of validLinks) {
        let url = l.url.trim()
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url
        rows.push({
          project_id: projectId,
          kind: 'link',
          title: l.title.trim() || url,
          version: l.version.trim() || null,
          url,
          created_by: user.id,
        })
      }
      const { error: insErr } = await supabase.from('project_releases').insert(rows)
      if (insErr) throw insErr
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Добавить версию">
      <form onSubmit={onSubmit}>
        {/* files */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Файлы</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="label text-muted transition-colors hover:text-ink"
            >
              ＋ выбрать
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
          {fileItems.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="brackets flex w-full items-center justify-center border border-line bg-surface2 px-4 py-5 text-xs text-faint transition-colors hover:border-line2"
            >
              Перетащите или выберите файлы (zip, apk, pdf — любые)
            </button>
          ) : (
            <div className="space-y-2">
              {fileItems.map((it, i) => (
                <div key={i} className="border border-line bg-surface2 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-muted" title={it.file.name}>
                      {it.file.name} · {formatSize(it.file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="shrink-0 text-faint hover:text-accent"
                      aria-label="Убрать файл"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={it.title}
                      onChange={(e) => setFileField(i, 'title', e.target.value)}
                      placeholder="Название"
                      className="field flex-1 py-1.5 text-sm"
                    />
                    <input
                      value={it.version}
                      onChange={(e) => setFileField(i, 'version', e.target.value)}
                      placeholder="Версия"
                      className="field w-24 py-1.5 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* links */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Ссылки</span>
            <button type="button" onClick={emptyLinkRow} className="label text-muted transition-colors hover:text-ink">
              ＋ ссылка
            </button>
          </div>
          {linkItems.length > 0 && (
            <div className="space-y-2">
              {linkItems.map((l, i) => (
                <div key={i} className="border border-line bg-surface2 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      value={l.url}
                      onChange={(e) => setLinkField(i, 'url', e.target.value)}
                      placeholder="https://…"
                      className="field flex-1 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeLink(i)}
                      className="shrink-0 text-faint hover:text-accent"
                      aria-label="Убрать ссылку"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={l.title}
                      onChange={(e) => setLinkField(i, 'title', e.target.value)}
                      placeholder="Название"
                      className="field flex-1 py-1.5 text-sm"
                    />
                    <input
                      value={l.version}
                      onChange={(e) => setLinkField(i, 'version', e.target.value)}
                      placeholder="Версия"
                      className="field w-24 py-1.5 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Отмена
          </button>
          <button type="submit" disabled={busy || !canSave} className="btn-solid">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : 'Добавить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function emptyLink() {
  return { title: '', version: '', url: '' }
}
