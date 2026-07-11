import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Modal, Spinner } from './ui'

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
      setError(err.message || t('workspaces.errCreate'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('workspaces.editTitle') : t('workspaces.createTitle')}>
      <form onSubmit={submit}>
        <label className="label mb-2 block">{t('workspaces.name')}</label>
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('workspaces.namePlaceholder')}
          className="field mb-6"
        />
        {error && <div className="mb-5 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}
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
