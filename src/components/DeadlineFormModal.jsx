import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { FormError, Icon, Modal, Spinner } from './ui'
import { errText } from '../lib/errors'

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

// Add or edit a single goal + deadline. Available to admins and project members.
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
    if (!canSave || busy) return
    setError('')
    setBusy(true)
    const q = editing
      ? supabase.from('project_deadlines').update({ title: title.trim(), deadline }).eq('id', item.id)
      : supabase.from('project_deadlines').insert({ project_id: projectId, title: title.trim(), deadline, created_by: user.id })
    const { data, error: err } = await q.select().single()
    setBusy(false)
    if (err) return setError(errText(t, err, 'deadlineForm.error'))
    onSaved?.(data)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('deadlineForm.editTitle') : t('deadlineForm.title')} width="max-w-md">
      <form onSubmit={onSubmit}>
        <label className="field-label" htmlFor="dl-title">
          {t('deadlineForm.goal')}
        </label>
        <input
          id="dl-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('deadlineForm.goalPlaceholder')}
          className="field mb-6"
        />

        <label className="field-label mb-2 block" htmlFor="dl-date">
          {t('deadlineForm.deadline')}
        </label>
        <input id="dl-date" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input-box h-11 py-0 [color-scheme:dark]" />
        <div className="mb-6 mt-2 flex flex-wrap gap-1.5">
          {[
            { l: t('panel.dueWeek'), v: plus(7) },
            { l: t('panel.dueTwoWeeks'), v: plus(14) },
            { l: t('panel.dueMonth'), v: plus(30) },
          ].map((d) => (
            <button type="button" key={d.l} onClick={() => setDeadline(d.v)} className={`chip press ${deadline === d.v ? 'chip-on' : ''}`} style={{ minHeight: 30 }}>
              {d.l}
            </button>
          ))}
        </div>

        <FormError>{error}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !canSave} className="btn-accent">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name={editing ? 'check' : 'plus'} size={16} />}
            {editing ? t('common.save') : t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
