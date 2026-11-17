// Roadmap 6.18: the full-screen zoomable photo opened from a step-2 thumbnail. It grows out of
// the thumbnail and shrinks back into it (Escape, the close button, or dragging the photo
// down); the motion itself lives in zoomMorph.ts. Pinch, pan and the zoom buttons are the
// zoom view's own (roadmap 3.6).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hu } from '../i18n/hu'
import { ZoomPanel, type DismissDrag, type ZoomPhoto } from './ZoomView'
import { ZoomMorph } from './zoomMorph'

export interface ZoomLightboxProps {
  photos: ZoomPhoto[]
  startId: string
  /** The thumbnail image of a photo, to grow out of and shrink back into (null if gone). */
  thumbFor: (id: string) => HTMLElement | null
  /** Called once the close has finished; unmount the lightbox then. */
  onClosed: (lastId: string) => void
}

export function ZoomLightbox({ photos, startId, thumbFor, onClosed }: ZoomLightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const flyerImgRef = useRef<HTMLImageElement>(null)
  const [morph] = useState(() => new ZoomMorph())
  const shown = useRef(startId)
  const latest = useRef({ thumbFor, onClosed })
  useEffect(() => { latest.current = { thumbFor, onClosed } })

  const close = useCallback(() => morph.close(), [morph])
  const onPhoto = useCallback((id: string) => {
    shown.current = id
    morph.setThumb(latest.current.thumbFor(id))
  }, [morph])
  const dismiss = useMemo<DismissDrag>(() => ({
    start: () => morph.dragStart(),
    move: (dx, dy) => morph.dragMove(dx, dy),
    end: (vx, vy) => morph.dragEnd(vx, vy),
    cancel: () => morph.dragCancel(),
  }), [morph])

  // Mount: wire the controller to the DOM, hide the thumbnail and grow out of it.
  useLayoutEffect(() => {
    const root = rootRef.current!
    const viewport = root.querySelector<HTMLElement>('.zoom-viewport')!
    morph.attach({
      backdrop: backdropRef.current!,
      chrome: [...root.querySelectorAll<HTMLElement>('.zoom-head, .zoom-tools')],
      viewport,
      get image() { return viewport.querySelector('img') },
      flyer: flyerRef.current!,
      flyerImage: flyerImgRef.current!,
    }, () => latest.current.onClosed(shown.current))
    const thumb = latest.current.thumbFor(startId)
    morph.setThumb(thumb)
    const t = thumb instanceof HTMLImageElement ? thumb : thumb?.querySelector('img')
    const start = photos.find((p) => p.id === startId)
    if (flyerImgRef.current && start) flyerImgRef.current.src = start.url
    morph.open(t && t.naturalHeight > 0 ? t.naturalWidth / t.naturalHeight : 0)
    return () => morph.detach()
    // Runs once per lightbox: later photo changes go through onPhoto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph])

  // A modal: the app behind takes no input or focus; Escape closes from anywhere.
  useEffect(() => {
    const app = document.getElementById('root')
    const before = document.activeElement as HTMLElement | null
    if (app) app.inert = true
    rootRef.current?.querySelector<HTMLElement>('.zoom-close')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      morph.close()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (app) app.inert = false
      before?.focus({ preventScroll: true })
    }
  }, [morph])

  return createPortal(
    <div className="zoom-lb" ref={rootRef} role="dialog" aria-modal="true" aria-label={hu.plate.zoomDialog}>
      <div className="zoom-lb-backdrop" ref={backdropRef} />
      <div className="zoom-lb-body">
        <ZoomPanel variant="full" photos={photos} startId={startId} onClose={close} onPhoto={onPhoto} onDismiss={dismiss} />
      </div>
      <div className="zoom-lb-flyer" ref={flyerRef} aria-hidden="true" hidden>
        <img ref={flyerImgRef} alt="" draggable={false} />
      </div>
    </div>,
    document.body,
  )
}
