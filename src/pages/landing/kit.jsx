import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LangContext'

// One shared IntersectionObserver for every reveal on the landing (cheap).
let io = null
const cbs = new WeakMap()
function getIO() {
  if (io || typeof window === 'undefined' || !('IntersectionObserver' in window)) return io
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const cb = cbs.get(e.target)
        if (cb) cb()
        io.unobserve(e.target)
        cbs.delete(e.target)
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )
  return io
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// true once the element has entered the viewport (never flips back).
export function useInView(ref) {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = getIO()
    if (!o) {
      setSeen(true)
      return
    }
    cbs.set(el, () => setSeen(true))
    o.observe(el)
    return () => {
      o.unobserve(el)
      cbs.delete(el)
    }
  }, [ref])
  return seen
}

// <R d={2}> — reveal wrapper. `d` = stagger step (45ms each).
export function R({ as: Tag = 'div', d = 0, className = '', style, children, ...rest }) {
  const ref = useRef(null)
  const seen = useInView(ref)
  return (
    <Tag ref={ref} className={`lr ${seen ? 'in' : ''} ${className}`} style={{ '--d': d, ...style }} {...rest}>
      {children}
    </Tag>
  )
}

// Display headline that rises line-by-line out of a mask.
export function Lines({ lines, className = '', as: Tag = 'h2', lineClass = '' }) {
  const ref = useRef(null)
  const seen = useInView(ref)
  return (
    <Tag ref={ref} className={`${seen ? 'in' : ''} ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className={`ll ${lineClass}`} style={{ '--d': i }}>
          <span>{l}</span>
        </span>
      ))}
    </Tag>
  )
}

// Counter that ticks up once it is visible (tabular digits → no layout shift).
export function Count({ to, pre = '', suf = '', ms = 700 }) {
  const ref = useRef(null)
  const seen = useInView(ref)
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!seen) return
    if (reducedMotion()) {
      setV(to)
      return
    }
    let raf
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(to * e))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [seen, to, ms])
  return (
    <span ref={ref} className="tabular-nums">
      {pre}
      {v}
      {suf}
    </span>
  )
}

// Section header: giant uppercase title left, [ TAG ] right, optional sub.
export function Head({ tag, title, sub, lines, red = false, small = false }) {
  return (
    <div className="mb-10 sm:mb-14">
      <div className="flex items-start justify-between gap-6">
        <Lines
          lines={lines || [title]}
          className={`lp-h ${small ? 'lp-h2s' : 'lp-h2'} max-w-[1000px] ${red ? 'text-[#f2231b]' : 'text-white'}`}
        />
        <R className="hidden shrink-0 pt-2 sm:block">
          <span className="lp-tag text-white">{tag}</span>
        </R>
      </div>
      <R d={1} className="mt-5 flex items-start gap-4 sm:hidden">
        <span className="lp-tag text-white">{tag}</span>
      </R>
      {sub && (
        <R d={2} as="p" className="mt-5 max-w-[620px] text-[16px] leading-relaxed text-[#a8a8a8] sm:text-[17px]">
          {sub}
        </R>
      )}
    </div>
  )
}

// Square RU / PL / EN switcher — readable 12px (LangSwitch is too small for the landing).
export function LangPills({ className = '' }) {
  const { lang, setLang, languages, t } = useT()
  return (
    <div className={`flex items-center border border-[#3a3a3a] ${className}`} role="group" aria-label={t('topbar.lang')}>
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.name}
          className={`h-9 min-w-[40px] px-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors duration-150 ${
            lang === l.code ? 'bg-white text-black' : 'text-[#a8a8a8] hover:text-white'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function ArrowRight({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h17M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  )
}

export function scrollToId(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
}
