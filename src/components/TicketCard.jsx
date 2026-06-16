import { STATUS, PRIORITY } from '../lib/constants'
import { timeAgo } from '../lib/format'
import { useT } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'

// A ticket rendered like a paper ticket: body + dashed perforation + stub.
export function TicketCard({ ticket, unread, commentCount = 0, creator, photos = [], onOpen }) {
  const { t } = useT()
  const { isStaff } = useAuth()
  const s = STATUS[ticket.status] ?? STATUS.new
  const p = PRIORITY[ticket.priority] ?? PRIORITY.medium
  const statusKey = STATUS[ticket.status] ? ticket.status : 'new'
  const priorityKey = PRIORITY[ticket.priority] ? ticket.priority : 'medium'

  // Admin-assigned task: glows red + pinned for the client until done.
  const isTask = !!ticket.is_task
  const clientTask = isTask && !isStaff && ticket.status !== 'done'

  return (
    <button
      onClick={onOpen}
      className={`group relative flex w-full overflow-hidden border bg-surface text-left transition-colors ${
        clientTask
          ? 'border-accent shadow-[0_0_0_1px_rgba(255,46,46,0.6),0_0_18px_-4px_rgba(255,46,46,0.55)] hover:border-accent'
          : 'border-line hover:border-line2'
      }`}
    >
      {/* accent edge by status (task → red for the client) */}
      <span className="w-[3px] shrink-0" style={{ background: clientTask ? '#FF2E2E' : s.dot }} />

      {/* body */}
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[11px] text-faint">
            № {String(ticket.number).padStart(3, '0')}
          </span>
          <span className="label-sm">{t('enum.category.' + ticket.category)}</span>
          {isTask && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 font-mono uppercase tracking-label text-[9px] ${
                clientTask ? 'bg-accent text-bg' : 'border border-accent/40 text-accent'
              }`}
            >
              ★ {clientTask ? t('ticket.taskForYou') : t('ticket.taskForClient')}
            </span>
          )}
          {unread && (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="label-sm text-accent">{t('ticket.cardNew')}</span>
            </span>
          )}
        </div>

        <h3 className="truncate text-[15px] font-medium text-ink">{ticket.title}</h3>
        {ticket.description && (
          <p className="mt-1 line-clamp-1 text-xs text-faint">{ticket.description}</p>
        )}

        {photos.length > 0 && (
          <div className="mt-3 flex gap-2">
            {photos.slice(0, 2).map((url, i) => (
              <div key={i} className="h-12 w-12 shrink-0 overflow-hidden border border-line sm:h-14 sm:w-14">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.parentElement.style.display = 'none'
                  }}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 text-faint">
          <span className="label-sm">{timeAgo(ticket.updated_at || ticket.created_at)}</span>
          {commentCount > 0 && (
            <span className="label-sm flex items-center gap-1">✦ {commentCount}</span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <Avatar name={creator?.full_name} email={creator?.email} size={20} />
          </span>
        </div>
      </div>

      {/* perforation */}
      <div className="relative w-px shrink-0 self-stretch">
        <div
          className="absolute inset-y-2 left-0 w-px"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, #34343A 0 4px, transparent 4px 9px)',
          }}
        />
      </div>

      {/* stub: status + priority */}
      <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-2 bg-surface2/60 px-2 py-3 sm:w-[108px]">
        <span
          className="flex items-center gap-1.5 font-mono uppercase tracking-label text-[9px]"
          style={{ color: s.text }}
        >
          <span className="inline-block h-1.5 w-1.5" style={{ background: s.dot }} />
          {t('enum.status.' + statusKey)}
        </span>
        <span className="font-mono uppercase tracking-label text-[9px]" style={{ color: p.text }}>
          {t('enum.priority.' + priorityKey)}
        </span>
        {ticket.status === 'done' && ticket.fixed_version && (
          <span
            className="max-w-full truncate font-mono text-[9px]"
            style={{ color: '#3FB950' }}
            title={ticket.fixed_version}
          >
            ✓ {ticket.fixed_version}
          </span>
        )}
      </div>
    </button>
  )
}
