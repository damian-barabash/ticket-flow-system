import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Icon, Spinner, ErrorState } from './ui'

const KEYS = [
  { k: 'tickets', icon: 'ticket' },
  { k: 'status', icon: 'refresh' },
  { k: 'comments', icon: 'chat' },
  { k: 'chat', icon: 'users' },
  { k: 'assigned', icon: 'userPlus' },
  { k: 'reminders', icon: 'clock' },
]
const DEFAULTS = { tickets: true, status: true, comments: true, chat: true, assigned: true, reminders: true, muted_projects: [] }

// Square switch (brand: no pills)
function Switch({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors duration-150 disabled:opacity-40 ${on ? 'border-accent bg-accent' : 'border-line2 bg-bg'}`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 transition-transform duration-150 ease-[cubic-bezier(.2,.8,.2,1)] ${on ? 'translate-x-[22px] bg-white' : 'translate-x-[3px] bg-muted'}`}
      />
    </button>
  )
}

function browserPerm() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// Account → Notifications. Push copy for the mobile/desktop apps is controlled
// server-side by `notification_settings` (missing row = everything on).
export function NotificationSettings() {
  const { user } = useAuth()
  const { t } = useT()
  const [s, setS] = useState(null)
  const [projects, setProjects] = useState([])
  const [state, setState] = useState('loading')
  const [saved, setSaved] = useState(false)
  const [perm, setPerm] = useState(browserPerm)
  const timer = useRef(null)
  const latest = useRef(null)

  async function load() {
    setState('loading')
    const [ns, ps] = await Promise.all([
      supabase.from('notification_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('projects').select('id, name, archived').order('name'),
    ])
    if (ns.error) {
      setState('error')
      return
    }
    setS({ ...DEFAULTS, ...(ns.data || {}), muted_projects: ns.data?.muted_projects || [] })
    setProjects((ps.data || []).filter((p) => !p.archived))
    setState('ready')
  }
  useEffect(() => {
    if (user?.id) load()
    return () => clearTimeout(timer.current)
  }, [user?.id])

  function update(patch) {
    const prev = s
    const next = { ...s, ...patch }
    setS(next)
    latest.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const v = latest.current
      const row = { user_id: user.id, muted_projects: v.muted_projects, updated_at: new Date().toISOString() }
      KEYS.forEach(({ k }) => (row[k] = v[k]))
      const { error } = await supabase.from('notification_settings').upsert(row, { onConflict: 'user_id' })
      if (error) {
        setS(prev)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1400)
    }, 350)
  }
  const toggleMute = (id) => {
    const m = s.muted_projects.includes(id) ? s.muted_projects.filter((x) => x !== id) : [...s.muted_projects, id]
    update({ muted_projects: m })
  }

  async function askBrowser() {
    if (perm === 'unsupported') return
    try {
      const r = await Notification.requestPermission()
      setPerm(r)
      if (r === 'granted') new Notification('Ticket Flow', { body: t('notifSettings.browserTest'), icon: './logo.png' })
    } catch {
      setPerm(browserPerm())
    }
  }

  return (
    <section className="border border-line bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <div className="tag">{t('notifSettings.title')}</div>
          <p className="mt-2 max-w-lg text-[14px] text-muted">{t('notifSettings.intro')}</p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-[13px] text-ok transition-opacity duration-200 ${saved ? 'opacity-100' : 'opacity-0'}`}>
          <Icon name="check" size={14} /> {t('common.saved')}
        </span>
      </div>

      {state === 'loading' ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : state === 'error' ? (
        <div className="p-5">
          <ErrorState onRetry={load} />
        </div>
      ) : (
        <>
          <div className="divide-y divide-line">
            {KEYS.map(({ k, icon }) => (
              <label key={k} className="flex cursor-pointer items-center gap-4 px-5 py-3.5 hover:bg-surface2">
                <Icon name={icon} size={18} className={s[k] ? 'text-ink' : 'text-faint'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-ink">{t('notifSettings.k.' + k)}</span>
                  <span className="block text-[13px] text-faint">{t('notifSettings.h.' + k)}</span>
                </span>
                <Switch on={!!s[k]} onChange={(v) => update({ [k]: v })} label={t('notifSettings.k.' + k)} />
              </label>
            ))}
          </div>

          {projects.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <div className="label">{t('notifSettings.projects')}</div>
              <p className="mt-1 text-[13px] text-faint">{t('notifSettings.projectsHint')}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {projects.map((p) => {
                  const muted = s.muted_projects.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleMute(p.id)}
                      className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-colors ${muted ? 'border-line bg-bg text-faint' : 'border-line hover:border-line2'}`}
                      aria-pressed={!muted}
                    >
                      <Icon name={muted ? 'bellOff' : 'bell'} size={17} className={muted ? 'text-faint' : 'text-accent'} />
                      <span className={`min-w-0 flex-1 truncate text-[15px] ${muted ? 'line-through' : 'text-ink'}`}>{p.name}</span>
                      <span className="text-[12px] font-semibold uppercase tracking-[0.06em]">{muted ? t('notifSettings.muted') : t('notifSettings.on')}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4">
            <Icon name="globe" size={18} className="text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] text-ink">{t('notifSettings.browser')}</div>
              <div className="text-[13px] text-faint">
                {perm === 'granted'
                  ? t('notifSettings.browserOn')
                  : perm === 'denied'
                    ? t('notifSettings.browserDenied')
                    : perm === 'unsupported'
                      ? t('notifSettings.browserUnsupported')
                      : t('notifSettings.browserHint')}
              </div>
            </div>
            {perm === 'default' && (
              <button className="btn-ghost btn-sm" onClick={askBrowser}>
                {t('notifSettings.browserEnable')}
              </button>
            )}
            {perm === 'granted' && (
              <button className="btn-quiet btn-sm" onClick={askBrowser}>
                {t('notifSettings.browserTestBtn')}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export default NotificationSettings
