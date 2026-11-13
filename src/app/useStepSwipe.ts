// Swipe between the steps on the phone (owner, roadmap 6.7). The current screen follows the
// finger; the next step's header peeks in from the right (or the previous one from the left),
// and letting go past a third of the width (or with a quick flick) moves on. When the next step
// is not allowed yet, the screen only stretches a little and springs back, and `onBlocked`
// shows what is missing. DOM only: transforms are set directly, never through React state, so
// a drag does not re-render the app.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export interface SwipeConfig {
  enabled: boolean
  /** Forward: null when there is no next step from here. */
  forward: null | { allowed: boolean; go: () => void; onBlocked: () => void }
  /** Back: null when there is no previous step from here. */
  back: null | { go: () => void }
}

interface Parts {
  /** What follows the finger: the sheet in step 1, the page frame otherwise. */
  target: RefObject<HTMLElement | null>
  peekForward: RefObject<HTMLElement | null>
  /** The previous page's header; none when going back reveals what is underneath. */
  peekBack: RefObject<HTMLElement | null>
  /** Shown during a back swipe when it lies under the target (step 1's sheet). */
  reveal: RefObject<HTMLElement | null>
}

/** Touches that start this close to a screen edge belong to Android's own back gesture. */
const EDGE = 20
/** Movement before the direction is decided. */
const SLOP = 10
/** How far the screen stretches when a swipe is not allowed. */
const RUBBER_MAX = 56
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

// Fields keep their own touch handling; the sheet handle drags the sheet up and down.
const NO_SWIPE = 'input, textarea, select, [contenteditable="true"], .sheet-handle, [data-no-swipe]'

/** Puts the screens back: the swipe's animations, transforms and visibility overrides. */
function resetSwipe({ target, peekForward, peekBack, reveal }: Parts, anims: Animation[]) {
  anims.forEach((a) => a.cancel())
  for (const el of [target.current, peekForward.current, peekBack.current]) {
    if (!el) continue
    el.style.transform = ''
    el.style.transition = ''
  }
  for (const el of [peekForward.current, peekBack.current]) if (el) el.style.visibility = ''
  if (reveal.current) reveal.current.style.visibility = ''
}

