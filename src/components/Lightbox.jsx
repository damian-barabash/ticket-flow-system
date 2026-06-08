import { useEffect, useState } from 'react'
import { isDisplayableImage, formatLabel } from '../lib/files'
import { useT } from '../context/LangContext'

// Конвертирует любую отображаемую картинку в PNG-blob через canvas
// (clipboard.write принимает только image/png кросс-браузерно).
async function fetchPngBlob(src) {
  const blob = await (await fetch(src)).blob()
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  return await new Promise((res) => canvas.toBlob(res, 'image/png'))
}

export function Lightbox({ images, index, onClose, onNav }) {
  const { t } = useT()
  const [copyState, setCopyState] = useState('idle') // idle | copied | failed
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNav(1)
      if (e.key === 'ArrowLeft') onNav(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav])

  // Сбрасываем индикатор копирования при смене кадра.
  useEffect(() => setCopyState('idle'), [index])

  if (index == null || !images?.length) return null
  const cur = images[index]
  const src = cur?.signed || cur?.url
  const displayable = isDisplayableImage(cur)
  const canCopy = displayable && typeof navigator !== 'undefined' && navigator.clipboard && window.ClipboardItem

  async function download(e) {
    e.stopPropagation()
    if (!src) return
    setBusy(true)
    try {
      const blob = await (await fetch(src)).blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = cur?.name || t('file.fileName')
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000)
    } catch {
      // fallback — открыть в новой вкладке
      window.open(src, '_blank', 'noreferrer')
    } finally {
      setBusy(false)
    }
  }

  async function copy(e) {
    e.stopPropagation()
    if (!src) return
    setBusy(true)
    try {
      // Промис передаём прямо в ClipboardItem — Safari требует это для async внутри жеста.
      const item = new window.ClipboardItem({ 'image/png': fetchPngBlob(src) })
      await navigator.clipboard.write([item])
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('failed')
      setTimeout(() => setCopyState('idle'), 1800)
    } finally {
      setBusy(false)
    }
  }

  const stop = (e) => e.stopPropagation()

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      {/* Тулбар: скачать / копировать / закрыть. onContextMenu гасим, чтобы клик мимо не закрывал. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2" onClick={stop} onContextMenu={stop}>
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={download}
          disabled={busy}
          aria-label={t('file.download')}
        >
          ⤓ {t('file.download')}
        </button>
        {canCopy && (
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={copy}
            disabled={busy}
            aria-label={t('file.copy')}
          >
            {copyState === 'copied'
              ? `✓ ${t('file.copied')}`
              : copyState === 'failed'
                ? t('file.copyFailed')
                : `⧉ ${t('file.copy')}`}
          </button>
        )}
        <button
          className="px-2 text-2xl text-muted hover:text-ink"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </div>
      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-4 text-2xl text-muted hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onNav(-1)
            }}
            aria-label={t('common.back')}
          >
            ‹
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-4 text-2xl text-muted hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onNav(1)
            }}
            aria-label={t('common.forward')}
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
          onClick={stop}
        />
      ) : (
        <div
          className="flex flex-col items-center gap-4 border border-line bg-surface px-8 py-10 text-center"
          onClick={stop}
        >
          <span className="font-mono uppercase tracking-label text-sm text-muted">{formatLabel(cur)}</span>
          <p className="max-w-[60vw] break-all text-sm text-ink/90">{cur?.name || t('file.fileName')}</p>
          <p className="label-sm text-faint">{t('file.cantDisplay')}</p>
          <a href={src} target="_blank" rel="noreferrer" className="btn-solid">
            {t('file.openFile')}
          </a>
        </div>
      )}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 label">
        {index + 1} / {images.length}
      </span>
    </div>
  )
}
