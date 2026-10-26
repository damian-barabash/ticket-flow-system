import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notify'
import { useT } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { Avatar, Icon, Spinner, useEsc } from './ui'

// ── people of a project (module-level cache, shared by every picker/avatar) ──
const cache = new Map() // projectId -> { people, at }
const inflight = new Map()
const listeners = new Set()
const TTL = 5 * 60 * 1000
const emit = () => listeners.forEach((l) => l())

function fetchPeople(projectId, force = false) {
  const hit = cache.get(projectId)
  if (!force && hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.people)
  if (inflight.has(projectId)) return inflight.get(projectId)
  const p = supabase
    .rpc('project_people', { p_project: projectId })
    .then(({ data, error }) => {
      inflight.delete(projectId)
      if (error) throw error
      cache.set(projectId, { people: data ?? [], at: Date.now() })
      emit()
      return data ?? []
    })
    .catch((e) => {
      inflight.delete(projectId)
      if (!cache.has(projectId)) cache.set(projectId, { people: [], at: 0, error: true })
      emit()
      throw e
    })
  inflight.set(projectId, p)
  return p
}
export const refreshPeople = (projectId) => fetchPeople(projectId, true).catch(() => {})

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePeople(projectId) {
  const entry = useSyncExternalStore(subscribe, () => (projectId ? cache.get(projectId) : undefined))
  useEffect(() => {
    if (projectId) fetchPeople(projectId).catch(() => {})
  }, [projectId])
  return useMemo(() => {
    const people = entry?.people ?? []
    const byId = {}
    people.forEach((p) => (byId[p.id] = p))
    return { people, byId, loading: !!projectId && !entry }
  }, [entry, projectId])
}

// Assign (or unassign with null). Throws on error. Push only when assigning.
export async function assignTicket(ticketId, userId) {
  const { error } = await supabase.rpc('assign_ticket', { p_ticket: ticketId, p_user: userId ?? null })
  if (error) throw error
  if (userId) notify('assigned', ticketId)
}

export const personName = (p) => p?.full_name || p?.email || '—'

export function AssigneeAvatar({ projectId, userId, size = 22 }) {
  const { byId } = usePeople(userId ? projectId : null)
  if (!userId) return null
  const p = byId[userId]
  return (
    <span title={p ? personName(p) : ''} className="inline-flex">
      <Avatar name={p?.full_name} email={p?.email || '?'} size={size} />
    </span>
  )
}

function roleLabel(t, p) {
  if (p.is_owner) return t('assignee.owner')
  return t('enum.role.' + (p.role || 'user'))
}

