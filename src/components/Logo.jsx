// Ticket Flow mark — the red tear-off ticket, drawn as SVG with square corners
// (brand rule: every corner is 90°). Inherits nothing; colour is fixed brand red.
export function LogoMark({ size = 22, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`select-none shrink-0 ${className}`}
      role="img"
      aria-label="Ticket Flow"
    >
      <path
        fill="#F2231B"
        d="M12.5 2H18.5A5.5 5.5 0 0 0 29.5 2H35.5V25.4A1.6 1.6 0 0 0 35.5 28.6V46H29.5A5.5 5.5 0 0 0 18.5 46H12.5V28.6A1.6 1.6 0 0 0 12.5 25.4Z"
      />
      <g fill="#000" fillOpacity=".22">
        {[15.2, 19, 22.7, 26.4, 30.2].map((x) => (
          <rect key={x} x={x} y="26.3" width="2.6" height="1.4" />
        ))}
      </g>
    </svg>
  )
}

export function Wordmark({ size = 22, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display text-[15px] font-extrabold uppercase leading-none tracking-[-0.01em] text-ink">
        Ticket Flow
      </span>
    </div>
  )
}
