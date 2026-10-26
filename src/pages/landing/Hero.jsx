import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LangContext'
import { STATUS } from '../../lib/constants'
import { ArrowRight, reducedMotion } from './kit'

// ── black SVG silhouettes standing in front of the glowing panels ─────────
const POSES = {
  // seated, facing the viewer
  front: (
    <>
      <ellipse cx="50" cy="20" rx="8.5" ry="10.5" />
      <rect x="46" y="28" width="8" height="7" />
      <path d="M36 34L64 34Q72 36 74 44L77 80L70 82L67 56L66 86L34 86L33 56L30 82L23 80L26 44Q28 36 36 34Z" />
      <path d="M32 84L68 84L71 98L29 98Z" />
      <path d="M30 96L41 96L40 131L45 137L27 137L31 131Z" />
      <path d="M59 96L70 96L69 131L73 137L55 137L60 131Z" />
      <path d="M18 94L82 94L82 99L18 99Z" />
      <path d="M21 99h3v38h-3zM76 99h3v38h-3z" />
    </>
  ),
  // seated in profile, hand on chin
  think: (
    <>
      <ellipse cx="47" cy="21" rx="8.5" ry="10" />
      <path d="M37 33Q46 30 52 34Q57 38 57 46L60 82L35 84Q32 62 33 46Q34 36 37 33Z" />
      <path d="M50 38L57 37L67 70L60 73Z" />
      <path d="M60 73L67 70L59 30L53 32Z" />
      <path d="M35 76L79 76L79 89L35 89Z" />
      <path d="M69 86L79 86L81 131L89 137L68 137L71 131Z" />
      <path d="M24 89L72 89L72 94L24 94Z" />
      <path d="M26 94h3v43h-3zM66 94h3v43h-3zM23 42h3v52h-3z" />
    </>
  ),
  // seated in profile, laptop on the knees
  laptop: (
    <>
      <ellipse cx="45" cy="23" rx="8.5" ry="10" transform="rotate(12 45 23)" />
      <path d="M36 35Q45 31 51 36Q56 40 56 48L59 82L34 84Q31 62 32 48Q33 38 36 35Z" />
      <path d="M48 42L54 40L72 64L67 69Z" />
      <path d="M56 70L84 70L86 74L56 74Z" />
      <path d="M78 44L84 45L86 72L80 72Z" />
      <path d="M34 76L78 76L78 89L34 89Z" />
      <path d="M68 86L78 86L80 131L88 137L67 137L70 131Z" />
      <path d="M22 89L70 89L70 94L22 94Z" />
      <path d="M24 94h3v43h-3zM64 94h3v43h-3zM21 42h3v52h-3z" />
    </>
  ),
}
const LINEUP = [
  { pose: 'laptop', flip: false, depth: 1.3 },
  { pose: 'think', flip: false, depth: 0.7 },
  { pose: 'front', flip: false, depth: 0.25 },
  { pose: 'think', flip: true, depth: 0.7 },
  { pose: 'laptop', flip: true, depth: 1.3 },
]

function Silhouette({ pose, flip }) {
  return (
    <svg viewBox="0 0 100 140" fill="#050505" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      {POSES[pose]}
    </svg>
  )
}

function Panel({ p, cfg, lit, onEnter, t, reflect = false }) {
  return (
    <div className={`lp-panel ${lit ? '' : 'dim'}`} onMouseEnter={onEnter}>
      {!reflect && (
        <div className="lp-pcontent">
          <div className="lp-mono text-[12px] font-medium opacity-90">#{p.n}</div>
          <div className="mx-auto mt-2 max-w-[17ch] font-display text-[clamp(12px,1.15vw,16px)] font-extrabold uppercase leading-[1.05] tracking-[-0.01em]">
            {p.title}
          </div>
          <div className="mt-3 flex justify-center">
            <span className="lp-ticket-chip">
              <span className="inline-block h-2 w-2" style={{ background: STATUS[p.status].dot }} />
              {t('enum.status.' + p.status)}
            </span>
          </div>
          <div className="mt-2 hidden text-[12px] font-medium leading-tight opacity-90 sm:block">{p.meta}</div>
        </div>
      )}
      <div className="lp-perf" />
      <div className="lp-sil">
        <Silhouette pose={cfg.pose} flip={cfg.flip} />
      </div>
    </div>
  )
}