export function useStepSwipe(config: SwipeConfig, parts: Parts, viewKey: string) {
  const cfg = useRef(config)
  useLayoutEffect(() => { cfg.current = config })
  // Set when a swipe has handed over to a step change; the change settles it (below).
  const arriving = useRef<number | null>(null)
  // The swipe's own animations (the sheet also runs height animations of its own).
  const ours = useRef<Animation[]>([])

  const partsRef = useRef(parts)
  useLayoutEffect(() => { partsRef.current = parts })
  // The parts of the gesture in flight: after a step change the current ones point elsewhere
  // (step 1's sheet was dragged, the page is the target now).
  const active = useRef<Parts | null>(null)
  const clear = () => {
    resetSwipe(active.current ?? partsRef.current, ours.current)
    ours.current = []
    active.current = null
  }

  // A step changed after a swipe: the new screen is already in place, so skip its usual slide-in
  // (it would move a second time) and only fade its content in.
  useLayoutEffect(() => {
    if (arriving.current === null) return
    window.clearTimeout(arriving.current)
    arriving.current = null
    clear()
    const page = document.querySelector<HTMLElement>('.app-phone > .page')
    if (!page) return
    for (const a of page.getAnimations({ subtree: true })) {
      if (a instanceof CSSAnimation && a.animationName.startsWith('ps-slide-in')) a.finish()
    }
    page.querySelector('.page-body')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease' })
  }, [viewKey])

  useEffect(() => {
    const parts = partsRef.current
    const el = parts.target.current
    if (!el || !config.enabled) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let start: { id: number; x: number; y: number } | null = null
    let locked = false
    let off = 0
    let last = { x: 0, t: 0, v: 0 }

    const width = () => el.getBoundingClientRect().width || window.innerWidth
    const rubber = (d: number) => Math.sign(d) * Math.min(RUBBER_MAX, Math.abs(d) * 0.2)

    const place = (x: number) => {
      const w = width()
      const { forward, back } = cfg.current
      el.style.transition = 'none'
      el.style.transform = x === 0 ? '' : `translateX(${x}px)`
      const fwd = parts.peekForward.current
      if (fwd) {
        const show = x < 0 && !!forward?.allowed
        fwd.style.visibility = show ? 'visible' : ''
        fwd.style.transform = show ? `translateX(${w + x}px)` : ''
      }
      const bk = parts.peekBack.current
      if (bk) {
        const show = x > 0 && !!back
        bk.style.visibility = show ? 'visible' : ''
        bk.style.transform = show ? `translateX(${x - w}px)` : ''
      }
      if (parts.reveal.current && !parts.peekBack.current) parts.reveal.current.style.visibility = x > 0 && back ? 'visible' : ''
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || start) return
      if (ours.current.length > 0) clear() // a new touch during a spring-back
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return
      if (e.target instanceof Element && e.target.closest(NO_SWIPE)) return
      start = { id: e.pointerId, x: e.clientX, y: e.clientY }
      active.current = parts
      locked = false
      off = 0
      last = { x: e.clientX, t: e.timeStamp, v: 0 }
    }

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!locked) {
        if (Math.hypot(dx, dy) < SLOP) return
        // Mostly sideways: a swipe. Otherwise the page scrolls and this gesture is not ours.
        if (Math.abs(dx) < Math.abs(dy) * 1.3) { start = null; return }
        locked = true
        try { el.setPointerCapture(e.pointerId) } catch { /* the pointer may be gone already */ }
      }
      const dt = e.timeStamp - last.t
      if (dt > 0) last = { x: e.clientX, t: e.timeStamp, v: (e.clientX - last.x) / dt }
      const { forward, back } = cfg.current
      const w = width()
      off = dx < 0
        ? (forward?.allowed ? Math.max(dx, -w) : rubber(dx))
        : (back ? Math.min(dx, w) : rubber(dx))
      place(off)
    }

    const animateTo = (x: number, then?: () => void) => {
      const w = width()
      const from = off
      const dur = reduced.matches ? 0 : Math.max(140, Math.min(280, (Math.abs(x - from) / w) * 360))
      const frames = (a: number, b: number) => [{ transform: `translateX(${a}px)` }, { transform: `translateX(${b}px)` }]
      const opts: KeyframeAnimationOptions = { duration: dur, easing: EASE, fill: 'forwards' }
      const anims = [el.animate(frames(from, x), opts)]
      const fwd = parts.peekForward.current
      if (fwd && fwd.style.visibility === 'visible') anims.push(fwd.animate(frames(w + from, w + x), opts))
      const bk = parts.peekBack.current
      if (bk && bk.style.visibility === 'visible') anims.push(bk.animate(frames(from - w, x - w), opts))
      ours.current.push(...anims)
      void anims[0].finished.then(() => {
        if (then) then()
        else clear()
      }, () => { /* cancelled by a newer gesture */ })
    }

    const commit = (go: () => void, x: number) => {
      animateTo(x, () => {
        // The step change settles the screens (the layout effect above); if it does not happen
        // (a step refused to open), put everything back.
        arriving.current = window.setTimeout(() => { arriving.current = null; clear() }, 600)
        go()
      })
    }

    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      start = null
      if (!locked) return
      locked = false
      const { forward, back } = cfg.current
      const w = width()
      const flick = Math.abs(last.v) > 0.5 && Math.abs(off) > 40
      if (off < 0 && forward?.allowed && (off < -w / 3 || (flick && last.v < 0))) commit(forward.go, -w)
      else if (off > 0 && back && (off > w / 3 || (flick && last.v > 0))) commit(back.go, w)
      else {
        if (off < -12 && forward && !forward.allowed) forward.onBlocked()
        animateTo(0)
      }
      off = 0
    }

    const onCancel = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      start = null
      if (locked) { locked = false; animateTo(0) }
      off = 0
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [viewKey, config.enabled])
}
