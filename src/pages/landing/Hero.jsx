import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LangContext'
import { STATUS } from '../../lib/constants'
import { ArrowRight, reducedMotion } from './kit'

// ── flat black illustrations, one scene per ticket (square, Swiss-style) ──
// Black shapes on the glowing red panel + white accents. `lp-a*` parts animate
// only on the lit panel (see landing.css), so the row feels alive but calm.
const K = '#050505'
const W = '#ffffff'
const G = '#262626'
const ART = {
  // #009 — fix the mobile header: phone, header bar sliding into place
  phone: (
    <>
      <rect x="24" y="14" width="52" height="124" fill={K} />
      <rect x="29" y="24" width="42" height="104" fill="#141414" />
      <rect x="44" y="18" width="12" height="2.5" fill={G} />
      <rect className="lp-a1" x="29" y="24" width="42" height="14" fill={W} />
      <path className="lp-a1" d="M34 29h8M34 31.5h8M34 34h8" stroke={K} strokeWidth="1.6" />
      <rect className="lp-a1" x="61" y="28" width="6" height="6" fill="#f2231b" />
      <rect x="29" y="23" width="42" height="16" fill="none" stroke={W} strokeWidth="1" strokeDasharray="2 2" opacity=".55" />
      <rect x="34" y="46" width="32" height="20" fill={G} />
      <rect x="34" y="71" width="26" height="3" fill={G} />
      <rect x="34" y="77" width="32" height="3" fill={G} />
      <rect x="34" y="83" width="20" height="3" fill={G} />
      <rect x="34" y="94" width="14" height="14" fill={G} />
      <rect x="52" y="94" width="14" height="14" fill={G} />
      <rect x="44" y="131" width="12" height="3" fill={G} />
    </>
  ),
  // #011 — new banner on the homepage: browser window with a hero banner
  banner: (
    <>
      <rect x="6" y="38" width="88" height="100" fill={K} />
      <rect x="6" y="38" width="88" height="10" fill="#141414" />
      <rect x="11" y="42" width="3" height="3" fill={W} />
      <rect x="16" y="42" width="3" height="3" fill={G} />
      <rect x="21" y="42" width="3" height="3" fill={G} />
      <rect x="30" y="41.5" width="56" height="4" fill={G} />
      <g className="lp-a2">
        <rect x="12" y="54" width="76" height="42" fill={W} />
        <rect x="18" y="61" width="40" height="7" fill={K} />
        <rect x="18" y="71" width="28" height="7" fill={K} />
        <rect x="18" y="84" width="18" height="6" fill="#f2231b" />
        <path d="M66 62l12 0 0 12-12 0z" fill="#f2231b" />
        <path d="M60 90l10-14 8 9 4-5 6 10z" fill={K} />
      </g>
      <rect x="12" y="103" width="22" height="16" fill={G} />
      <rect x="39" y="103" width="22" height="16" fill={G} />
      <rect x="66" y="103" width="22" height="16" fill={G} />
      <rect x="12" y="124" width="50" height="3" fill={G} />
    </>
  ),
  // #012 — reviews section under the prices: three review cards with stars
  reviews: (
    <>
      {[46, 77, 108].map((y, i) => (
        <g key={y} className={i === 1 ? 'lp-a3' : undefined}>
          <rect x={i === 1 ? 6 : 14} y={y} width="80" height="27" fill={i === 1 ? W : K} />
          <rect x={(i === 1 ? 6 : 14) + 6} y={y + 6} width="14" height="14" fill={i === 1 ? K : G} />
          {[0, 1, 2, 3, 4].map((k) => {
            const cx = (i === 1 ? 6 : 14) + 28 + k * 8.5
            const cy = y + 9
            return (
              <path
                key={k}
                d={`M${cx} ${cy - 3.6}l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z`}
                fill={i === 1 ? '#f2231b' : W}
              />
            )
          })}
          <rect x={(i === 1 ? 6 : 14) + 26} y={y + 16} width="42" height="2.5" fill={i === 1 ? '#bdbdbd' : G} />
        </g>
      ))}
    </>
  ),
  // #014 — payment error in Safari: card + warning sign
  payment: (
    <>
      <path className="lp-a4" d="M50 22l22 38H28z" fill={W} />
      <rect className="lp-a4" x="48" y="35" width="4" height="13" fill={K} />
      <rect className="lp-a4" x="48" y="51" width="4" height="4" fill={K} />
      <g transform="rotate(-8 50 104)">
        <rect x="10" y="78" width="80" height="52" fill={K} />
        <rect x="10" y="86" width="80" height="9" fill={G} />
        <rect x="18" y="102" width="13" height="10" fill={W} />
        <path d="M18 107h13M24.5 102v10" stroke={K} strokeWidth="1" />
        <rect x="18" y="119" width="9" height="3" fill={W} />
        <rect x="30" y="119" width="9" height="3" fill={W} />
        <rect x="42" y="119" width="9" height="3" fill={W} />
        <rect x="54" y="119" width="9" height="3" fill="#f2231b" />
        <rect x="72" y="104" width="10" height="10" fill="#f2231b" />
        <rect x="68" y="104" width="10" height="10" fill="none" stroke={W} strokeWidth="1.2" />
      </g>
    </>
  ),
  // #015 — release v1.2: rocket lifting off
  release: (
    <>
      <g className="lp-a5">
        <path d="M50 14l13 20v58H37V34z" fill={K} />
        <path d="M37 66L24 84v14l13-6zM63 66l13 18v14l-13-6z" fill={K} />
        <rect x="44" y="42" width="12" height="12" fill={W} />
        <rect x="47" y="45" width="6" height="6" fill="#f2231b" />
        <rect x="41" y="62" width="18" height="5" fill={G} />
        <text x="50" y="82" textAnchor="middle" fontSize="8" fontWeight="800" fill={W} fontFamily="Inter Tight, Inter, sans-serif">v1.2</text>
        <path className="lp-flame" d="M41 92h18l-4 16-5-6-5 6z" fill={W} />
      </g>
      <rect x="22" y="112" width="3" height="18" fill={K} opacity=".55" />
      <rect x="75" y="104" width="3" height="24" fill={K} opacity=".55" />
      <rect x="12" y="122" width="3" height="12" fill={K} opacity=".35" />
      <rect x="86" y="118" width="3" height="16" fill={K} opacity=".35" />
      <rect x="0" y="134" width="100" height="4" fill={K} />
    </>
  ),
}
const LINEUP = [
  { art: 'phone', depth: 1.3 },
  { art: 'banner', depth: 0.7 },
  { art: 'reviews', depth: 0.25 },
  { art: 'payment', depth: 0.7 },
  { art: 'release', depth: 1.3 },
]

function Art({ name }) {
  return (
    <svg viewBox="0 0 100 140" aria-hidden="true" shapeRendering="crispEdges">
      {ART[name]}
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
        <Art name={cfg.art} />
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
