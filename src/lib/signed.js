import { supabase } from './supabase'

// Signed-URL cache: path → { url, exp }. Private buckets (ticket-media,
// chat-media) are signed once per hour instead of on every render/refetch.
const TTL = 3600
const cache = new Map()
const key = (bucket, path) => bucket + '|' + path

export function cachedUrl(bucket, path) {
  const hit = cache.get(key(bucket, path))
  return hit && hit.exp > Date.now() + 60_000 ? hit.url : null
}

// Returns { [path]: signedUrl } for every path it could sign.
export async function signUrls(bucket, paths) {
  const out = {}
  const need = []
  for (const p of new Set(paths.filter(Boolean))) {
    const c = cachedUrl(bucket, p)
    if (c) out[p] = c
    else need.push(p)
  }
  if (need.length) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(need, TTL)
    if (error) console.warn('[signed] sign failed', error)
    const exp = Date.now() + TTL * 1000
    ;(data ?? []).forEach((u) => {
      if (u.path && u.signedUrl) {
        cache.set(key(bucket, u.path), { url: u.signedUrl, exp })
        out[u.path] = u.signedUrl
      }
    })
  }
  return out
}

export function forgetUrl(bucket, path) {
  cache.delete(key(bucket, path))
}
