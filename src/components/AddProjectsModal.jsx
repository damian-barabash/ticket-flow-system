import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { Modal, Spinner, EmptyState } from './ui'

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
      if (err) throw new Error(err.message)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('workspaces.addTitle')} width="max-w-lg">
      {available.length === 0 ? (
        <EmptyState title={t('workspaces.addNone')} />
      ) : (
        <>
          <p className="mb-4 text-sm text-faint">{t('workspaces.addHint')}</p>
          <div className="mb-5 max-h-[46vh] space-y-2 overflow-y-auto">
            {available.map((p) => {
              const on = picked.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-accent bg-accentSoft' : 'border-line hover:border-line2'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] ${
                      on ? 'border-accent bg-accent text-bg' : 'border-line2 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                </button>
              )
            })}
          </div>
          {error && <div className="mb-4 border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-ghost">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={submit} disabled={busy || !picked.size} className="btn-solid">
              {busy ? <Spinner className="border-bg/40 border-t-bg" /> : t('workspaces.addBtn', { n: picked.size })}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
