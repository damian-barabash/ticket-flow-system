import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Lightweight spotlight tour. Runs once per (storageKey + user).
// steps: [{ target?: cssSelector, title, text }]  — centered card if no target.
export function Tour({ steps, storageKey, enabled = true }) {
  const { user } = useAuth()
  const key = `tf_tour_${storageKey}_${user?.id || 'anon'}`
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const [active, setActive] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
    if (!enabled) return
    if (localStorage.getItem(key)) return
    // small delay so target elements are mounted
    const t = setTimeout(() => setActive(true), 600)
    return () => clearTimeout(t)
  }, [key, enabled])

  const current = steps[step]

  useLayoutEffect(() => {
    if (!active || !current) return
    function measure() {
      if (!current.target) {
        setRect(null)
        return
      }
      const el = document.querySelector(current.target)
      if (!el) {
        setRect(null)
        return
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    const onMove = () => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [active, current, step])

  if (!active || !current) return null

  function finish() {
    localStorage.setItem(key, '1')
    setActive(false)
  }
  function next() {
    if (step >= steps.length - 1) finish()
    else setStep((s) => s + 1)
  }

  const pad = 8
  const hole = rect && {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  // tooltip position: under the target if room, else above; centered if no target
  const tipTop = hole ? (hole.top > window.innerHeight - 220 ? hole.top - 150 : hole.top + hole.height + 14) : null

  return (
    <div className="fixed inset-0 z-[80]">
      {/* dim + spotlight hole */}
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-[4px] transition-all duration-300"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.74)',
            outline: '1px solid #FF2E2E',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/74" />
      )}

      {/* tooltip card */}
      <div
        className="brackets absolute w-[min(340px,calc(100vw-32px))] border border-line bg-surface p-5 shadow-2xl"
        style={
          hole
            ? { top: Math.max(16, tipTop), left: Math.min(Math.max(16, hole.left), window.innerWidth - 356) }
            : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
        }
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="label">
            Шаг {step + 1} / {steps.length}
          </span>
          <button onClick={finish} className="label hover:text-ink">
            Пропустить
          </button>
        </div>
        <h3 className="mb-1.5 text-base font-semibold text-ink">{current.title}</h3>
        <p className="mb-4 text-sm text-faint">{current.text}</p>
        <div className="flex justify-end gap-2">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="btn-ghost">
              Назад
            </button>
          )}
          <button onClick={next} className="btn-solid">
            {step >= steps.length - 1 ? 'Понятно' : 'Далее'}
          </button>
        </div>
      </div>
    </div>
  )
}
