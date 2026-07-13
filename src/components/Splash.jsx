import { LogoMark } from './Logo'

// Branded preloader — the breathing ticket logo over the dot grid, with a thin
// indeterminate accent sweep. Replaces the bare spinner while auth resolves.
export function Splash() {
  return (
    <div className="dotgrid flex min-h-screen flex-col items-center justify-center bg-bg">
      <div className="splash-pulse">
        <LogoMark size={56} />
      </div>
      <span className="label mt-6 text-muted">Ticket Flow</span>
      <div className="mt-6 h-[2px] w-[132px] overflow-hidden bg-line">
        <div className="splash-sweep h-full w-[44px] bg-accent" />
      </div>
    </div>
  )
}
