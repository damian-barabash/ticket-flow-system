import { useEffect } from 'react'

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
  const src = images[index]?.signed || images[index]?.url

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
      <img
        src={src}
        alt=""
        className="max-h-[88vh] max-w-[92vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 label">
        {index + 1} / {images.length}
      </span>
    </div>
  )
}
