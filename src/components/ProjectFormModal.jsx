import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Modal, Spinner } from './ui'

// Create or edit a project (admin only). Handles optional cover upload.
export function ProjectFormModal({ open, onClose, onSaved, project }) {
  const { user } = useAuth()
  const { t } = useT()
  const editing = !!project
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [coverPreview, setCoverPreview] = useState(project?.cover_url ?? '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  function pickFile(f) {
    if (!f) return
    setFile(f)
    setCoverPreview(URL.createObjectURL(f))
  }

  async function uploadCover(projectId) {
    if (!file) return null
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${projectId}/cover_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('project-covers')
      .upload(path, file, { contentType: file.type })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('project-covers').getPublicUrl(path)
    return data.publicUrl
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      let row = project
      if (editing) {
        const { data, error: err } = await supabase
          .from('projects')
          .update({ name: name.trim(), description: description.trim() || null })
          .eq('id', project.id)
          .select()
          .single()
        if (err) throw err
        row = data
      } else {
        const { data, error: err } = await supabase
          .from('projects')
          .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id })
          .select()
          .single()
        if (err) throw err
        row = data
      }

      if (file) {
        const url = await uploadCover(row.id)
        const { data, error: err } = await supabase
          .from('projects')
          .update({ cover_url: url })
          .eq('id', row.id)
          .select()
          .single()
        if (err) throw err
        row = data
      }

      onSaved?.(row)
      onClose()
    } catch (err) {
      setError(err.message || t('projectForm.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('projectForm.editTitle') : t('projectForm.newTitle')}>
      <form onSubmit={onSubmit}>
        {/* cover */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="brackets relative mb-6 flex aspect-[16/7] w-full items-center justify-center overflow-hidden border border-line bg-surface2 hover:border-line2 transition-colors"
        >
          {coverPreview ? (
            <img src={coverPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="label">{t('projectForm.uploadCover')}</span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <label className="label mb-2 block">{t('projectForm.name')}</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('projectForm.namePlaceholder')}
          className="field mb-6"
        />

        <label className="label mb-2 block">{t('projectForm.description')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={t('projectForm.descriptionPlaceholder')}
          className="field resize-none mb-6"
        />

        {error && (
          <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="btn-solid">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : editing ? t('common.save') : t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
