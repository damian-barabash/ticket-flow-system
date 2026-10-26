import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

// Shared unread state so every badge (top menu, project card, project header)
// shows the same numbers without each refetching on its own.
let state = { counts: {}, at: 0 }
const listeners = new Set()
const EMPTY = {}
let inflight = null
const set = (counts) => {
  state = { counts, at: Date.now(), uid: myId }
  listeners.forEach((l) => l(state))
}

async function fetchCounts() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('chat_unread_counts')
      if (error) return
      const m = {}
      ;(data ?? []).forEach((r) => (m[r.project_id] = Number(r.unread) || 0))
      set(m)
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// { counts: {projectId: n}, total, refresh }
export function useChatUnread() {
  const { user } = useAuth()
  const uid = user?.id
  const [s, setS] = useState(state)
  const timer = useRef(null)
  const refresh = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(fetchCounts, 250)
  }, [])

  // (re)subscribe once the session is known — a channel joined before sign-in
  // carries the anon JWT and RLS would filter out every row.
  useEffect(() => {
    if (!uid) return
    listeners.add(setS)
    if (Date.now() - state.at > 5000 || state.uid !== uid) fetchCounts()
    const name = 'chat-unread-' + Math.random().toString(36).slice(2)
    const ch = supabase
      .channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_messages' }, refresh)
      .subscribe()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      listeners.delete(setS)
      clearTimeout(timer.current)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(ch)
    }
  }, [refresh, uid])

  const counts = uid ? s.counts : EMPTY
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])
  return { counts, total, refresh }
}

let myId = null
supabase.auth.onAuthStateChange((_e, sess) => {
  myId = sess?.user?.id ?? null
})

// Mark a project's chat read for me (optimistically zero the shared badge).
export async function markChatRead(projectId) {
  if (!projectId) return
  if (state.counts[projectId]) set({ ...state.counts, [projectId]: 0 })
  let uid = myId
  if (!uid) {
    const { data } = await supabase.auth.getSession()
    uid = data?.session?.user?.id
  }
  if (!uid) return
  await supabase
    .from('project_chat_reads')
    .upsert({ project_id: projectId, user_id: uid, last_read_at: new Date().toISOString() }, { onConflict: 'project_id,user_id' })
}
