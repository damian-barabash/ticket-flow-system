import { useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'

// realtime-js returns the EXISTING channel when the topic repeats and
// removeChannel() is async — re-mounting with the same name silently kills the
// subscription. Every mount therefore gets a unique topic.
export function uid() {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

export function channelName(base) {
  return `${base}:${uid().slice(0, 8)}`
}

// Subscribe a channel for the lifetime of the effect. `setup(ch)` adds .on(...)
// handlers. Handlers should read fresh state via refs.
export function useRealtime(base, setup, deps) {
  useEffect(() => {
    if (!base) return
    const ch = supabase.channel(channelName(base))
    setup(ch)
    ch.subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Debounced function (stable identity). Bursts of realtime events → one call.
export function useDebounced(fn, ms = 250) {
  const ref = useRef(fn)
  ref.current = fn
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  return useCallback(
    (...args) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => ref.current(...args), ms)
    },
    [ms],
  )
}

// Run `.in(column, ids)` queries in chunks (URL length) and merge rows.
export async function inChunks(ids, size, make) {
  const list = [...new Set(ids)].filter(Boolean)
  if (!list.length) return { data: [], error: null }
  const parts = []
  for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size))
  const res = await Promise.all(parts.map((p) => make(p)))
  const err = res.find((r) => r.error)?.error ?? null
  return { data: res.flatMap((r) => r.data ?? []), error: err }
}
