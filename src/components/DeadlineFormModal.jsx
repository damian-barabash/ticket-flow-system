import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Modal, Spinner } from './ui'

// Add or edit a single goal + deadline. Available to admins and project members.
// Pass `item` (an existing project_deadlines row) to edit it instead of creating.
export function DeadlineFormModal({ open, onClose, onSaved, projectId, item = null }) {
  const { user } = useAuth()
  const { t } = useT()
  const editing = !!item
  const [title, setTitle] = useState(item?.title ?? '')
  const [deadline, setDeadline] = useState(item?.deadline ? String(item.deadline).slice(0, 10) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSave = title.trim() && deadline

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setError('')
    setBusy(true)
    try {
      if (editing) {
        const { error: updErr } = await supabase
          .from('project_deadlines')
          .update({ title: title.trim(), deadline })
          .eq('id', item.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase.from('project_deadlines').insert({
          project_id: projectId,
          title: title.trim(),
          deadline, // 'YYYY-MM-DD'
          created_by: user.id,
        })
        if (insErr) throw insErr
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || t('deadlineForm.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('deadlineForm.editTitle') : t('deadlineForm.title')}>
      <form onSubmit={onSubmit}>
        <div className="mb-5">
          <label className="label mb-2 block">{t('deadlineForm.goal')}</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('deadlineForm.goalPlaceholder')}
            className="field w-full"
          />
        </div>

        <div className="mb-6">
          <label className="label mb-2 block">{t('deadlineForm.deadline')}</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="field w-full [color-scheme:dark]"
          />
        </div>

        {error && (
          <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !canSave} className="btn-solid">
            {busy ? <Spinner className="border-bg/40 border-t-bg" /> : editing ? t('common.save') : t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
