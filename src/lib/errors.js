// Map raw backend / network errors to friendly, translated text. The raw
// message goes to the console for debugging — never into the UI.
export function errText(t, err, fallbackKey = 'common.error') {
  if (err) console.warn('[error]', err)
  const m = String(err?.message || err?.error_description || err || '').toLowerCase()
  if (!m) return t(fallbackKey)
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed'))
    return t('errors.network')
  if (m.includes('jwt') || m.includes('not authenticated') || m.includes('invalid refresh token')) return t('errors.session')
  if (m.includes('row-level security') || m.includes('permission denied') || m.includes('not allowed') || m.includes('forbidden'))
    return t('errors.forbidden')
  if (m.includes('payload too large') || m.includes('exceeded the maximum') || m.includes('entity too large')) return t('errors.tooLarge')
  if (m.includes('duplicate key')) return t('errors.duplicate')
  if (m.includes('mime type') || m.includes('invalid_mime')) return t('errors.fileType')
  if (m.includes('violates check constraint') || m.includes('invalid input')) return t('errors.invalid')
  return t(fallbackKey)
}
