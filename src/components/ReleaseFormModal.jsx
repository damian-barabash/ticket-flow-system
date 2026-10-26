import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { formatSize } from '../lib/format'
import { FormError, Icon, Modal, Spinner } from './ui'
import { errText } from '../lib/errors'
import { uid } from '../lib/realtime'

// strip the extension to use a file's name as a default title
const baseName = (n) => n.replace(/\.[^.]+$/, '')

// Add one or more project "releases" at once — any mix of files and links.
// Each item carries an optional title + version. (Admin only.)
export function ReleaseFormModal({ open, onClose, onSaved, projectId, initial = 'file' }) {
  const { user } = useAuth()
  const { t } = useT()
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
    const ext = it.file.name.includes('.') ? it.file.name.split('.').pop() : 'bin'
    const path = `${projectId}/${uid()}.${ext}`
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
    if (!canSave || busy) return
    setError('')
    // links: http(s) only
    const links = []
    for (const l of validLinks) {
      let url = l.url.trim()
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url
      let ok = false
      try {
        const u = new URL(url)
        ok = u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        ok = false
      }
      if (!ok) return setError(t('panel.badLink'))
      links.push({ project_id: projectId, kind: 'link', title: l.title.trim() || url, version: l.version.trim() || null, url, created_by: user.id })
    }
    setBusy(true)
    const uploaded = []
    try {
      for (const it of fileItems) {
        const row = await uploadFile(it)
        uploaded.push(row.path)
        links.push(row)
      }
      const { data, error: insErr } = await supabase.from('project_releases').insert(links).select()
      if (insErr) throw insErr
      onSaved?.(data)
      onClose()
    } catch (err) {
      // nothing in the DB → remove the files we already pushed
      if (uploaded.length) supabase.storage.from('project-files').remove(uploaded)
      setError(errText(t, err, 'releaseForm.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('releaseForm.title')}>
      <form onSubmit={onSubmit}>
        {/* files */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">{t('releaseForm.files')}</span>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-quiet btn-sm">
              <Icon name="plus" size={15} /> {t('panel.pickFiles')}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
          {fileItems.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 border border-dashed border-line2 px-4 py-6 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              <Icon name="upload" size={18} />
              {t('releaseForm.filesDropzone')}
            </button>
          ) : (
            <div className="space-y-2">
              {fileItems.map((it, i) => (
                <div key={i} className="border border-line bg-surface2 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="num truncate text-[13px] text-muted" title={it.file.name}>
                      {it.file.name} · {formatSize(it.file.size)}
                    </span>
                    <button type="button" onClick={() => removeFile(i)} className="icon-btn-sm hover:!text-accent" aria-label={t('releaseForm.removeFile')}>
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={it.title}
                      onChange={(e) => setFileField(i, 'title', e.target.value)}
                      placeholder={t('common.titleField')}
                      className="field flex-1 py-2"
                    />
                    <input
                      value={it.version}
                      onChange={(e) => setFileField(i, 'version', e.target.value)}
                      placeholder={t('common.version')}
                      className="field num w-24 py-2"
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
            <span className="label">{t('releaseForm.links')}</span>
            <button type="button" onClick={emptyLinkRow} className="btn-quiet btn-sm">
              <Icon name="plus" size={15} /> {t('panel.addLink')}
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
                      className="field flex-1 py-2"
                    />
                    <button type="button" onClick={() => removeLink(i)} className="icon-btn-sm hover:!text-accent" aria-label={t('releaseForm.removeLink')}>
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={l.title}
                      onChange={(e) => setLinkField(i, 'title', e.target.value)}
                      placeholder={t('common.titleField')}
                      className="field flex-1 py-2"
                    />
                    <input
                      value={l.version}
                      onChange={(e) => setLinkField(i, 'version', e.target.value)}
                      placeholder={t('common.version')}
                      className="field num w-24 py-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <FormError>{error}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !canSave} className="btn-accent">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="plus" size={16} />}
            {t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function emptyLink() {
  return { title: '', version: '', url: '' }
}
