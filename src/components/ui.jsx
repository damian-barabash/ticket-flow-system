import { STATUS, PRIORITY, CATEGORY } from '../lib/constants'

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-ink ${className}`}
    />
  )
}

export function StatusBadge({ status, size = 'md' }) {
  const s = STATUS[status] ?? STATUS.new
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-line font-mono uppercase tracking-label ${pad}`}
      style={{ color: s.text }}
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: s.dot }} />
      {s.ru}
    </span>
  )
}

export function PriorityTag({ priority }) {
  const p = PRIORITY[priority] ?? PRIORITY.medium
  return (
    <span className="font-mono uppercase tracking-label text-[10px]" style={{ color: p.text }}>
      {p.ru}
    </span>
  )
}

export function CategoryTag({ category }) {
  const c = CATEGORY[category] ?? CATEGORY.change
  return <span className="label">{c.ru}</span>
}

export function Avatar({ name, email, size = 28 }) {
  const seed = (name || email || '?').trim()
  const initials = seed
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-surface2 border border-line font-mono text-[10px] text-muted"
      style={{ width: size, height: size }}
      title={name || email}
    >
      {initials || '?'}
    </span>
  )
}

// Empty-state block with corner brackets
export function EmptyState({ title, hint, children }) {
  return (
    <div className="brackets relative mx-auto max-w-md px-10 py-16 text-center">
      <div className="font-mono uppercase tracking-label text-[11px] text-muted">{title}</div>
      {hint && <p className="mt-3 text-sm text-faint">{hint}</p>}
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-12 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className={`brackets relative w-full ${width} border border-line bg-surface p-7`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-mono uppercase tracking-label text-[12px] text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="font-mono text-faint hover:text-ink transition-colors"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
