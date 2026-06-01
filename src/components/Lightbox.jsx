import { useEffect } from 'react'
import { isDisplayableImage, formatLabel } from '../lib/files'

export function Lightbox({ images, index, onClose, onNav }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNav(1)
      if (e.key === 'ArrowLeft') onNav(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav])

  if (index == null || !images?.length) return null
  const cur = images[index]
  const src = cur?.signed || cur?.url
  const displayable = isDisplayableImage(cur)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button className="absolute right-4 top-4 text-2xl text-muted hover:text-ink" aria-label="Закрыть">
        ✕
      </button>
      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-4 text-2xl text-muted hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onNav(-1)
            }}
            aria-label="Назад"
          >
            ‹
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-4 text-2xl text-muted hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onNav(1)
            }}
            aria-label="Вперёд"
          >
            ›
          </button>
        </>
      )}
      {displayable ? (
        <img
          src={src}
          alt={cur?.name || ''}
          className="max-h-[88vh] max-w-[92vw] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className="flex flex-col items-center gap-4 border border-line bg-surface px-8 py-10 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-mono uppercase tracking-label text-sm text-muted">{formatLabel(cur)}</span>
          <p className="max-w-[60vw] break-all text-sm text-ink/90">{cur?.name || 'Файл'}</p>
          <p className="label-sm text-faint">Этот формат не показывается в браузере</p>
          <a href={src} target="_blank" rel="noreferrer" className="btn-solid">
            Открыть файл
          </a>
        </div>
      )}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 label">
        {index + 1} / {images.length}
      </span>
    </div>
  )
}
