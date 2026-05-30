export function LogoMark({ size = 22 }) {
  return (
    <img
      src="./logo.png"
      alt="Ticket Flow"
      width={size}
      height={size}
      className="select-none"
      draggable={false}
      style={{ objectFit: 'contain' }}
    />
  )
}

export function Wordmark({ size = 22 }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-mono uppercase tracking-label text-[13px] text-ink">Ticket Flow</span>
    </div>
  )
}
