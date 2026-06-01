// Visual tokens + ordering for ticket enums. Human labels live in src/lib/i18n.js
// (enum.status / enum.priority / enum.category / enum.activity) and are resolved
// through the active UI language — use t('status.'+key) etc.

export const STATUS = {
  new:         { dot: '#FF2E2E', text: '#FF6A6A' },
  in_progress: { dot: '#E3B341', text: '#E3B341' },
  done:        { dot: '#3FB950', text: '#3FB950' },
  rejected:    { dot: '#8A8A92', text: '#8A8A92' },
  on_hold:     { dot: '#6E6EDA', text: '#9A9AE6' },
}
export const STATUS_ORDER = ['new', 'in_progress', 'on_hold', 'done', 'rejected']

export const PRIORITY = {
  low:    { text: '#8A8A92' },
  medium: { text: '#EDEDED' },
  high:   { text: '#E3B341' },
  urgent: { text: '#FF2E2E' },
}
export const PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent']

export const CATEGORY_ORDER = ['change', 'bug', 'feature', 'question']
