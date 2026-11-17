// Roadmap 6.18: the full-screen photo grows out of the tapped thumbnail and shrinks back into
// it; dragging the photo down follows the finger, shrinks it a little and fades the backdrop.
// While anything moves, a copy of the photo (the "flyer") is drawn above the real zoom view:
// it travels between the thumbnail's crop and the photo's place on screen, clipped to a box
// that travels between the thumbnail and the zoom viewport. One critically damped spring
// (the same as the sheet fold, useSheetMorph) drives it; only transforms, opacity and a
// clip-path change per frame, and React does not render per frame.

export interface Rect { x: number; y: number; w: number; h: number }

const STIFFNESS = 170
const DAMPING = 26 // 2·√170: critically damped, settles without a bounce
/** A release this far down closes the photo (px). */
export const CLOSE_DISTANCE = 120
/** A downward flick this fast closes it whatever the distance (px/s). */
export const CLOSE_FLICK = 600
/** Shrink at a full drag (a drag of `SHRINK_RANGE` px or more). */
const MAX_SHRINK = 0.22
const SHRINK_RANGE = 500

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) }
}

/** The whole photo as `object-fit: cover` lays it out behind a box (centred, cropped by the box). */
export function coverRect(box: Rect, aspect: number): Rect {
  const w = Math.max(box.w, box.h * aspect)
  const h = w / aspect
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** The photo fitted (`contain`) and centred in a box: where the zoom view first shows it. */
export function containRect(box: Rect, aspect: number): Rect {
  const w = Math.min(box.w, box.h * aspect)
  const h = w / aspect
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const btm = Math.min(a.y + a.h, b.y + b.h)
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null
}

/** Scale a rect by `k` about its centre, then move it by (dx, dy). */
export function dragRect(r: Rect, dx: number, dy: number, k: number): Rect {
  const w = r.w * k
  const h = r.h * k
  return { x: r.x + (r.w - w) / 2 + dx, y: r.y + (r.h - h) / 2 + dy, w, h }
}

/** How much a downward drag shrinks the photo: 1 at rest, a little less the further it goes. */
export function dragScale(dy: number): number {
  return 1 - MAX_SHRINK * clamp01(dy / SHRINK_RANGE)
}

/** How far a drag has faded the backdrop: 0 at rest, 1 at about half the screen height. */
export function dragFade(dy: number, screenH: number): number {
  return clamp01(dy / Math.max(1, screenH * 0.5))
}

/** Close or spring back after a released drag. `dy`, `vy`: distance and speed down (px, px/s). */
export function releaseCloses(dy: number, vy: number): boolean {
  if (vy > CLOSE_FLICK) return true
  if (vy < -CLOSE_FLICK) return false // flung back up
  return dy > CLOSE_DISTANCE
}

interface Geometry {
  /** The photo's place on screen at rest (the zoom view's image, as zoomed at the moment). */
  photo: Rect
  /** What of it the viewport shows. */
  clip: Rect
  /** Where it goes when closed: the thumbnail, or null to fade out where it is. */
  thumb: Rect | null
  thumbRadius: number
}

export interface ZoomMorphParts {
  backdrop: HTMLElement
  /** The head and tools: fade in last and leave first. */
  chrome: HTMLElement[]
  /** The real zoom view: hidden while the flyer stands in for it. */
  viewport: HTMLElement
  /** The real image in it. */
  image: HTMLImageElement | null
  flyer: HTMLElement
  flyerImage: HTMLImageElement
}

/** The thumbnail if it is on screen, else null (gone, hidden or scrolled away). */
function thumbOnScreen(el: HTMLElement | null): { rect: Rect; radius: number } | null {
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  const rect = { x: r.left, y: r.top, w: r.width, h: r.height }
  const screen = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  const seen = intersect(rect, screen)
  // Mostly off screen (e.g. scrolled under the header): fade out rather than fly off the edge.
  if (!seen || seen.w * seen.h < 0.5 * rect.w * rect.h) return null
  return { rect, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The open/close and drag-to-close controller for one lightbox. Lives as long as it is mounted. */
export class ZoomMorph {
  private parts: ZoomMorphParts | null = null
  private geo: Geometry | null = null
  private thumbEl: HTMLElement | null = null
  /** 0 = in the thumbnail, 1 = open. */
  private p = 1
  private v = 0
  private target = 1
  /** The drag offset (px) and how much of it is still applied (1 while dragging, springs to 0). */
  private dx = 0
  private dy = 0
  /** Where a new drag starts from: the offset a caught spring-back had reached. */
  private baseX = 0
  private baseY = 0
  private q = 0
  private qv = 0
  private qTarget = 0
  private raf = 0
  private last = 0
  private closing = false
  private onClosed: () => void = () => {}

  attach(parts: ZoomMorphParts | null, onClosed: () => void) {
    this.parts = parts
    this.onClosed = onClosed
  }

  /** The thumbnail of the photo shown now: kept hidden while the photo is open, the target of a close. */
  setThumb(el: HTMLElement | null) {
    if (el === this.thumbEl) return
    if (this.thumbEl) this.thumbEl.style.opacity = ''
    this.thumbEl = el
    if (el) el.style.opacity = '0'
  }

  /** Grow out of the thumbnail. `aspect`: the photo's width / height. */
  open(aspect: number) {
    const parts = this.parts
    if (!parts || reducedMotion() || !(aspect > 0)) { this.p = this.target = 1; return }
    const thumb = thumbOnScreen(this.thumbEl)
    const vp = rectOf(parts.viewport)
    const photo = containRect(vp, aspect)
    this.begin({ photo, clip: intersect(photo, vp) ?? photo, thumb: thumb?.rect ?? null, thumbRadius: thumb?.radius ?? 0 })
    this.p = 0
    this.target = 1
    this.apply()
    this.run()
  }

  /** Shrink back into the thumbnail (Escape, the close button, a released drag). */
  close(velocity = 0) {
    if (this.closing) return
    this.closing = true
    this.target = 0
    this.qTarget = this.q // a released drag closes from where the finger left it
    this.qv = 0
    if (!this.parts || reducedMotion()) { this.done(); return }
    if (!this.geo && !this.measure()) { this.done(); return }
    if (velocity) this.v = velocity
    this.run()
  }

  dragStart() {
    if (this.closing || !this.parts) return
    if (!this.geo && !this.measure()) return
    cancelAnimationFrame(this.raf)
    // A drag that catches a spring-back continues from where the photo is.
    this.baseX = this.dx = this.dx * this.q
    this.baseY = this.dy = this.dy * this.q
    this.q = this.qTarget = 1
    this.qv = 0
    this.target = 1
    this.apply()
  }

  /** `dx`, `dy`: how far the finger moved since the drag started. */
  dragMove(dx: number, dy: number) {
    if (!this.geo || this.closing) return
    this.dx = this.baseX + dx
    this.dy = this.baseY + dy
    this.q = 1
    this.apply()
  }

  /** Release with the finger's speed (px/s, down positive). */
  dragEnd(vx: number, vy: number) {
    if (!this.geo || this.closing) return
    if (releaseCloses(this.dy, vy)) {
      const g = this.geo
      const from = dragRect(g.photo, this.dx, this.dy, dragScale(this.dy))
      const to = g.thumb ?? from
      const dist = Math.hypot(to.x + to.w / 2 - (from.x + from.w / 2), to.y + to.h / 2 - (from.y + from.h / 2))
      // The finger's speed towards the thumbnail, as progress per second.
      const toward = dist > 1 ? -(vx * (to.x + to.w / 2 - from.x - from.w / 2) + vy * (to.y + to.h / 2 - from.y - from.h / 2)) / (dist * dist) : 0
      this.close(Math.min(0, toward))
      return
    }
    if (reducedMotion()) { this.q = this.qTarget = 0; this.finish(); return }
    this.qTarget = 0
    this.qv = Math.abs(this.dy) > 1 ? -vy / this.dy : 0
    this.run()
  }

  /** A second finger came down mid-drag: give the gesture back to pinch-zoom. */
  dragCancel() {
    if (!this.geo || this.closing) return
    this.qTarget = 0
    this.qv = 0
    if (reducedMotion()) { this.q = 0; this.finish(); return }
    this.run()
  }

  detach() {
    cancelAnimationFrame(this.raf)
    this.setThumb(null)
    this.parts = null
    this.geo = null
  }

  /** Geometry of the photo as it is shown now (zoomed or not). */
  private measure(): boolean {
    const parts = this.parts
    if (!parts) return false
    const vp = rectOf(parts.viewport)
    const img = parts.image
    const photo = img && img.getBoundingClientRect().width > 0 ? rectOf(img) : null
    if (!photo) return false
    const thumb = thumbOnScreen(this.thumbEl)
    this.begin({ photo, clip: intersect(photo, vp) ?? vp, thumb: thumb?.rect ?? null, thumbRadius: thumb?.radius ?? 0 })
    return true
  }

  private begin(geo: Geometry) {
    const parts = this.parts!
    this.geo = geo
    const fly = parts.flyerImage
    const src = parts.image?.currentSrc || parts.image?.src
    if (src && fly.src !== src) fly.src = src
    fly.style.width = `${geo.photo.w}px`
    fly.style.height = `${geo.photo.h}px`
    parts.flyer.hidden = false
    parts.viewport.style.opacity = '0'
  }

  /** Re-aim at the thumbnail when closing: the page may have moved while the photo was open. */
  private refreshThumb() {
    const g = this.geo
    if (!g) return
    const thumb = thumbOnScreen(this.thumbEl)
    g.thumb = thumb?.rect ?? null
    g.thumbRadius = thumb?.radius ?? 0
  }

  private apply() {
    const g = this.geo
    const parts = this.parts
    if (!g || !parts) return
    const p = this.p
    const dx = this.dx * this.q
    const dy = this.dy * this.q
    const k = dragScale(dy)
    const fade = dragFade(dy, window.innerHeight)
    const open = dragRect(g.photo, dx, dy, k)
    // The viewport's clip box shrinks with the photo about the photo's centre.
    const cx = g.photo.x + g.photo.w / 2
    const cy = g.photo.y + g.photo.h / 2
    const clipOpen: Rect = {
      x: cx + (g.clip.x - cx) * k + dx, y: cy + (g.clip.y - cy) * k + dy, w: g.clip.w * k, h: g.clip.h * k,
    }
    let photo: Rect
    let clip: Rect
    let radius: number
    let opacity = 1
    const dragRadius = 14 * clamp01(fade * 3)
    if (g.thumb) {
      photo = lerpRect(coverRect(g.thumb, g.photo.w / g.photo.h), open, p)
      clip = lerpRect(g.thumb, clipOpen, p)
      radius = lerp(g.thumbRadius, dragRadius, p)
    } else {
      photo = open
      clip = clipOpen
      radius = dragRadius
      opacity = p
    }
    const W = window.innerWidth
    const H = window.innerHeight
    parts.flyer.style.clipPath =
      `inset(${clip.y}px ${W - clip.x - clip.w}px ${H - clip.y - clip.h}px ${clip.x}px round ${radius}px)`
    parts.flyer.style.opacity = `${opacity}`
    parts.flyerImage.style.transform = `translate(${photo.x}px, ${photo.y}px) scale(${photo.w / g.photo.w})`
    parts.backdrop.style.opacity = `${p * (1 - 0.9 * fade)}`
    const chrome = clamp01((p - 0.7) / 0.3) * (1 - clamp01(fade * 4))
    for (const el of parts.chrome) el.style.opacity = `${chrome}`
  }

  private run() {
    cancelAnimationFrame(this.raf)
    if (this.closing) this.refreshThumb()
    this.last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - this.last) / 1000)
      this.last = now
      for (let i = 0; i < 4; i++) {
        const a = -STIFFNESS * (this.p - this.target) - DAMPING * this.v
        this.v += (a * dt) / 4
        this.p += (this.v * dt) / 4
        // A flick hands the spring speed; past either end it would throw the photo past the
        // thumbnail, so it stops at its end instead.
        if (this.p !== clamp01(this.p)) { this.p = clamp01(this.p); this.v = 0 }
        const b = -STIFFNESS * (this.q - this.qTarget) - DAMPING * this.qv
        this.qv += (b * dt) / 4
        this.q += (this.qv * dt) / 4
        if (this.q !== clamp01(this.q)) { this.q = clamp01(this.q); this.qv = 0 }
      }
      const pDone = Math.abs(this.p - this.target) < 0.002 && Math.abs(this.v) < 0.02
      const qDone = Math.abs(this.q - this.qTarget) < 0.002 && Math.abs(this.qv) < 0.02
      if (pDone && qDone) {
        this.p = this.target
        this.q = this.qTarget
        this.apply()
        if (this.closing) this.done()
        else this.finish()
        return
      }
      this.apply()
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  /** Settled open: the real zoom view takes over again and every inline style goes. */
  private finish() {
    cancelAnimationFrame(this.raf)
    this.v = this.qv = 0
    this.dx = this.dy = this.baseX = this.baseY = this.q = this.qTarget = 0
    this.geo = null
    const parts = this.parts
    if (!parts) return
    parts.flyer.hidden = true
    parts.viewport.style.opacity = ''
    parts.backdrop.style.opacity = ''
    for (const el of parts.chrome) el.style.opacity = ''
  }

  /** Closed: show the thumbnail again and let the owner unmount the lightbox. */
  private done() {
    cancelAnimationFrame(this.raf)
    this.setThumb(null)
    this.onClosed()
  }
}
