import { Component, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STATUS, PRIORITY } from '../lib/constants'
import { useT, useTOptional } from '../context/LangContext'
import { Icon } from './icons'

export { Icon } from './icons'

// Back-compat line icons (older call sites)
export const IconTrash = ({ size = 16, className = '' }) => <Icon name="trash" size={size} className={className} />
export const IconPencil = ({ size = 16, className = '' }) => <Icon name="pencil" size={size} className={className} />
export const IconCalendar = ({ size = 16, className = '' }) => <Icon name="calendar" size={size} className={className} />

// Square spinner (brand: no round shapes)
export function Spinner({ className = '', size = 14 }) {
  return (
    <span
      className={`spin-square inline-block border-2 border-line2 border-t-accent ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

// Skeleton block (first paint only — after that we keep stale data visible).
export function Skeleton({ className = '', style }) {
  return <span className={`skeleton block ${className}`} style={style} aria-hidden="true" />
}

// Small square count badge (red). Hidden when n <= 0.
export function CountBadge({ n, className = '', tone = 'accent', title }) {
  if (!n || n <= 0) return null
  const bg = tone === 'accent' ? 'bg-accent text-white' : tone === 'ink' ? 'bg-ink text-bg' : 'bg-line2 text-ink'
  return (
    <span
      title={title}
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center px-1 font-mono text-[11px] font-medium leading-none tabular-nums ${bg} ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function StatusBadge({ status, size = 'md' }) {
  const { t } = useT()
  const s = STATUS[status] ?? STATUS.new
  const key = STATUS[status] ? status : 'new'
  const pad = size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]'
  return (
    <span
      className={`wipe inline-flex items-center gap-1.5 border font-semibold uppercase tracking-[0.06em] ${pad}`}
      style={{ color: s.text, borderColor: s.dot + '55', background: s.dot + '14', '--wipe': s.dot }}
      key={key}
    >
      <span className="inline-block h-2 w-2" style={{ background: s.dot }} />
      {t('enum.status.' + key)}
    </span>
  )
}

export function PriorityTag({ priority, className = '' }) {
  const { t } = useT()
  const p = PRIORITY[priority] ?? PRIORITY.medium
  const key = PRIORITY[priority] ? priority : 'medium'
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] ${className}`}
      style={{ color: p.text }}
    >
      <PriorityBars priority={key} />
      {t('enum.priority.' + key)}
    </span>
  )
}

export function PriorityBars({ priority, color }) {
  const key = PRIORITY[priority] ? priority : 'medium'
  const c = color || PRIORITY[key].text
  const bars = { low: 1, medium: 2, high: 3, urgent: 4 }[key]
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className="w-[3px]" style={{ height: 3 + i * 2, background: i <= bars ? c : 'rgb(var(--c-line2))' }} />
      ))}
    </span>
  )
}

export function CategoryTag({ category }) {
  const { t } = useT()
  return <span className="label-sm">{t('enum.category.' + category)}</span>
}

// Square avatar with initials; deterministic tint per person.
export function Avatar({ name, email, size = 28, className = '' }) {
  const seed = (name || email || '?').trim()
  const initials = seed
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.38)),
        background: `hsl(${h} 30% 22%)`,
        border: `1px solid hsl(${h} 30% 32%)`,
      }}
      title={name || email}
    >
      {initials || '?'}
    </span>
  )
}

