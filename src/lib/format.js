import { dict, translate, DEFAULT_LANG, normalizeLang } from './i18n'

// Date/time/size formatting follows the active UI language. The language is set
// once by LangProvider (setFormatLang) so call sites don't have to thread it.
let curLang = DEFAULT_LANG

export function setFormatLang(lang) {
  curLang = normalizeLang(lang)
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const months = dict(curLang).months
  return `${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`
}

// Date only (no time) — for deadline dates stored as 'YYYY-MM-DD'.
export function formatDay(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(dateStr)
  const months = dict(curLang).months
  return `${d} ${months[m - 1]} ${y}`
}

export function formatSize(bytes) {
  if (bytes == null) return ''
  const units = dict(curLang).units
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}

export function timeAgo(iso) {
  if (!iso) return ''
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return translate(curLang, 'relTime.now')
  const min = Math.floor(sec / 60)
  if (min < 60) return translate(curLang, 'relTime.min', { n: min })
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return translate(curLang, 'relTime.hour', { n: hrs })
  const days = Math.floor(hrs / 24)
  if (days < 7) return translate(curLang, 'relTime.day', { n: days })
  return formatDate(iso)
}
