import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Modal, Spinner, EmptyState, Check, FormError, Icon } from './ui'
import { errText } from '../lib/errors'

// Pick projects to place into a workspace. `available` = the viewer's ungrouped
// active projects (not already inside any of their workspaces).
export function AddProjectsModal({ open, onClose, onSaved, workspaceId, available }) {
  const { t } = useT()
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function toggle(id) {
    setPicked((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function submit() {
    if (!picked.size) return
    setError('')
    setBusy(true)
    try {
      const rows = [...picked].map((project_id) => ({ workspace_id: workspaceId, project_id }))
      const { error: err } = await supabase.from('workspace_projects').insert(rows)
      if (err) throw err
      onSaved?.()
      onClose()
    } catch (err) {
      setError(errText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('workspaces.addTitle')} width="max-w-lg">
      {available.length === 0 ? (
        <EmptyState icon="folder" title={t('workspaces.addNone')}>
          <button onClick={onClose} className="btn-ghost">
            {t('common.close')}
          </button>
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-[15px] text-muted">{t('workspaces.addHint')}</p>
          <div className="mb-5 max-h-[46vh] space-y-2 overflow-y-auto">
            {available.map((p) => {
              const on = picked.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`press flex min-h-[48px] w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-accent bg-accentSoft' : 'border-line hover:border-line2'
                  }`}
                >
                  <Check on={on} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{p.name}</span>
                </button>
              )
            })}
          </div>
          <FormError>{error}</FormError>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn-ghost">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={submit} disabled={busy || !picked.size} className="btn-accent">
              {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="plus" size={16} />}
              {t('workspaces.addBtn', { n: picked.size })}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
