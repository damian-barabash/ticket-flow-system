// Minimal iCalendar helpers: single-event .ics export + file download.
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const day = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`
}

export function eventToIcs(ev) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ticket Flow//Calendar//EN', 'BEGIN:VEVENT']
  lines.push(`UID:${ev.id}@ticketflow`, `DTSTAMP:${utc(Date.now())}`)
  if (ev.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${day(ev.starts_at)}`)
    lines.push(`DTEND;VALUE=DATE:${day(ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 864e5))}`)
  } else {
    lines.push(`DTSTART:${utc(ev.starts_at)}`)
    lines.push(`DTEND:${utc(ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 36e5))}`)
  }
  lines.push(`SUMMARY:${esc(ev.title)}`)
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
  if (ev.notes) lines.push(`DESCRIPTION:${esc(ev.notes)}`)
  if (ev.remind_minutes != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:-PT${ev.remind_minutes}M`, 'END:VALARM')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadText(text, filename, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