// Dropdown/popover (square). `compact` → avatar-only trigger.
export function AssigneePicker({ projectId, value, onChange, compact = false, disabled = false }) {
  const { t } = useT()
  const { user } = useAuth()
  const { people, byId, loading } = usePeople(projectId)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const [pos, setPos] = useState(null)
  useEsc(() => setOpen(false), open)

  const cur = value ? byId[value] : null
  const showSearch = people.length > 6
  const options = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s
      ? people.filter((p) => (p.full_name || '').toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s))
      : people
    return [{ id: null }, ...list]
  }, [people, q])

  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.max(280, compact ? 280 : r.width)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
    const below = window.innerHeight - r.bottom
    const up = below < 320 && r.top > below
    setPos({ left, width: w, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined })
  }
  function toggle() {
    if (disabled) return
    if (!open) {
      place()
      setQ('')
      setHi(Math.max(0, options.findIndex((o) => o.id === (value ?? null))))
      if (projectId) refreshPeople(projectId)
    }
    setOpen((v) => !v)
  }
  useEffect(() => {
    if (!open) return
    const onScroll = (e) => {
      if (listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])
  useEffect(() => setHi(0), [q])

  function pick(id) {
    setOpen(false)
    if ((id ?? null) !== (value ?? null)) onChange?.(id)
    btnRef.current?.focus()
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => Math.min(options.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = options[hi]
      if (o) pick(o.id)
    } else if (e.key === 'Tab') setOpen(false)
  }
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            if (!open) toggle()
          } else if (open) onKey(e)
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={cur ? personName(cur) : t('assignee.unassigned')}
        className={
          compact
            ? 'inline-flex h-8 w-8 items-center justify-center border border-dashed border-line2 text-faint transition-colors hover:border-ink hover:text-ink disabled:opacity-40'
            : 'flex min-h-[44px] w-full items-center gap-3 border border-line bg-bg px-3 text-left transition-colors hover:border-line2 disabled:opacity-40'
        }
        style={compact && cur ? { borderStyle: 'solid', padding: 0, border: 0 } : undefined}
      >
        {compact ? (
          cur ? (
            <Avatar name={cur.full_name} email={cur.email} size={32} />
          ) : (
            <Icon name="userPlus" size={16} />
          )
        ) : (
          <>
            {cur ? (
              <Avatar name={cur.full_name} email={cur.email} size={26} />
            ) : (
              <span className="inline-flex h-[26px] w-[26px] items-center justify-center border border-dashed border-line2 text-faint">
                <Icon name="user" size={14} />
              </span>
            )}
            <span className={`min-w-0 flex-1 truncate text-[15px] ${cur ? 'text-ink' : 'text-muted'}`}>
              {cur ? personName(cur) : value && loading ? '…' : t('assignee.unassigned')}
              {cur && cur.id === user?.id && <span className="ml-1.5 text-[13px] text-faint">({t('assignee.me')})</span>}
            </span>
            <Icon name="down" size={16} className="text-faint" />
          </>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div className="fixed inset-0 z-[95]" onMouseDown={() => setOpen(false)}>
            <div
              ref={listRef}
              className="pop fixed flex max-h-[340px] flex-col border border-line2 bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,.9)]"
              style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, animationDuration: '140ms' }}
              onMouseDown={(e) => e.stopPropagation()}
              role="listbox"
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="label">{t('assignee.title')}</span>
                <button className="icon-btn-sm" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                  <Icon name="close" size={15} />
                </button>
              </div>
              {showSearch && (
                <div className="border-b border-line px-3 py-2">
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={t('assignee.search')}
                    className="input-box py-2 text-[14px]"
                  />
                </div>
              )}
              <div className="flex-1 overflow-y-auto py-1" tabIndex={-1} onKeyDown={onKey} autoFocus={!showSearch}>
                {loading && people.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : (
                  options.map((p, i) => {
                    const sel = (p.id ?? null) === (value ?? null)
                    return (
                      <button
                        key={p.id ?? 'none'}
                        data-i={i}
                        type="button"
                        role="option"
                        aria-selected={sel}
                        onMouseEnter={() => setHi(i)}
                        onClick={() => pick(p.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${i === hi ? 'bg-surface2' : ''}`}
                      >
                        {p.id ? (
                          <Avatar name={p.full_name} email={p.email} size={28} />
                        ) : (
                          <span className="inline-flex h-7 w-7 items-center justify-center border border-dashed border-line2 text-faint">
                            <Icon name="minus" size={14} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-ink">
                            {p.id ? personName(p) : t('assignee.unassigned')}
                            {p.id && p.id === user?.id && <span className="ml-1.5 text-faint">({t('assignee.me')})</span>}
                          </span>
                          {p.id && (
                            <span className="block truncate text-[12px] text-faint">
                              {roleLabel(t, p)}
                              {p.full_name && p.email ? ` · ${p.email}` : ''}
                            </span>
                          )}
                        </span>
                        {p.is_owner && <span className="border border-accent/50 px-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">{t('assignee.owner')}</span>}
                        {sel && <Icon name="check" size={16} className="text-accent" />}
                      </button>
                    )
                  })
                )}
                {!loading && options.length === 1 && q && <p className="px-3 py-3 text-[13px] text-faint">{t('assignee.noMatch')}</p>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
