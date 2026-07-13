import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'

// Native OS notifications for the panel — in the desktop app (Electron) these
// render as real system notifications; in a browser they use the Web
// Notifications API. Realtime is RLS-scoped, so we only ever hear about rows the
// signed-in user may see. Events the user caused themselves are skipped.
export function DesktopNotify() {
  const { session, user } = useAuth()
  const { t } = useT()

  useEffect(() => {
    if (!session || typeof window === 'undefined' || !('Notification' in window)) return

    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const show = (title, body) => {
      if (Notification.permission !== 'granted') return
      try {
        new Notification(title, { body, icon: './logo.png', silent: false })
      } catch {
        /* ignore */
      }
    }
    const no = (n) => `#${String(n ?? 0).padStart(3, '0')}`

    const ch = supabase
      .channel('desktop_notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, ({ new: tk }) => {
        if (!tk || tk.created_by === user?.id) return
        show(t(tk.is_task ? 'notif.taskAssigned' : 'notif.newTicket'), `${no(tk.number)} ${tk.title ?? ''}`)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments' }, ({ new: c }) => {
        if (!c || c.author_id === user?.id) return
        show(t('notif.newComment'), c.body ? String(c.body).slice(0, 120) : '')
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [session, user?.id, t])

  return null
}
