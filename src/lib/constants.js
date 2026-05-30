// Russian labels + visual tokens for ticket enums.

export const STATUS = {
  new:         { ru: 'Новый',      dot: '#FF2E2E', text: '#FF6A6A' },
  in_progress: { ru: 'В работе',   dot: '#E3B341', text: '#E3B341' },
  done:        { ru: 'Выполнен',   dot: '#3FB950', text: '#3FB950' },
  rejected:    { ru: 'Отклонён',   dot: '#8A8A92', text: '#8A8A92' },
  on_hold:     { ru: 'На паузе',   dot: '#6E6EDA', text: '#9A9AE6' },
}
export const STATUS_ORDER = ['new', 'in_progress', 'on_hold', 'done', 'rejected']

export const PRIORITY = {
  low:    { ru: 'Низкий',  text: '#8A8A92' },
  medium: { ru: 'Средний', text: '#EDEDED' },
  high:   { ru: 'Высокий', text: '#E3B341' },
  urgent: { ru: 'Срочно',  text: '#FF2E2E' },
}
export const PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent']

export const CATEGORY = {
  bug:      { ru: 'Баг' },
  change:   { ru: 'Правка' },
  feature:  { ru: 'Новая фича' },
  question: { ru: 'Вопрос' },
}
export const CATEGORY_ORDER = ['change', 'bug', 'feature', 'question']

export const ACTIVITY_RU = {
  created:           'создал тикет',
  status_changed:    'сменил статус',
  priority_changed:  'сменил приоритет',
  assigned:          'переназначил',
  commented:         'оставил комментарий',
  attachment_added:  'добавил вложение',
  reopened:          'переоткрыл',
  closed:            'закрыл',
}
