import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { isDisplayableImage, formatLabel } from '../lib/files'
import { useT } from '../context/LangContext'
import { Icon, useEsc } from './ui'

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

  // Esc goes through the shared layer stack, so it closes ONLY the lightbox
  // (not the drawer underneath).
  useEsc(onClose, true)
  useEffect(() => {
    function onKey(e) {
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

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[110] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
      onMouseDown={stop}
      role="dialog"
      aria-modal="true"
    >
      {/* Тулбар: скачать / копировать / закрыть. onContextMenu гасим, чтобы клик мимо не закрывал. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2" onClick={stop} onContextMenu={stop}>
        <button className="btn-ghost btn-sm bg-bg/80" onClick={download} disabled={busy} aria-label={t('file.download')}>
          <Icon name="download" size={16} /> <span className="hidden sm:inline">{t('file.download')}</span>
        </button>
        {canCopy && (
          <button className="btn-ghost btn-sm bg-bg/80" onClick={copy} disabled={busy} aria-label={t('file.copy')}>
            <Icon name={copyState === 'copied' ? 'check' : copyState === 'failed' ? 'alert' : 'copy'} size={16} />
            <span className="hidden sm:inline">
              {copyState === 'copied' ? t('file.copied') : copyState === 'failed' ? t('file.copyFailed') : t('file.copy')}
            </span>
          </button>
        )}
        <button className="icon-btn border-line2 bg-bg/80 text-ink" onClick={onClose} aria-label={t('common.close')} title={t('common.close') + ' (Esc)'}>
          <Icon name="close" size={20} />
        </button>
      </div>
      {images.length > 1 && (
        <>
          <button
            className="icon-btn absolute left-3 top-1/2 z-10 h-12 w-12 -translate-y-1/2 border-line2 bg-bg/80 text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onNav(-1)
            }}
            aria-label={t('common.back')}
          >
            <Icon name="back" size={22} />
          </button>
          <button
            className="icon-btn absolute right-3 top-1/2 z-10 h-12 w-12 -translate-y-1/2 border-line2 bg-bg/80 text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onNav(1)
            }}
            aria-label={t('common.forward')}
          >
            <Icon name="forward" size={22} />
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
          <span className="num text-[15px] uppercase text-muted">{formatLabel(cur)}</span>
          <p className="max-w-[60vw] break-all text-[15px] text-ink/90">{cur?.name || t('file.fileName')}</p>
          <p className="text-[13px] text-faint">{t('file.cantDisplay')}</p>
          <a href={src} target="_blank" rel="noreferrer" className="btn-solid">
            {t('file.openFile')}
          </a>
        </div>
      )}
      <span className="num absolute bottom-4 left-1/2 -translate-x-1/2 bg-bg/80 px-2 py-1 text-[13px] text-ink">
        {index + 1} / {images.length}
      </span>
    </div>,
    document.body,
  )
}
