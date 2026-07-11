import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { Spinner, EmptyState } from '../components/ui'
import { formatDate, timeAgo } from '../lib/format'

const STATUSES = ['new', 'contacted', 'closed']
const STATUS_COLOR = {
  new: 'text-accent border-accent/45 bg-accentSoft',
  contacted: 'text-legend border-legend/45 bg-legendSoft',
  closed: 'text-faint border-line bg-surface2',
}

// Moderator-only window: Enterprise inquiries submitted from the landing form.
// RLS already restricts SELECT to moderators; the route is moderator-gated too.
export default function Inquiries() {
  const navigate = useNavigate()
  const { t } = useT()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('enterprise_inquiries')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('enterprise_inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enterprise_inquiries' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  async function setStatus(item, status) {
    if (item.status === status) return
    // Optimistic update, then persist.
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, status } : x)))
    const { error } = await supabase.from('enterprise_inquiries').update({ status }).eq('id', item.id)
    if (error) load()
  }

  async function remove(item) {
    if (!confirm(t('inquiries.confirmDelete', { email: item.email }))) return
    setItems((xs) => xs.filter((x) => x.id !== item.id))
    const { error } = await supabase.from('enterprise_inquiries').delete().eq('id', item.id)
    if (error) load()
  }

  const newCount = items.filter((x) => x.status === 'new').length

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <button onClick={() => navigate('/projects')} className="label mb-5 hover:text-ink transition-colors">
          {t('inquiries.toProjects')}
        </button>

        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="label">{t('inquiries.label')} · MMXXVI</span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t('inquiries.heading')}</h1>
            <p className="mt-1 text-sm text-faint">{t('inquiries.sub')}</p>
          </div>
          {newCount > 0 && (
            <span className="shrink-0 border border-accent/45 bg-accentSoft px-2.5 py-1 font-mono text-[11px] uppercase tracking-label text-accent">
              {t('inquiries.countNew', { n: newCount })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t('inquiries.empty')} hint={t('inquiries.emptyHint')} />
        ) : (
          <ul className="space-y-4">
            {items.map((it) => (
              <InquiryCard key={it.id} item={it} onStatus={setStatus} onRemove={remove} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function InquiryCard({ item, onStatus, onRemove }) {
  const { t } = useT()
  const statusLabel = {
    new: t('inquiries.statusNew'),
    contacted: t('inquiries.statusContacted'),
    closed: t('inquiries.statusClosed'),
  }
  return (
    <li className={`border border-line bg-surface p-5 ${item.status === 'new' ? 'border-l-2 border-l-accent' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-ink">{item.company || t('inquiries.noCompany')}</div>
          {item.name && <div className="mt-0.5 truncate text-sm text-muted">{item.name}</div>}
        </div>
        <span
          className={`shrink-0 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_COLOR[item.status] || STATUS_COLOR.new}`}
        >
          {statusLabel[item.status] || item.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a href={`mailto:${item.email}`} className="text-accent hover:underline">
          {item.email}
        </a>
        {item.phone && (
          <a href={`tel:${item.phone}`} className="text-muted hover:text-ink">
            {item.phone}
          </a>
        )}
      </div>

      {item.message && (
        <p className="mt-3 whitespace-pre-wrap border-l border-line pl-3 text-sm leading-relaxed text-muted">{item.message}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="label-sm text-faint" title={formatDate(item.created_at)}>
          {t('inquiries.received')}: {timeAgo(item.created_at)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatus(item, s)}
              className={`border px-2.5 py-1 text-[11px] transition-colors ${
                item.status === s ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-line2'
              }`}
            >
              {statusLabel[s]}
            </button>
          ))}
          <a href={`mailto:${item.email}`} className="label-sm text-legend hover:text-ink">
            {t('inquiries.reply')}
          </a>
          <button onClick={() => onRemove(item)} className="label-sm text-faint hover:text-accent">
            {t('inquiries.remove')}
          </button>
        </div>
      </div>
    </li>
  )
}
