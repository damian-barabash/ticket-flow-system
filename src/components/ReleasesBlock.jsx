import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatSize, timeAgo } from '../lib/format'
import { Spinner } from './ui'
import { ReleaseFormModal } from './ReleaseFormModal'

// "Версии проекта" — files + links published by the admin. Each user sees whether
// they already downloaded/opened an item; the admin additionally sees who did.
export function ReleasesBlock({ projectId }) {
  const { user, isAdmin } = useAuth()
  const [releases, setReleases] = useState([])
  const [myReads, setMyReads] = useState({}) // release_id -> accessed_at (current user)
  const [allReads, setAllReads] = useState({}) // admin: release_id -> [{ user_id, accessed_at }]
  const [names, setNames] = useState({}) // user_id -> label
  const [memberCount, setMemberCount] = useState(0) // admin: # of client members
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addInitial, setAddInitial] = useState('file')

  const load = useCallback(async () => {
    const { data: rel } = await supabase
      .from('project_releases')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    const list = rel ?? []
    setReleases(list)

    const ids = list.map((r) => r.id)
    // current user's reads
    const { data: mine } = await supabase
      .from('release_reads')
      .select('release_id, accessed_at')
      .eq('user_id', user.id)
    const mr = {}
    ;(mine ?? []).forEach((r) => (mr[r.release_id] = r.accessed_at))
    setMyReads(mr)

    if (isAdmin) {
      const [{ data: reads }, { data: mem }] = await Promise.all([
        ids.length
          ? supabase.from('release_reads').select('release_id, user_id, accessed_at').in('release_id', ids)
          : Promise.resolve({ data: [] }),
        supabase.from('project_members').select('user_id').eq('project_id', projectId),
      ])
      const ar = {}
      ;(reads ?? []).forEach((r) => (ar[r.release_id] || (ar[r.release_id] = [])).push(r))
      setAllReads(ar)
      setMemberCount((mem ?? []).length)
      const uids = [...new Set((reads ?? []).map((r) => r.user_id))]
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', uids)
        const nm = {}
        ;(profs ?? []).forEach((p) => (nm[p.id] = p.full_name || p.email || '—'))
        setNames(nm)
      }
    }
    setLoading(false)
  }, [projectId, user.id, isAdmin])

  useEffect(() => {
    setLoading(true)
    load()
    const ch = supabase
      .channel(`releases-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_releases', filter: `project_id=eq.${projectId}` },
        () => load(),
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [projectId, load])

  // record that the current user accessed this item, then flip the local badge
  async function markAccessed(rel) {
    if (myReads[rel.id]) return
    const now = new Date().toISOString()
    setMyReads((p) => ({ ...p, [rel.id]: now }))
    await supabase.from('release_reads').upsert({ release_id: rel.id, user_id: user.id, accessed_at: now })
    if (isAdmin) load()
  }

  async function openRelease(rel) {
    setBusyId(rel.id)
    try {
      if (rel.kind === 'file') {
        const { data, error } = await supabase.storage
          .from('project-files')
          .createSignedUrl(rel.path, 3600, { download: rel.name || true })
        if (error) throw error
        window.open(data.signedUrl, '_blank')
      } else {
        window.open(rel.url, '_blank', 'noopener')
      }
      await markAccessed(rel)
    } catch (err) {
      alert('Не удалось открыть: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(rel) {
    if (!isAdmin) return
    if (!confirm(`Удалить «${rel.title}»?`)) return
    setBusyId(rel.id)
    try {
      if (rel.kind === 'file' && rel.path) await supabase.storage.from('project-files').remove([rel.path])
      const { error } = await supabase.from('project_releases').delete().eq('id', rel.id)
      if (error) throw error
      load()
    } catch (err) {
      alert('Не удалось удалить: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  function openAdd(kind) {
    setAddInitial(kind)
    setShowAdd(true)
  }

  // hide the whole block for clients when there is nothing published yet
  if (!loading && releases.length === 0 && !isAdmin) return null

  return (
    <section className="mb-6 border border-line bg-surface" data-tour="releases">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="label">Версии проекта</span>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => openAdd('file')} className="label text-muted transition-colors hover:text-ink">
              ＋ файл
            </button>
            <button onClick={() => openAdd('link')} className="label text-muted transition-colors hover:text-ink">
              ＋ ссылка
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : releases.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-faint">
          Пока нет файлов и ссылок. Добавьте сборку или ссылку на демо для клиента.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {releases.map((rel) => {
            const read = !!myReads[rel.id]
            const isFile = rel.kind === 'file'
            const downloaders = allReads[rel.id] || []
            return (
              <li key={rel.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 font-mono text-sm text-muted">{isFile ? '⤓' : '↗'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm text-ink">{rel.title}</span>
                      {rel.version && (
                        <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {rel.version}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-faint">
                      {isFile ? `${rel.name || 'файл'}${rel.size != null ? ' · ' + formatSize(rel.size) : ''}` : prettyUrl(rel.url)}
                    </div>
                  </div>

                  {/* per-user read badge */}
                  {read ? (
                    <span className="hidden shrink-0 font-mono text-[10px] text-ok sm:inline">
                      ✓ {isFile ? 'скачано' : 'открыто'}
                    </span>
                  ) : (
                    <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-accent sm:inline-flex">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" /> новое
                    </span>
                  )}

                  <button
                    onClick={() => openRelease(rel)}
                    disabled={busyId === rel.id}
                    className="btn-ghost shrink-0 px-3 py-1.5 text-[10px]"
                  >
                    {busyId === rel.id ? <Spinner className="h-3 w-3" /> : isFile ? 'Скачать' : 'Открыть'}
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => remove(rel)}
                      disabled={busyId === rel.id}
                      className="shrink-0 px-1 text-faint transition-colors hover:text-accent"
                      title="Удалить"
                      aria-label="Удалить"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* admin: who already downloaded/opened */}
                {isAdmin && (
                  <div className="mt-2 pl-7">
                    <button
                      onClick={() => setExpanded((e) => (e === rel.id ? null : rel.id))}
                      className="font-mono text-[10px] text-faint transition-colors hover:text-muted"
                    >
                      {isFile ? 'скачали' : 'открыли'}: {downloaders.length} из {memberCount}
                      {downloaders.length > 0 && <span className="ml-1">{expanded === rel.id ? '▲' : '▾'}</span>}
                    </button>
                    {expanded === rel.id && downloaders.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {downloaders.map((d) => (
                          <li key={d.user_id} className="font-mono text-[10px] text-muted">
                            {names[d.user_id] || d.user_id} · {timeAgo(d.accessed_at)}
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

      {showAdd && (
        <ReleaseFormModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          projectId={projectId}
          initial={addInitial}
          onSaved={load}
        />
      )}
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
