import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { FormError, Icon, Modal, Spinner } from './ui'
import { errText } from '../lib/errors'

// Create or rename a personal workspace. A workspace is private to its creator.
export function WorkspaceFormModal({ open, onClose, onSaved, workspace }) {
  const { user } = useAuth()
  const { t } = useT()
  const editing = !!workspace
  const [name, setName] = useState(workspace?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      let row
      if (editing) {
        const { data, error: err } = await supabase
          .from('workspaces')
          .update({ name: name.trim() })
          .eq('id', workspace.id)
          .select()
          .single()
        if (err) throw err
        row = data
      } else {
        const { data, error: err } = await supabase
          .from('workspaces')
          .insert({ name: name.trim(), created_by: user.id })
          .select()
          .single()
        if (err) throw err
        row = data
      }
      onSaved?.(row)
      onClose()
    } catch (err) {
      setError(errText(t, err, 'workspaces.errCreate'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('workspaces.editTitle') : t('workspaces.createTitle')} width="max-w-md">
      <form onSubmit={submit}>
        <label className="field-label">{t('workspaces.name')}</label>
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('workspaces.namePlaceholder')}
          className="field mb-6"
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
