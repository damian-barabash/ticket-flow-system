import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { channelName } from '../lib/realtime'
import { Icon } from './ui'

const DISMISS_KEY = 'tf_notif_prompt'
const supported = () => typeof window !== 'undefined' && 'Notification' in window
const no = (n) => `#${String(n ?? 0).padStart(3, '0')}`

// Native OS notifications for the panel (Electron → system notifications;
// browser → Web Notifications). Realtime is RLS-scoped, so we only hear about
// rows the user may see; own events are skipped. The channel lives as long as
// the USER (not the token / language), so it never silently dies.
export function DesktopNotify() {
  const { user } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const tRef = useRef(t)
  tRef.current = t
  const navRef = useRef(navigate)
  navRef.current = navigate
  const where = useRef({ pathname, search })
  where.current = { pathname, search }
  const [perm, setPerm] = useState(() => (supported() ? Notification.permission : 'unsupported'))
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(DISMISS_KEY)
    } catch {
      return true
    }
  })

  const uidv = user?.id
  useEffect(() => {
    if (!uidv || !supported()) return
    // is that exact ticket / chat on screen right now?
    const onScreen = (pid, kind, id) => {
      if (document.hidden || !document.hasFocus()) return false
      const { pathname: p, search: s } = where.current
      if (pid && p !== `/projects/${pid}`) return false
      const q = new URLSearchParams(s)
      return kind === 'chat' ? q.get('chat') === '1' : q.get('ticket') === id
    }
    const show = (title, body, to, tag) => {
      if (Notification.permission !== 'granted') return
      try {
        const n = new Notification(title, { body, icon: './logo.svg', tag, silent: false })
        n.onclick = () => {
          window.focus()
          if (to) navRef.current(to)
          n.close()
        }
      } catch {
        /* ignore (some browsers only allow SW notifications) */
      }
    }
    const tk = (k) => tRef.current(k)

    const ch = supabase
      .channel(channelName('desktop_notify'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, ({ new: r }) => {
        if (!r || r.created_by === uidv) return
        show(tk(r.is_task ? 'notif.taskAssigned' : 'notif.newTicket'), `${no(r.number)} ${r.title ?? ''}`, `/projects/${r.project_id}?ticket=${r.id}`, `ticket-${r.id}`)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments' }, async ({ new: c }) => {
        if (!c || c.author_id === uidv) return
        const { data: row } = await supabase.from('tickets').select('id, number, title, project_id').eq('id', c.ticket_id).maybeSingle()
        if (row && onScreen(row.project_id, 'ticket', row.id)) return
        show(
          `${tk('notif.newComment')}${row ? ' · ' + no(row.number) : ''}`,
          c.body ? String(c.body).slice(0, 140) : '',
          row ? `/projects/${row.project_id}?ticket=${row.id}` : null,
          `ticket-${c.ticket_id}`,
        )
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_messages' }, async ({ new: m }) => {
        if (!m || m.author_id === uidv || m.deleted_at) return
        if (onScreen(m.project_id, 'chat')) return
        const { data: p } = await supabase.from('projects').select('name').eq('id', m.project_id).maybeSingle()
        show(
          `${tk('panel.chatNotif')}${p?.name ? ' · ' + p.name : ''}`,
          m.body ? String(m.body).slice(0, 140) : tk('panel.chatAttachment'),
          `/projects/${m.project_id}?chat=1`,
          `chat-${m.project_id}`,
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [uidv])

  // Permission must come from a user gesture → a small, dismissible prompt.
  const onPanel = /^\/(projects|workspaces|admin|calendar|account)/.test(pathname)
  if (!uidv || !onPanel || perm !== 'default' || dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }
  const enable = async () => {
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
    } catch {
      setPerm('denied')
    }
    dismiss()
  }

  return (
    <div className="toast-in fixed bottom-4 left-4 z-[44] hidden w-[340px] border border-line2 bg-surface p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] md:block">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-accent text-white">
          <Icon name="bell" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink">{t('panel.notifPromptTitle')}</div>
          <p className="mt-1 text-[13px] text-muted">{t('panel.notifPromptText')}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={enable} className="btn-accent btn-sm">
              {t('panel.notifEnable')}
            </button>
            <button onClick={dismiss} className="btn-quiet btn-sm">
              {t('panel.notifLater')}
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="icon-btn-sm -mr-1 -mt-1" aria-label={t('common.close')}>
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )
}
