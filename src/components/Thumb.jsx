import { useState } from 'react'
import { isDisplayableImage, formatLabel } from '../lib/files'

// Thumbnail for an attachment. Renders the image when the browser can display
// it; otherwise (TIFF/HEIC, or a load error) shows a neutral tile with the
// format label so the user never sees a broken-image icon.
export function Thumb({ att, className = '' }) {
  const [broken, setBroken] = useState(false)
  const showImg = att?.signed && isDisplayableImage(att) && !broken

  if (showImg) {
    return (
      <img
        src={att.signed}
        alt={att.name || ''}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    )
  }
  return <FileFallback att={att} />
}

// Neutral placeholder tile: dot-grid background + format label.
export function FileFallback({ att }) {
  return (
    <div className="dotgrid flex h-full w-full flex-col items-center justify-center gap-1 bg-surface2/40 text-center">
      <span className="font-mono uppercase tracking-label text-[10px] text-muted">{formatLabel(att)}</span>
      <span className="label-sm text-faint">файл</span>
    </div>
  )
}
