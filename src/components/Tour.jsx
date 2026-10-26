import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { Icon, useEsc } from './ui'

const seen = (key) => {
  try {
    return !!localStorage.getItem(key)
  } catch {
    return true // storage blocked → never nag
  }
}

// first VISIBLE element for a selector (responsive layouts render targets twice)
function findTarget(sel) {
  if (!sel) return null
  const els = Array.from(document.querySelectorAll(sel))
  return els.find((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
  })
}

// Lightweight spotlight tour. Runs once per (storageKey + user).
// steps: [{ target?: cssSelector, title, text }] — centered card if no/hidden target.
// Callers should memoize `steps`.
export function Tour({ steps, storageKey, enabled = true }) {
  const { user } = useAuth()
  const { t } = useT()
  const key = `tf_tour_${storageKey}_${user?.id || 'anon'}`
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const [active, setActive] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
    if (!enabled || !steps?.length || seen(key)) return
    const tm = setTimeout(() => setActive(true), 700)
    return () => clearTimeout(tm)
  }, [key, enabled, steps?.length])

  const current = active ? steps[step] : null

  const finish = useCallback(() => {
    try {
      localStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
    setActive(false)
  }, [key])
  useEsc(finish, active)

  useLayoutEffect(() => {
    if (!current) return
    let tries = 0
    let poll = 0
    function measure() {
      const el = findTarget(current.target)
      if (!el) {
        // target not mounted yet → retry briefly, then fall back to a centered card
        if (current.target && tries++ < 10) poll = setTimeout(measure, 150)
        setRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      if (r.top < 70 || r.bottom > window.innerHeight - 20) {
        el.scrollIntoView({ block: 'center' })
      }
      const r2 = el.getBoundingClientRect()
      setRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height })
    }
    measure()
    const onMove = () => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      clearTimeout(poll)
      cancelAnimationFrame(raf.current)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [current])

  if (!current) return null

  const next = () => (step >= steps.length - 1 ? finish() : setStep((s) => s + 1))
  const pad = 6
  const hole = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
  const W = Math.min(360, window.innerWidth - 32)
  const below = hole && hole.top + hole.height + 14 + 200 < window.innerHeight
  const tipStyle = hole
    ? {
        width: W,
        top: below ? hole.top + hole.height + 14 : Math.max(16, hole.top - 14 - 200),
        left: Math.min(Math.max(16, hole.left), window.innerWidth - W - 16),
      }
    : { width: W, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }

  return createPortal(
    <div className="fade-in fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={current.title}>
      {hole ? (
        <div
          className="pointer-events-none absolute transition-all duration-200"
          style={{ ...hole, boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)', outline: '2px solid #F2231B' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/80" />
      )}

      <div className="pop absolute border border-line2 bg-surface p-5" style={tipStyle}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="label">{t('tour.step', { n: step + 1, total: steps.length })}</span>
          <button onClick={finish} className="icon-btn-sm" aria-label={t('tour.skip')} title={t('tour.skip')}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <h3 className="font-display text-[20px] font-bold uppercase leading-tight tracking-tight text-ink">{current.title}</h3>
        <p className="mt-2 text-[15px] text-muted">{current.text}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button onClick={finish} className="text-[13px] font-semibold text-muted hover:text-ink">
            {t('tour.skip')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="btn-ghost btn-sm">
                <Icon name="arrowLeft" size={15} /> {t('common.back')}
              </button>
            )}
            <button onClick={next} className="btn-accent btn-sm">
              {step >= steps.length - 1 ? t('tour.done') : t('tour.next')}
              {step < steps.length - 1 && <Icon name="arrowRight" size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
