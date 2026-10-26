import { memo } from 'react'
import { STATUS, PRIORITY } from '../lib/constants'
import { timeAgo, shortDay, dueTone } from '../lib/format'
import { useT } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { Icon, PriorityBars } from './ui'
import { AssigneeAvatar } from './AssigneePicker'

export const ticketNo = (n) => '#' + String(n ?? 0).padStart(3, '0')

// A ticket rendered like a paper ticket: body + perforation + stub.
export const TicketCard = memo(function TicketCard({ ticket, unread, commentCount = 0, photos, onOpen, leaving, index = 0 }) {
  const { t } = useT()
  const { isStaff, user } = useAuth()
  const s = STATUS[ticket.status] ?? STATUS.new
  const p = PRIORITY[ticket.priority] ?? PRIORITY.medium
  const statusKey = STATUS[ticket.status] ? ticket.status : 'new'
  const priorityKey = PRIORITY[ticket.priority] ? ticket.priority : 'medium'
  const closed = ticket.status === 'done' || ticket.status === 'rejected'
  const due = ticket.due_date ? dueTone(ticket.due_date, closed) : null

  // Task glows red + is pinned for the client until done.
  const isTask = !!ticket.is_task
  const clientTask = isTask && !isStaff && !closed
  const mine = ticket.assigned_to && ticket.assigned_to === user?.id

  return (
    <button
      onClick={() => onOpen(ticket.id)}
      className={`card-in press group relative flex w-full border bg-surface text-left transition-colors hover:bg-surface2 ${
        clientTask ? 'border-accent red-glow' : 'border-line hover:border-line2'
      } ${leaving ? 'fly-out' : ''}`}
      style={{ '--i': index }}
      aria-label={`${ticketNo(ticket.number)} ${ticket.title}`}
    >
      {/* status edge */}
      <span className="w-[4px] shrink-0" style={{ background: clientTask ? '#F2231B' : s.dot }} />

      {/* body */}
      <div className="min-w-0 flex-1 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="mb-1.5 flex min-w-0 items-center gap-2">
          <span className="num text-[13px] font-medium text-muted">{ticketNo(ticket.number)}</span>
          <span className="truncate text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
            {t('enum.category.' + ticket.category)}
          </span>
          {isTask && (
            <span
              className={`flex shrink-0 items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                clientTask ? 'bg-accent text-white' : 'border border-accent/50 text-accent'
              }`}
            >
              <Icon name="star" size={12} /> <span className="hidden sm:inline">{clientTask ? t('ticket.taskForYou') : t('ticket.taskForClient')}</span>
            </span>
          )}
          {unread && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 bg-accent px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white">
              {t('ticket.cardNew')}
            </span>
          )}
        </div>

        <h3 className={`line-clamp-2 text-[16px] font-semibold leading-snug text-ink sm:text-[17px] ${leaving ? 'strike' : ''}`}>
          {ticket.title}
        </h3>
        {ticket.description && <p className="mt-1 line-clamp-1 text-[14px] text-muted">{ticket.description}</p>}

        {photos?.length > 0 && (
          <div className="mt-3 flex gap-2">
            {photos.slice(0, 3).map((url, i) => (
              <div key={i} className="h-12 w-12 shrink-0 overflow-hidden border border-line bg-surface2 sm:h-14 sm:w-14">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.parentElement.style.display = 'none'
                  }}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <Icon name="clock" size={14} className="text-faint" />
            {timeAgo(ticket.updated_at || ticket.created_at)}
          </span>
          {commentCount > 0 && (
            <span className="flex items-center gap-1.5">
              <Icon name="chat" size={14} className="text-faint" />
              <span className="num">{commentCount}</span>
            </span>
          )}
          {due && (
            <span
              className="flex items-center gap-1.5 border px-1.5 py-0.5 text-[12px] font-semibold"
              style={{ color: due.color, borderColor: due.color + '66' }}
            >
              <Icon name="calendar" size={13} />
              {due.overdue ? t('panel.overdueShort') + ' · ' : ''}
              {shortDay(ticket.due_date)}
            </span>
          )}
          {ticket.assigned_to && (
            <span className={`ml-auto flex items-center gap-1.5 ${mine ? 'text-ink' : ''}`} title={t('panel.assignee')}>
              {mine && <span className="hidden text-[12px] font-semibold uppercase tracking-[0.06em] sm:inline">{t('panel.forMe')}</span>}
              <AssigneeAvatar projectId={ticket.project_id} userId={ticket.assigned_to} size={24} />
            </span>
          )}
        </div>
      </div>

      {/* perforation with square notches */}
      <div className="relative w-px shrink-0 self-stretch">
        <span className="absolute -left-[5px] -top-px h-[6px] w-[11px] border-b border-line bg-bg" />
        <span className="perforation-v absolute inset-y-3 left-0" />
        <span className="absolute -bottom-px -left-[5px] h-[6px] w-[11px] border-t border-line bg-bg" />
      </div>

      {/* stub: status + priority */}
      <div className="flex w-[104px] shrink-0 flex-col items-start justify-center gap-2.5 bg-surface2/50 px-3 py-3 sm:w-[132px] sm:px-4">
        <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase leading-tight tracking-[0.04em]" style={{ color: s.text }}>
          <span className="inline-block h-2 w-2 shrink-0" style={{ background: s.dot }} />
          <span className="break-words">{t('enum.status.' + statusKey)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em]" style={{ color: p.text }}>
          <PriorityBars priority={priorityKey} />
          {t('enum.priority.' + priorityKey)}
        </span>
        {ticket.status === 'done' && ticket.fixed_version && (
          <span className="num flex max-w-full items-center gap-1 truncate text-[12px] text-ok" title={ticket.fixed_version}>
            <Icon name="check" size={13} /> {ticket.fixed_version}
          </span>
        )}
      </div>
    </button>
  )
})

export function TicketCardSkeleton() {
  return (
    <div className="flex h-[118px] w-full border border-line bg-surface">
      <span className="w-[4px] bg-line" />
      <div className="flex-1 space-y-2.5 p-5">
        <span className="skeleton block h-3 w-24" />
        <span className="skeleton block h-5 w-3/4" />
        <span className="skeleton block h-3 w-1/2" />
      </div>
      <div className="w-[104px] border-l border-dashed border-line sm:w-[132px]" />
    </div>
  )
}
