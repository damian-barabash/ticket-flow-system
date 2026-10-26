import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { FormError, Icon, Modal, Spinner } from './ui'
import { errText } from '../lib/errors'

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

  const blobRef = useRef(null)
  useEffect(() => () => blobRef.current && URL.revokeObjectURL(blobRef.current), [])
  function pickFile(f) {
    if (!f) return
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    blobRef.current = URL.createObjectURL(f)
    setFile(f)
    setCoverPreview(blobRef.current)
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
    if (busy) return
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
      setError(errText(t, err, 'projectForm.error'))
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
          className="group relative mb-6 flex aspect-[16/7] w-full items-center justify-center overflow-hidden border border-dashed border-line2 bg-surface2 transition-colors hover:border-ink"
        >
          {coverPreview ? (
            <>
              <img src={coverPreview} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-bg/85 px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">
                <Icon name="image" size={14} /> {t('panel.changeCover')}
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-2 text-[14px] text-muted group-hover:text-ink">
              <Icon name="image" size={26} />
              {t('projectForm.uploadCover')}
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <label className="field-label">{t('projectForm.name')}</label>
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('projectForm.namePlaceholder')}
          className="field mb-6"
        />

        <label className="field-label">{t('projectForm.description')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={t('projectForm.descriptionPlaceholder')}
          className="field resize-none mb-6"
        />

        <FormError>{error}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="btn-accent">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name={editing ? 'check' : 'plus'} size={16} />}
            {editing ? t('common.save') : t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
