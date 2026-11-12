// Roadmap 3.6: zoomable photo for typing the plate (SPEC 4.9 F-PLATE-4), with or without the
// reader. Pinch and drag on touch, wheel, drag, double-click and buttons on PC, arrow keys
// and +/− on the keyboard. Pointer events only, no library.
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { hu } from '../i18n/hu'
import { IconClose, IconPlus } from '../app/icons'
import type { FocusBox } from './usePlateReader'

interface View {
  /** Which photo and focus this view belongs to; a new key starts from the initial view. */
  key: string
  /** Screen pixels per image pixel. */
  s: number
  /** Position of the image's top-left corner in the viewport. */
  tx: number
  ty: number
}

interface Size { w: number; h: number }

const MAX_ZOOM_OF_FIT = 24
const STEP = 1.6

function fitScale(box: Size, img: Size) {
  return Math.min(box.w / img.w, box.h / img.h)
}
function limits(box: Size, img: Size) {
  const fit = fitScale(box, img)
  return { min: fit, max: Math.max(fit * MAX_ZOOM_OF_FIT, 3) }
}

/** Keep the image on screen: centred when smaller than the viewport, else no empty edge. */
function clampView(v: View, box: Size, img: Size): View {
  const { min, max } = limits(box, img)
  const s = Math.min(max, Math.max(min, v.s))
  const w = img.w * s
  const h = img.h * s
  const tx = w <= box.w ? (box.w - w) / 2 : Math.min(0, Math.max(box.w - w, v.tx))
  const ty = h <= box.h ? (box.h - h) / 2 : Math.min(0, Math.max(box.h - h, v.ty))
  return { key: v.key, s, tx, ty }
}

function initialView(key: string, box: Size, img: Size, focus: FocusBox | null | undefined): View {
  if (!focus || !(focus.w > 0 && focus.h > 0)) return clampView({ key, s: 0, tx: 0, ty: 0 }, box, img)
  const fw = focus.w * img.w
  const fh = focus.h * img.h
  const s = Math.min((0.85 * box.w) / fw, (0.6 * box.h) / fh)
  const cx = (focus.x + focus.w / 2) * img.w
  const cy = (focus.y + focus.h / 2) * img.h
  return clampView({ key, s, tx: box.w / 2 - cx * s, ty: box.h / 2 - cy * s }, box, img)
}

function zoomAt(v: View, factor: number, px: number, py: number, box: Size, img: Size): View {
  const { min, max } = limits(box, img)
  const s = Math.min(max, Math.max(min, v.s * factor))
  const k = s / v.s
  return clampView({ key: v.key, s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }, box, img)
}

export interface ZoomViewProps {
  src: string
  alt: string
  /** Part of the photo to show first (a detected plate), else the whole photo. */
  focus?: FocusBox | null
}

