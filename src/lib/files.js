// Helpers for handling picked image files robustly across browsers.
//
// On Android browsers (notably Opera GX) files picked from the gallery/file
// picker often arrive with an empty `file.type` ("") — the OS content provider
// doesn't report a MIME type. The naive filter `f.type.startsWith('image/')`
// then silently drops the file, so "adding a photo does nothing". These helpers
// fall back to the file extension instead of trusting `file.type` alone.

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'svg']

const EXT_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

function extOf(name) {
  if (!name || !name.includes('.')) return ''
  return name.split('.').pop().toLowerCase()
}

// A file counts as an image if its MIME type says so, OR (when the browser
// reports no type) its extension matches a known image format. Files coming
// straight from an <input accept="image/*"> with no type/extension are still
// accepted — the OS already restricted the picker to images.
export function isImageFile(f) {
  if (!f) return false
  if (f.type) return f.type.startsWith('image/')
  const ext = extOf(f.name)
  return ext === '' || IMAGE_EXTS.includes(ext)
}

// Extension for the storage path: from name, else from MIME type, else jpg.
export function imageExt(f) {
  const fromName = extOf(f?.name)
  if (fromName) return fromName
  if (f?.type && f.type.includes('/')) return f.type.split('/')[1].split('+')[0]
  return 'jpg'
}

// Content type to store. Falls back from MIME → extension → image/jpeg so the
// signed URL renders inline instead of being treated as a binary download.
export function imageContentType(f) {
  if (f?.type) return f.type
  return EXT_MIME[extOf(f?.name)] || 'image/jpeg'
}

// Formats an <img> tag can actually render. TIFF and HEIC/HEIF are valid image
// uploads but no mainstream browser renders them in <img> — they show as a
// broken icon. Use this to fall back to a "open file" tile instead.
const WEB_RENDERABLE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico']
const WEB_RENDERABLE_MIME = /^image\/(jpeg|png|gif|webp|bmp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/

// `meta` is an attachment row ({ content_type, name }) or a File.
export function isDisplayableImage(meta) {
  if (!meta) return false
  const type = meta.content_type || meta.type
  if (type) return WEB_RENDERABLE_MIME.test(type)
  return WEB_RENDERABLE_EXTS.includes(extOf(meta.name))
}

// Short uppercase label for a file's format, e.g. "TIFF", for fallback tiles.
export function formatLabel(meta) {
  const ext = extOf(meta?.name)
  if (ext) return ext.toUpperCase()
  const type = meta?.content_type || meta?.type
  if (type && type.includes('/')) return type.split('/')[1].split('+')[0].toUpperCase()
  return 'ФАЙЛ'
}
