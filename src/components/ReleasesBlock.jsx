import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { formatSize, timeAgo } from '../lib/format'
import { Icon, Skeleton, Spinner, useConfirm, useToast } from './ui'
import { channelName } from '../lib/realtime'
import { errText } from '../lib/errors'
import { usePeople } from './AssigneePicker'

const ReleaseFormModal = lazy(() => import('./ReleaseFormModal').then((m) => ({ default: m.ReleaseFormModal })))

export const safeHttpUrl = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

// "Project versions" — files + links published by the admin. Each user sees
// whether they already downloaded/opened an item; staff also see who did.
export function ReleasesBlock({ projectId }) {
  const { user, isStaff } = useAuth()
  const { t } = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const { people, byId } = usePeople(projectId)
  const [releases, setReleases] = useState(null)
  const [error, setError] = useState(false)
  const [myReads, setMyReads] = useState({})
  const [allReads, setAllReads] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [add, setAdd] = useState(null) // 'file' | 'link'
  const req = useRef(0)

  const loadReads = useCallback(
    async (ids, my) => {
      if (!ids.length) return
      const [mine, all] = await Promise.all([
        supabase.from('release_reads').select('release_id, accessed_at').eq('user_id', user.id).in('release_id', ids),
        isStaff ? supabase.from('release_reads').select('release_id, user_id, accessed_at').in('release_id', ids) : Promise.resolve({ data: [] }),
      ])
      if (my !== req.current) return
      const mr = {}
      ;(mine.data ?? []).forEach((r) => (mr[r.release_id] = r.accessed_at))
      setMyReads(mr)
      const ar = {}
      ;(all.data ?? []).forEach((r) => (ar[r.release_id] ||= []).push(r))
      setAllReads(ar)
    },
    [user.id, isStaff],
  )

  const load = useCallback(async () => {
    const my = ++req.current
    const { data, error: e } = await supabase.from('project_releases').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    if (my !== req.current) return
    if (e) {
      setError(true)
      return
    }
    setError(false)
    setReleases(data ?? [])
    loadReads((data ?? []).map((r) => r.id), my)
  }, [projectId, loadReads])

  useEffect(() => {
    setReleases(null)
    load()
    const ch = supabase
      .channel(channelName(`releases-${projectId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_releases', filter: `project_id=eq.${projectId}` }, ({ new: r }) =>
        setReleases((xs) => (xs && !xs.some((x) => x.id === r.id) ? [r, ...xs] : xs)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_releases', filter: `project_id=eq.${projectId}` }, ({ new: r }) =>
        setReleases((xs) => xs && xs.map((x) => (x.id === r.id ? { ...x, ...r } : x))),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'project_releases' }, ({ old }) =>
        setReleases((xs) => xs && xs.filter((x) => x.id !== old.id)),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [projectId, load])

  function markAccessed(rel) {
    if (myReads[rel.id]) return
    const now = new Date().toISOString()
    setMyReads((p) => ({ ...p, [rel.id]: now }))
    if (isStaff) setAllReads((a) => ({ ...a, [rel.id]: [...(a[rel.id] || []), { release_id: rel.id, user_id: user.id, accessed_at: now }] }))
    supabase
      .from('release_reads')
      .upsert({ release_id: rel.id, user_id: user.id, accessed_at: now })
      .then(({ error: e }) => e && console.warn('[releases] read', e))
  }

  async function openRelease(rel) {
    if (rel.kind !== 'file') {
      // links open synchronously inside the click (popup blockers) — http(s) only
      const url = safeHttpUrl(rel.url)
      if (!url) return toast.show(t('panel.badLink'), { tone: 'error' })
      window.open(url, '_blank', 'noopener,noreferrer')
      markAccessed(rel)
      return
    }
    // Safari blocks window.open after an await → open a blank tab NOW, fill it later
    const win = window.open('', '_blank')
    setBusyId(rel.id)
    const { data, error: e } = await supabase.storage.from('project-files').createSignedUrl(rel.path, 3600, { download: rel.name || true })
    setBusyId(null)
    if (e || !data?.signedUrl) {
      win?.close()
      toast.show(errText(t, e, 'panel.errOpen'), { tone: 'error' })
      return
    }
    if (win) win.location.href = data.signedUrl
    else window.location.href = data.signedUrl
    markAccessed(rel)
  }

  async function remove(rel) {
    if (!isStaff) return
    const ok = await confirm({ title: t('panel.deleteRelease'), body: t('releases.confirmDelete', { title: rel.title }), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    const before = releases
    setReleases((xs) => xs.filter((x) => x.id !== rel.id))
    // DB row first; the file only after the row is really gone
    const { error: e } = await supabase.from('project_releases').delete().eq('id', rel.id)
    if (e) {
      setReleases(before)
      toast.show(errText(t, e), { tone: 'error' })
      return
    }
    if (rel.kind === 'file' && rel.path) supabase.storage.from('project-files').remove([rel.path])
  }

  if (releases && releases.length === 0 && !isStaff && !error) return null

  const clientCount = (people || []).filter((p) => !p.is_owner && p.role === 'user').length
  const shown = showAll ? releases ?? [] : (releases ?? []).slice(0, 4)

  return (
    <section className="border border-line bg-surface" data-tour="releases">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
          <Icon name="version" size={17} className="text-muted" />
          {t('releases.heading')}
          {releases?.length > 0 && <span className="num text-[12px] text-faint">{releases.length}</span>}
        </span>
        {isStaff && (
          <div className="flex gap-1.5">
            <button onClick={() => setAdd('file')} className="press flex h-9 items-center gap-1.5 border border-line px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink hover:border-ink">
              <Icon name="upload" size={15} /> {t('panel.addFile')}
            </button>
            <button onClick={() => setAdd('link')} className="press flex h-9 items-center gap-1.5 border border-line px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink hover:border-ink">
              <Icon name="link" size={15} /> {t('panel.addLink')}
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-[14px] text-muted">
          {t('common.loadError')}
          <button onClick={load} className="btn-link text-[13px]">
            {t('common.retry')}
          </button>
        </div>
      ) : !releases ? (
        <div className="space-y-3 px-4 py-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : releases.length === 0 ? (
        <p className="px-4 py-5 text-[14px] text-muted">{t('releases.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((rel) => {
            const read = !!myReads[rel.id]
            const isFile = rel.kind === 'file'
            const downloaders = allReads[rel.id] || []
            return (
              <li key={rel.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line text-muted">
                    <Icon name={isFile ? 'download' : 'external'} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-ink">{rel.title}</span>
                      {rel.version && <span className="num shrink-0 border border-line px-1.5 text-[12px] text-muted">{rel.version}</span>}
                      {!read && <span className="shrink-0 bg-accent px-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white">{t('releases.fresh')}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-faint">
                      {isFile ? `${rel.name || t('common.file')}${rel.size != null ? ' · ' + formatSize(rel.size) : ''}` : prettyUrl(rel.url)}
                    </div>
                  </div>
                  <button onClick={() => openRelease(rel)} disabled={busyId === rel.id} className="btn-ghost btn-sm shrink-0 px-3">
                    {busyId === rel.id ? <Spinner size={13} /> : <Icon name={isFile ? 'download' : 'external'} size={15} />}
                    <span className="hidden sm:inline">{isFile ? t('releases.download') : t('releases.open')}</span>
                  </button>
                  {isStaff && (
                    <button onClick={() => remove(rel)} className="icon-btn-sm shrink-0 hover:!text-accent" title={t('common.delete')} aria-label={t('common.delete')}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>

                {isStaff && (
                  <div className="mt-1.5 pl-12">
                    <button
                      onClick={() => setExpanded((e) => (e === rel.id ? null : rel.id))}
                      className="flex items-center gap-1 text-[13px] text-faint transition-colors hover:text-muted"
                      disabled={!downloaders.length}
                    >
                      <Icon name="eye" size={14} />
                      {isFile ? t('releases.statDownloaded') : t('releases.statOpened')}: {t('releases.statCount', { a: downloaders.length, b: clientCount })}
                      {downloaders.length > 0 && <Icon name={expanded === rel.id ? 'up' : 'down'} size={13} />}
                    </button>
                    {expanded === rel.id && downloaders.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {downloaders.map((d) => (
                          <li key={d.user_id} className="text-[13px] text-muted">
                            {byId?.[d.user_id]?.full_name || byId?.[d.user_id]?.email || '—'} · {timeAgo(d.accessed_at)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {releases?.length > 4 && (
        <button onClick={() => setShowAll((v) => !v)} className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-[13px] font-semibold text-muted hover:text-ink">
          <Icon name={showAll ? 'up' : 'down'} size={15} />
          {showAll ? t('panel.showLess') : t('panel.showAll', { n: releases.length })}
        </button>
      )}

      <Suspense fallback={null}>
        {add && (
          <ReleaseFormModal
            open
            onClose={() => setAdd(null)}
            projectId={projectId}
            initial={add}
            onSaved={(rows) => {
              if (rows?.length) setReleases((xs) => [...rows.filter((r) => !(xs ?? []).some((x) => x.id === r.id)), ...(xs ?? [])])
              else load()
            }}
          />
        )}
      </Suspense>
    </section>
  )
}

function prettyUrl(url) {
  try {
    const u = new URL(url)
    return u.host + (u.pathname !== '/' ? u.pathname : '')
  } catch {
    return url
  }
}