export function ZoomView({ src, alt, focus }: ZoomViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Size | null>(null)
  const [nat, setNat] = useState<{ src: string } & Size | null>(null)
  const [view, setView] = useState<View | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  const key = `${src}|${focus ? `${focus.x},${focus.y},${focus.w},${focus.h}` : ''}`
  const img = nat && nat.src === src ? nat : null
  const ready = box && img && box.w > 0 && box.h > 0
  const current = ready ? (view && view.key === key ? clampView(view, box, img) : initialView(key, box, img, focus)) : null
  const latest = useRef({ current, box, img })
  useEffect(() => { latest.current = { current, box, img } })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    // Wheel zoom needs a non-passive listener to keep the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      const { current: v, box: b, img: i } = latest.current
      if (!v || !b || !i) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      setView(zoomAt(v, Math.exp(-e.deltaY * unit * 0.0015), e.clientX - r.left, e.clientY - r.top, b, i))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [])

  const apply = (f: (v: View, b: Size, i: Size) => View) => {
    const { current: v, box: b, img: i } = latest.current
    if (v && b && i) setView(f(v, b, i))
  }
  const zoomCentre = (factor: number) => apply((v, b, i) => zoomAt(v, factor, b.w / 2, b.h / 2, b, i))
  const reset = () => setView(null)

  const local = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    pointers.current.set(e.pointerId, local(e))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ps = pointers.current
    const prev = ps.get(e.pointerId)
    if (!prev) return
    const now = local(e)
    if (ps.size === 1) {
      apply((v, b, i) => clampView({ ...v, tx: v.tx + now.x - prev.x, ty: v.ty + now.y - prev.y }, b, i))
    } else if (ps.size === 2) {
      const other = [...ps.entries()].find(([id]) => id !== e.pointerId)![1]
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y)
      const d1 = Math.hypot(now.x - other.x, now.y - other.y)
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
      const m1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 }
      apply((v, b, i) => {
        const z = d0 > 0 ? zoomAt(v, d1 / d0, m0.x, m0.y, b, i) : v
        return clampView({ ...z, tx: z.tx + m1.x - m0.x, ty: z.ty + m1.y - m0.y }, b, i)
      })
    }
    ps.set(e.pointerId, now)
  }
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId) }
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect()
    apply((v, b, i) => zoomAt(v, 2, e.clientX - r.left, e.clientY - r.top, b, i))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const pan = 40
    const moves: Record<string, [number, number]> = { ArrowLeft: [pan, 0], ArrowRight: [-pan, 0], ArrowUp: [0, pan], ArrowDown: [0, -pan] }
    if (moves[e.key]) {
      const [dx, dy] = moves[e.key]
      apply((v, b, i) => clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }, b, i))
    } else if (e.key === '+' || e.key === '=') zoomCentre(STEP)
    else if (e.key === '-') zoomCentre(1 / STEP)
    else if (e.key === '0') reset()
    else return
    e.preventDefault()
  }

  const lim = ready ? limits(box, img) : null
  return (
    <div className="zoom">
      <div ref={ref} className="zoom-viewport" tabIndex={0} role="group" aria-label={hu.plate.zoomLabel}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onDoubleClick={onDoubleClick} onKeyDown={onKeyDown}>
        <img src={src} alt={alt} draggable={false}
          onLoad={(e) => {
            setNat({ src, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            // Measure here too: ResizeObserver only reports on the next rendered frame.
            if (ref.current) setBox({ w: ref.current.clientWidth, h: ref.current.clientHeight })
          }}
          style={current
            ? { width: img!.w, height: img!.h, transform: `translate(${current.tx}px, ${current.ty}px) scale(${current.s})` }
            : { visibility: 'hidden' }} />
      </div>
      <div className="zoom-tools">
        <span className="muted small">{hu.plate.zoomCaption}</span>
        <div className="zoom-buttons">
          <button type="button" className="icon-btn" aria-label={hu.plate.zoomOut} onClick={() => zoomCentre(1 / STEP)}
            disabled={!current || !lim || current.s <= lim.min + 1e-9}>
            <span aria-hidden="true" className="zoom-minus" />
          </button>
          <button type="button" className="icon-btn" aria-label={hu.plate.zoomIn} onClick={() => zoomCentre(STEP)}
            disabled={!current || !lim || current.s >= lim.max - 1e-9}>
            <IconPlus />
          </button>
          <button type="button" className="btn-link" onClick={reset} disabled={!current}>{hu.plate.zoomReset}</button>
        </div>
      </div>
    </div>
  )
}

export interface ZoomPhoto {
  id: string
  url: string
  /** A detected plate on this photo to show first. */
  focus?: FocusBox | null
}

/** The zoomable view with a photo switcher when the report has several photos. */
export function ZoomPanel({ photos, startId, onClose }: { photos: ZoomPhoto[]; startId?: string; onClose?: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const id = [chosen, startId].find((x) => x && photos.some((p) => p.id === x)) ?? photos[0]?.id
  const index = Math.max(0, photos.findIndex((p) => p.id === id))
  const photo = photos[index]
  if (!photo) return null
  return (
    <div className="zoom-panel" onKeyDown={(e) => { if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose() } }}>
      {(photos.length > 1 || onClose) && (
        <div className="zoom-head">
          {photos.length > 1 && (
            <div className="zoom-photos" role="group" aria-label={hu.plate.zoomPhotos}>
              {photos.map((p, i) => (
                <button key={p.id} type="button" className="zoom-photo-btn" aria-pressed={i === index}
                  aria-label={hu.report.photoAlt(i + 1)} onClick={() => setChosen(p.id)}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          {onClose && (
            <button type="button" className="icon-btn zoom-close" aria-label={hu.plate.zoomClose} onClick={onClose}>
              <IconClose />
            </button>
          )}
        </div>
      )}
      <ZoomView src={photo.url} alt={hu.report.photoAlt(index + 1)} focus={photo.focus} />
    </div>
  )
}
