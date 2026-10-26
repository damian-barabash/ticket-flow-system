import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useT } from '../../context/LangContext'
import { REMINDERS, addDays, hm, parseYmd, ymd } from '../../lib/calendar'
import { eventToIcs, downloadText } from '../../lib/ics'
import { Icon, Modal, Spinner, useConfirm } from '../ui'

function combine(dateStr, timeStr) {
  const d = parseYmd(dateStr)
  const [h, m] = (timeStr || '00:00').split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

// Create / edit / delete a calendar event.
// `initial`: existing event row, or { date:'YYYY-MM-DD', start?: Date, project_id? } for a new one.
export function EventFormModal({ open, initial, projects, onClose, onSaved, onDeleted }) {
  const { t } = useT()
  const { user, isModerator } = useAuth()
  const editing = !!initial?.id
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const confirm = useConfirm()

  useEffect(() => {
    if (!open || !initial) return
    setErr('')
    if (initial.id) {
      const s = new Date(initial.starts_at)
      const e = initial.ends_at ? new Date(initial.ends_at) : new Date(s.getTime() + 36e5)
      const endDay = initial.all_day ? addDays(e, -1) : e
      setF({
        title: initial.title || '',
        project_id: initial.project_id || '',
        all_day: !!initial.all_day,
        date: ymd(s),
        end_date: ymd(endDay < s ? s : endDay),
        start: hm(s),
        end: hm(e),
        location: initial.location || '',
        notes: initial.notes || '',
        remind: initial.remind_minutes == null ? '' : String(initial.remind_minutes),
      })
    } else {
      const s = initial.start || combine(initial.date || ymd(new Date()), '10:00')
      const e = new Date(s.getTime() + 36e5)
      setF({
        title: '',
        project_id: initial.project_id || '',
        all_day: !!initial.all_day,
        date: ymd(s),
        end_date: ymd(s),
        start: hm(s),
        end: hm(e),
        location: '',
        notes: '',
        remind: '15',
      })
    }
  }, [open, initial])

  if (!open || !f) return null
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  const canEdit = !editing || initial.created_by === user?.id || isModerator || projects.find((p) => p.id === initial.project_id)?.created_by === user?.id

  function build() {
    let starts
    let ends
    if (f.all_day) {
      starts = parseYmd(f.date)
      const last = f.end_date && f.end_date >= f.date ? parseYmd(f.end_date) : parseYmd(f.date)
      ends = addDays(last, 1)
    } else {
      starts = combine(f.date, f.start)
      ends = combine(f.date, f.end)
      if (ends <= starts) ends = addDays(ends, 1) // crosses midnight
    }
    return {
      title: f.title.trim(),
      project_id: f.project_id || null,
      all_day: f.all_day,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      location: f.location.trim() || null,
      notes: f.notes.trim() || null,
      remind_minutes: f.remind === '' ? null : Number(f.remind),
    }
  }

  async function save(e) {
    e?.preventDefault()
    if (!f.title.trim()) {
      setErr(t('cal.titleRequired'))
      return
    }
    const row = build()
    setBusy(true)
    setErr('')
    let res
    if (editing) {
      const timeChanged =
        row.starts_at !== new Date(initial.starts_at).toISOString() ||
        row.remind_minutes !== initial.remind_minutes ||
        row.all_day !== initial.all_day
      if (timeChanged) row.reminded_at = null
      res = await supabase.from('calendar_events').update(row).eq('id', initial.id).select('*').single()
    } else {
      res = await supabase.from('calendar_events').insert(row).select('*').single()
    }
    setBusy(false)
    if (res.error) {
      setErr(t('common.error'))
      return
    }
    onSaved?.(res.data, editing)
    onClose()
  }

  async function remove() {
    if (!(await confirm({ title: t('cal.deleteConfirm'), body: initial.title, confirmLabel: t('common.delete'), danger: true }))) return
    setBusy(true)
    const { error } = await supabase.from('calendar_events').delete().eq('id', initial.id)
    setBusy(false)
    if (error) {
      setErr(t('common.error'))
      return
    }
    onDeleted?.(initial.id)
    onClose()
  }

  const remindLabel = (m) =>
    m == null ? t('cal.remind.none') : m === 0 ? t('cal.remind.atStart') : m === 1440 ? t('cal.remind.day') : t('cal.remind.min', { n: m })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('cal.editEvent') : t('cal.newEvent')}
      width="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {editing && canEdit && (
            <button type="button" className="btn-danger btn-sm" onClick={remove} disabled={busy}>
              <Icon name="trash" size={15} /> {t('common.delete')}
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="btn-quiet btn-sm"
              onClick={() => downloadText(eventToIcs(initial), (initial.title || 'event').replace(/[^\w\- ]+/g, '').slice(0, 40) + '.ics')}
              title={t('cal.downloadIcs')}
            >
              <Icon name="download" size={15} /> .ics
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {canEdit && (
            <button type="submit" form="event-form" className="btn-accent btn-sm" disabled={busy}>
              {busy ? <Spinner className="border-white/40 border-t-white" /> : editing ? t('common.save') : t('common.create')}
            </button>
          )}
        </div>
      }
    >
      <form id="event-form" onSubmit={save} className="flex flex-col gap-5">
        <div>
          <label className="field-label">{t('cal.f.title')}</label>
          <input autoFocus={!editing} className="field text-[17px]" value={f.title} onChange={set('title')} maxLength={300} placeholder={t('cal.f.titlePh')} disabled={!canEdit} />
        </div>

        <div>
          <label className="field-label">{t('cal.f.project')}</label>
          <select className="field" value={f.project_id} onChange={set('project_id')} disabled={!canEdit}>
            <option value="">{t('cal.personal')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[13px] text-faint">{f.project_id ? t('cal.f.projectHint') : t('cal.f.personalHint')}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 self-start">
          <input type="checkbox" className="h-5 w-5 accent-[#F2231B]" checked={f.all_day} onChange={set('all_day')} disabled={!canEdit} />
          <span className="text-[15px] text-ink">{t('cal.allDay')}</span>
        </label>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className={f.all_day ? '' : 'col-span-2 sm:col-span-1'}>
            <label className="field-label">{f.all_day ? t('cal.f.from') : t('cal.f.date')}</label>
            <input type="date" className="field" value={f.date} onChange={set('date')} required disabled={!canEdit} />
          </div>
          {f.all_day ? (
            <div>
              <label className="field-label">{t('cal.f.to')}</label>
              <input type="date" className="field" value={f.end_date} min={f.date} onChange={set('end_date')} disabled={!canEdit} />
            </div>
          ) : (
            <>
              <div>
                <label className="field-label">{t('cal.f.start')}</label>
                <input type="time" className="field" value={f.start} onChange={set('start')} required disabled={!canEdit} />
              </div>
              <div>
                <label className="field-label">{t('cal.f.end')}</label>
                <input type="time" className="field" value={f.end} onChange={set('end')} required disabled={!canEdit} />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="field-label">{t('cal.f.location')}</label>
          <input className="field" value={f.location} onChange={set('location')} placeholder={t('cal.f.locationPh')} disabled={!canEdit} />
          {/^https?:\/\//.test(f.location.trim()) && (
            <a href={f.location.trim()} target="_blank" rel="noreferrer" className="btn-link mt-2 text-[13px]">
              {t('cal.f.openLink')} <Icon name="external" size={13} />
            </a>
          )}
        </div>

        <div>
          <label className="field-label">{t('cal.f.reminder')}</label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REMINDERS.map((m) => {
              const v = m == null ? '' : String(m)
              return (
                <button
                  key={v || 'none'}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setF((x) => ({ ...x, remind: v }))}
                  className={`chip ${f.remind === v ? 'chip-on' : ''}`}
                >
                  {m != null && <Icon name="bell" size={13} />}
                  {remindLabel(m)}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[13px] text-faint">{t('cal.f.reminderHint')}</p>
        </div>

        <div>
          <label className="field-label">{t('cal.f.notes')}</label>
          <textarea className="field" rows={3} value={f.notes} onChange={set('notes')} disabled={!canEdit} />
        </div>

        {err && <div className="border border-accent/40 bg-accentSoft px-3 py-2 text-[14px] text-accent">{err}</div>}
      </form>
    </Modal>
  )
}
