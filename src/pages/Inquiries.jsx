import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../context/LangContext'
import { TopBar } from '../components/TopBar'
import { EmptyState, ErrorState, Icon, Skeleton, useConfirm, useToast } from '../components/ui'
import { formatDate, timeAgo } from '../lib/format'
import { channelName } from '../lib/realtime'
import { errText } from '../lib/errors'
import { PageHeader } from './Projects'

const STATUSES = ['new', 'contacted', 'closed']
const STATUS_COLOR = {
  new: 'text-accent border-accent/45 bg-accentSoft',
  contacted: 'text-legend border-legend/45 bg-legendSoft',
  closed: 'text-faint border-line bg-surface2',
}

// Moderator-only window: Enterprise inquiries submitted from the landing form.
// RLS already restricts SELECT to moderators; the route is moderator-gated too.
export default function Inquiries() {
  const { t } = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('enterprise_inquiries').select('*').order('created_at', { ascending: false })
    if (e) return setError(e)
    setError(null)
    setItems(data ?? [])
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel(channelName('enterprise_inquiries'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'enterprise_inquiries' }, ({ new: r }) =>
        setItems((xs) => (xs && !xs.some((x) => x.id === r.id) ? [r, ...xs] : xs)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'enterprise_inquiries' }, ({ new: r }) =>
        setItems((xs) => xs && xs.map((x) => (x.id === r.id ? { ...x, ...r } : x))),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'enterprise_inquiries' }, ({ old }) =>
        setItems((xs) => xs && xs.filter((x) => x.id !== old.id)),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  async function setStatus(item, status) {
    if (item.status === status) return
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, status } : x)))
    const { error: e } = await supabase.from('enterprise_inquiries').update({ status }).eq('id', item.id)
    if (e) {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, status: item.status } : x)))
      toast.show(errText(t, e), { tone: 'error' })
    }
  }

  async function remove(item) {
    const ok = await confirm({ title: t('inquiries.remove'), body: t('inquiries.confirmDelete', { email: item.email }), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    const before = items
    setItems((xs) => xs.filter((x) => x.id !== item.id))
    const { error: e } = await supabase.from('enterprise_inquiries').delete().eq('id', item.id)
    if (e) {
      setItems(before)
      toast.show(errText(t, e), { tone: 'error' })
    }
  }

  const newCount = (items ?? []).filter((x) => x.status === 'new').length

  return (
    <div className="min-h-screen bg-bg">
      <TopBar crumbs={[{ label: t('topbar.inquiries') }]} />
      <main className="mx-auto max-w-[1000px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <PageHeader tag={t('inquiries.label')} title={t('inquiries.heading')} sub={t('inquiries.sub')}>
          {newCount > 0 && (
            <span className="border border-accent bg-accent px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white">
              {t('inquiries.countNew', { n: newCount })}
            </span>
          )}
        </PageHeader>

        {error && !items ? (
          <ErrorState message={errText(t, error, 'common.loadError')} onRetry={load} />
        ) : !items ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title={t('inquiries.empty')} hint={t('inquiries.emptyHint')} />
        ) : (
          <ul className="space-y-3">
            {items.map((it, i) => (
              <InquiryCard key={it.id} index={i} item={it} onStatus={setStatus} onRemove={remove} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function InquiryCard({ item, index, onStatus, onRemove }) {
  const { t } = useT()
  const statusLabel = {
    new: t('inquiries.statusNew'),
    contacted: t('inquiries.statusContacted'),
    closed: t('inquiries.statusClosed'),
  }
  return (
    <li className={`card-in border border-line bg-surface p-5 ${item.status === 'new' ? 'border-l-4 border-l-accent' : ''}`} style={{ '--i': index }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[20px] font-bold uppercase tracking-tight text-ink">{item.company || t('inquiries.noCompany')}</div>
          {item.name && <div className="mt-0.5 truncate text-[15px] text-muted">{item.name}</div>}
        </div>
        <span
          className={`shrink-0 border px-2 py-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] ${STATUS_COLOR[item.status] || STATUS_COLOR.new}`}
        >
          {statusLabel[item.status] || item.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
        <a href={`mailto:${item.email}`} className="flex items-center gap-1.5 text-accent hover:underline">
          <Icon name="mail" size={15} /> {item.email}
        </a>
        {item.phone && (
          <a href={`tel:${item.phone}`} className="flex items-center gap-1.5 text-muted hover:text-ink">
            <Icon name="phone" size={15} /> {item.phone}
          </a>
        )}
      </div>

      {item.message && (
        <p className="mt-3 whitespace-pre-wrap border-l-2 border-line2 pl-3 text-[15px] leading-relaxed text-ink/85">{item.message}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-[13px] text-muted" title={formatDate(item.created_at)}>
          {t('inquiries.received')}: {timeAgo(item.created_at)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatus(item, s)}
              className={`chip press ${item.status === s ? 'chip-on' : ''}`}
            >
              {statusLabel[s]}
            </button>
          ))}
          <a href={`mailto:${item.email}`} className="btn-ghost btn-sm">
            <Icon name="reply" size={15} /> {t('inquiries.reply')}
          </a>
          <button onClick={() => onRemove(item)} className="icon-btn-sm hover:!text-accent" title={t('inquiries.remove')} aria-label={t('inquiries.remove')}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </li>
  )
}