// Square checkbox (no native rounded control).
export function Check({ on, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${
        on ? 'border-accent bg-accent text-white' : 'border-line2 text-transparent'
      } ${className}`}
    >
      <Icon name="check" size={14} stroke={2.4} />
    </span>
  )
}

export function EmptyState({ title, hint, children, icon }) {
  return (
    <div className="brackets relative mx-auto max-w-md px-8 py-12 text-center">
      {icon && (
        <div className="mb-4 flex justify-center text-faint">
          <Icon name={icon} size={30} />
        </div>
      )}
      <div className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">{title}</div>
      {hint && <p className="mt-2 text-[15px] text-muted">{hint}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

// Inline error block with retry — never leave the user on a dead spinner.
export function ErrorState({ message, onRetry, onClose, closeLabel }) {
  const { t } = useTOptional()
  return (
    <div className="mx-auto max-w-md border border-accent/40 bg-accent/5 p-6 text-center">
      <div className="flex justify-center text-accent">
        <Icon name="alert" size={26} />
      </div>
      <p className="mt-3 text-[15px] text-ink">{message || t('common.loadError')}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button className="btn-solid btn-sm" onClick={onRetry}>
            <Icon name="refresh" size={15} /> {t('common.retry')}
          </button>
        )}
        {onClose && (
          <button className="btn-ghost btn-sm" onClick={onClose}>
            {closeLabel || t('common.close')}
          </button>
        )}
      </div>
    </div>
  )
}

// Inline form error line.
export function FormError({ children }) {
  if (!children) return null
  return (
    <div className="mb-5 flex items-start gap-2 border border-accent/40 bg-accentSoft px-3 py-2.5 text-[14px] text-ink">
      <Icon name="alert" size={16} className="mt-0.5 text-accent" />
      <span>{children}</span>
    </div>
  )
}

// Body scroll lock shared by modals/drawers (ref-counted).
let locks = 0
let prevOverflow = ''
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    if (locks === 0) prevOverflow = document.body.style.overflow
    locks++
    document.body.style.overflow = 'hidden'
    return () => {
      locks--
      if (locks <= 0) {
        locks = 0
        document.body.style.overflow = prevOverflow
      }
    }
  }, [active])
}

// Esc handler — only the top-most layer reacts (stack of handlers).
const escStack = []
export function useEsc(handler, active = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    const fn = () => ref.current?.()
    escStack.push(fn)
    const onKey = (e) => {
      if (e.key === 'Escape' && escStack[escStack.length - 1] === fn) {
        e.stopPropagation()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const i = escStack.lastIndexOf(fn)
      if (i >= 0) escStack.splice(i, 1)
    }
  }, [active])
}

// Modal: portal, Esc, scroll lock, always-visible close button (+ optional Back).
// On phones it becomes a full-height sheet so nothing is ever cut off.
export function Modal({ open, onClose, onBack, title, tag, children, width = 'max-w-lg', footer, z = 'z-[80]' }) {
  const { t } = useTOptional()
  useEsc(onBack || onClose, open)
  useScrollLock(open)
  if (!open) return null
  return createPortal(
    <div
      className={`scrim-in fixed inset-0 ${z} flex items-stretch justify-center bg-black/75 sm:items-start sm:overflow-y-auto sm:px-4 sm:py-10`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`pop relative flex max-h-full w-full ${width} flex-col border-line bg-surface sm:max-h-none sm:border`}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6 sm:py-4">
          {onBack && (
            <button onClick={onBack} className="icon-btn" aria-label={t('common.back')}>
              <Icon name="back" size={18} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            {tag && <div className="tag mb-1 text-muted">{tag}</div>}
            <h2 className="truncate font-display text-[20px] font-extrabold uppercase leading-tight tracking-tight text-ink">
              {title}
            </h2>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-line px-4 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ── Toasts ─────────────────────────────────────────────────────────────────
// const toast = useToast(); toast.show('…', { tone: 'error'|'ok', actions: [{label, onClick}], duration })
const ToastCtx = createContext(null)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const timers = useRef({})
  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])
  const show = useCallback(
    (text, opts = {}) => {
      const id = Math.random().toString(36).slice(2)
      const actions = opts.actions ?? (opts.action ? [opts.action] : [])
      setItems((xs) => [...xs.slice(-2), { id, text, tone: opts.tone, actions }])
      timers.current[id] = setTimeout(() => dismiss(id), opts.duration ?? (actions.length ? 6500 : 3800))
      return id
    },
    [dismiss],
  )
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])
  const api = useRef({ show, dismiss })
  api.current.show = show
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[140] flex flex-col items-center gap-2 px-3 sm:bottom-6"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-live="polite"
        >
          {items.map((it) => (
            <div
              key={it.id}
              role={it.tone === 'error' ? 'alert' : 'status'}
              className={`toast-in pointer-events-auto flex w-full max-w-[460px] items-center gap-3 border py-2.5 pl-4 pr-2 text-[15px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ${
                it.tone === 'error' ? 'border-accent bg-[#1a0605] text-ink' : 'border-line2 bg-surface2 text-ink'
              }`}
            >
              <Icon
                name={it.tone === 'error' ? 'alert' : 'check'}
                size={18}
                className={it.tone === 'error' ? 'text-accent' : 'text-ok'}
              />
              <span className="min-w-0 flex-1 leading-snug">{it.text}</span>
              {it.actions.map((a, i) => (
                <button
                  key={i}
                  className="btn-sm shrink-0 px-2.5 font-semibold uppercase tracking-[0.06em] text-accent hover:bg-surface hover:text-ink"
                  style={{ minHeight: 32, fontSize: 12 }}
                  onClick={() => {
                    dismiss(it.id)
                    a.onClick?.()
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button className="icon-btn-sm" onClick={() => dismiss(it.id)} aria-label="close">
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}
export function useToast() {
  return useContext(ToastCtx) ?? { show: () => {}, dismiss: () => {} }
}

// ── Confirm dialog (replaces window.confirm) ─────────────────────────────────
// const confirm = useConfirm(); if (!(await confirm({ title, body, confirmLabel, danger }))) return
const ConfirmCtx = createContext(null)
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null)
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setReq({ ...(typeof opts === 'string' ? { title: opts } : opts), resolve })
      }),
    [],
  )
  const close = (v) => {
    req?.resolve(v)
    setReq(null)
  }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && <ConfirmDialog req={req} onDone={close} />}
    </ConfirmCtx.Provider>
  )
}
function ConfirmDialog({ req, onDone }) {
  const { t } = useTOptional()
  const okRef = useRef(null)
  useEffect(() => okRef.current?.focus(), [])
  return (
    <Modal open onClose={() => onDone(false)} title={req.title} width="max-w-md" z="z-[130]">
      {req.body && <p className="text-[15px] leading-relaxed text-muted">{req.body}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-ghost" onClick={() => onDone(false)}>
          {req.cancelLabel || t('common.cancel')}
        </button>
        <button ref={okRef} className={req.danger ? 'btn-accent' : 'btn-solid'} onClick={() => onDone(true)}>
          {req.danger && <Icon name="trash" size={16} />}
          {req.confirmLabel || t('common.confirm')}
        </button>
      </div>
    </Modal>
  )
}
export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  return ctx ?? (async (o) => window.confirm(typeof o === 'string' ? o : o.title))
}

// ── Error boundary (root + per route) ───────────────────────────────────────
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return <CrashScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}
function CrashScreen({ error, onRetry }) {
  const { t } = useTOptional()
  // chunk failed to load after a deploy → a reload fixes it
  const chunk = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(String(error?.message))
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md">
        <ErrorState
          message={chunk ? t('errors.newVersion') : t('errors.crash')}
          onRetry={chunk ? () => window.location.reload() : onRetry}
          onClose={() => {
            window.location.hash = '#/projects'
            onRetry()
          }}
          closeLabel={t('common.toProjects')}
        />
      </div>
    </div>
  )
}

// Segmented square control (tabs / filters).
export function Segmented({ items, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex border border-line ${className}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={`press flex min-h-[36px] items-center gap-2 px-3.5 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors ${
            value === it.key ? 'bg-ink text-bg' : 'text-muted hover:bg-surface2 hover:text-ink'
          }`}
        >
          {it.icon && <Icon name={it.icon} size={15} />}
          {it.label}
          {it.n != null && (
            <span className={`num text-[12px] ${value === it.key ? 'text-bg/70' : 'text-faint'}`}>{it.n}</span>
          )}
        </button>
      ))}
    </div>
  )
}