export function Hero({ go, session }) {
  const { t } = useT()
  const panels = t('landing.hero.panels')
  const lines = t('landing.hero.lines')
  const rowRef = useRef(null)
  const heroRef = useRef(null)
  const [lit, setLit] = useState(2)
  const [hover, setHover] = useState(false)

  // ambient: the "lit" ticket walks along the row (paused on hover / reduced motion)
  useEffect(() => {
    if (hover || reducedMotion()) return
    const id = setInterval(() => setLit((i) => (i + 1) % 5), 2400)
    return () => clearInterval(id)
  }, [hover])

  // mouse parallax: one CSS var on the row, columns translate by depth (transform only)
  useEffect(() => {
    const hero = heroRef.current
    const row = rowRef.current
    if (!hero || !row || reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    let x = 0
    const onMove = (e) => {
      x = (e.clientX / window.innerWidth - 0.5) * 2
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        row.style.setProperty('--px', (x * 14).toFixed(2))
      })
    }
    hero.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      hero.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section ref={heroRef} className="relative pt-[104px] sm:pt-[124px]" id="top">
      <div className="lp-wrap">
        <div className="flex items-start justify-between gap-6">
          <h1 className="lp-h lp-h1 text-white">
            {lines.map((l, i) => (
              <span key={i} className="ll in" style={{ '--d': i }}>
                <span className="lp-rise" style={{ '--d': i }}>
                  {l}
                </span>
              </span>
            ))}
          </h1>
          <div className="hidden w-[250px] shrink-0 flex-col items-end text-right lg:flex">
            <span className="lp-tag text-white">{t('landing.hero.tag')}</span>
            <p className="lp-rise mt-12 text-[14px] font-medium leading-[1.45] text-[#f2231b]" style={{ '--d': 3 }}>
              {t('landing.hero.side')}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-7 lg:mt-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[560px]">
            <span className="lp-tag text-white lg:hidden">{t('landing.hero.tag')}</span>
            <p className="mt-3 text-[14px] font-medium leading-[1.45] text-[#f2231b] lg:hidden">{t('landing.hero.side')}</p>
            <p className="lp-rise mt-4 text-[16px] leading-relaxed text-[#b4b4b4] sm:text-[17px] lg:mt-0" style={{ '--d': 2 }}>
              {t('landing.hero.sub')}
            </p>
          </div>
          <div className="lp-rise flex flex-col items-start gap-3 lg:items-end" style={{ '--d': 4 }}>
            <div className="flex flex-wrap items-center gap-3">
              {session ? (
                <button onClick={() => go('/projects')} className="lp-btn">
                  {t('landing.nav.projects')} <ArrowRight />
                </button>
              ) : (
                <>
                  <button onClick={() => go('/register')} className="lp-btn">
                    {t('landing.hero.ctaPrimary')} <ArrowRight />
                  </button>
                  <button onClick={() => go('/login')} className="lp-btn-ghost">
                    {t('landing.hero.ctaSecondary')}
                  </button>
                </>
              )}
            </div>
            <span className="text-[13px] text-[#8a8a8a]">{t('landing.hero.trust')}</span>
          </div>
        </div>
      </div>

      {/* stage: five glowing red tickets + floor reflection */}
      <div className="lp-stage mt-12 sm:mt-16">
        <div className="lp-bloom" />
        <div className="lp-wrap relative">
          <div
            ref={rowRef}
            className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-[clamp(12px,2vw,34px)] lg:overflow-visible lg:px-0"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            {panels.map((p, i) => (
              <div key={p.n} className="w-[56vw] max-w-[260px] shrink-0 snap-center lg:w-auto lg:max-w-none">
                <div className="lp-col" style={{ '--depth': LINEUP[i].depth * (i < 2 ? -1 : 1) }}>
                  <div className="lp-rise" style={{ '--d': i }}>
                    <Panel p={p} cfg={LINEUP[i]} lit={lit === i} onEnter={() => setLit(i)} t={t} />
                    <div className="lp-refwrap" aria-hidden="true">
                      <div className="lp-reflect">
                        <Panel p={p} cfg={LINEUP[i]} lit={false} t={t} reflect />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="lp-floor" />
        </div>
      </div>
    </section>
  )
}
