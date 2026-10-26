// Chat media: client-side image compression, upload to `chat-media`,
// and a signed-URL cache keyed by storage path.
import { supabase } from '../../lib/supabase'
import { isImageFile, imageExt, imageContentType } from '../../lib/files'

export const BUCKET = 'chat-media'
export const MAX_BYTES = 50 * 1024 * 1024

const uuid = () =>
  (crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    }))
export { uuid }

const COMPRESSIBLE = /^image\/(jpeg|png|webp|bmp)$/

// Downscale to max 2048 px, JPEG q85 (PNG/WebP keep alpha → WebP q85).
export async function compressImage(file) {
  const type = imageContentType(file)
  if (!COMPRESSIBLE.test(type) || typeof createImageBitmap !== 'function') return file
  try {
    const bmp = await createImageBitmap(file)
    const max = 2048
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 600 * 1024) {
      bmp.close?.()
      return file
    }
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const outType = type === 'image/jpeg' || type === 'image/bmp' ? 'image/jpeg' : 'image/webp'
    const blob = await new Promise((res) => canvas.toBlob(res, outType, 0.85))
    if (!blob || blob.size >= file.size) return file
    const ext = outType === 'image/jpeg' ? 'jpg' : 'webp'
    const base = (file.name || 'image').replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.${ext}`, { type: outType })
  } catch {
    return file
  }
}

function extOf(file) {
  if (isImageFile(file) && file.type?.startsWith('image/')) return imageExt(file)
  const n = file.name || ''
  return n.includes('.') ? n.split('.').pop().toLowerCase().slice(0, 8) : 'bin'
}

// Upload one picked file; returns the attachment descriptor stored in jsonb.
export async function uploadChatFile(projectId, file) {
  const f = file.type?.startsWith('image/') || isImageFile(file) ? await compressImage(file) : file
  const path = `${projectId}/${uuid()}.${extOf(f)}`
  const contentType = f.type || (isImageFile(f) ? imageContentType(f) : 'application/octet-stream')
  const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType, upsert: false })
  if (error) throw error
  return { path, name: file.name || f.name || 'file', content_type: contentType, size: f.size }
}

// ── signed URL cache ──
const signed = new Map() // path -> { url, exp }
const TTL = 3600
export function cachedSigned(path) {
  const hit = signed.get(path)
  return hit && hit.exp > Date.now() + 60_000 ? hit.url : null
}
export async function signPaths(paths) {
  const need = [...new Set(paths)].filter((p) => p && !cachedSigned(p))
  if (need.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, TTL)
    ;(data ?? []).forEach((r) => {
      if (r.signedUrl) signed.set(r.path, { url: r.signedUrl, exp: Date.now() + TTL * 1000 })
    })
  }
  const out = {}
  paths.forEach((p) => (out[p] = cachedSigned(p)))
  return out
}

export function removeChatFiles(paths) {
  if (!paths?.length) return
  supabase.storage.from(BUCKET).remove(paths).catch(() => {})
}
