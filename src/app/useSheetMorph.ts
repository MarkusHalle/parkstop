// Phone bottom-sheet fold (owner's option A with a morph, roadmap 6.14). One progress value
// (0 = folded, 1 = open) drives everything: the height of the sheet's middle part and a morph
// of the open card into the folded summary. The authority's name, the address line, the label
// and the confidence chip travel from their place in the card to their place in the summary
// and change size on the way; the rest of the card fades and sinks. A drag on the grip moves
// the progress 1:1 with the finger, and a release or tap settles it with a critically damped
// spring that keeps the finger's speed. Only transforms, opacity and one height change per
// frame, and no React render per frame.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Card element ↔ summary element that morph into each other (first match in each part). Plain
 * text is placed by its glyphs, not its box: the start panel's title is left-aligned in a
 * full-width box while the folded title is centred, so boxes would slide the wrong way.
 */
const PAIRS: ReadonlyArray<readonly [card: string, peek: string, byText: boolean]> = [
  ['.eyebrow', '.sheet-peek-top .eyebrow', true],
  ['.chip', '.sheet-peek-top .chip', false],
  ['.title', '.sheet-peek-name', true],
  ['.address-line > span', '.sheet-peek-sub', true],
]
const STIFFNESS = 170
const DAMPING = 26 // 2·√170: critically damped, settles without a bounce
const FLICK = 300 // px/s; a faster release decides the direction on its own

interface Box { x: number; y: number; w: number; size: number }
/** A copy pair that cross-fades, or (peekClone null) one word that travels on its own. */
interface Pair { card: HTMLElement; peek: HTMLElement; cardClone: HTMLElement; peekClone: HTMLElement | null; a: Box; b: Box }
interface Geometry {
  stage: HTMLElement; body: HTMLElement; peek: HTMLElement; overlay: HTMLElement
  openH: number; foldH: number; pairs: Pair[]
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function box(el: HTMLElement, origin: DOMRect, byText: boolean): Box {
  let r = el.getBoundingClientRect()
  if (byText) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const t = range.getBoundingClientRect()
    // One pixel of slack so the copy, at the text's own width, wraps exactly like the original.
    if (t.width > 0) r = new DOMRect(t.left, t.top, Math.min(t.width + 1, r.width), t.height)
  }
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, size: parseFloat(getComputedStyle(el).fontSize) || 16 }
}

/**
 * Each word of `el` with its place, or null when a word breaks across lines (a hyphenated
 * compound) or the text is cut by an ellipsis: then the copies cross-fade instead.
 */
function words(el: HTMLElement, origin: DOMRect): Array<{ text: string; at: Box }> | null {
  if (el.scrollWidth > el.clientWidth + 1) return null
  const size = parseFloat(getComputedStyle(el).fontSize) || 16
  const out: Array<{ text: string; at: Box }> = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
      range.setStart(n, m.index)
      range.setEnd(n, m.index + m[0].length)
      const rects = range.getClientRects()
      if (rects.length !== 1) return null
      const r = rects[0]
      out.push({ text: m[0], at: { x: r.left - origin.left, y: r.top - origin.top, w: r.width + 1, size } })
    }
  }
  return out
}

function visible(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().height > 0
}

/** Styles a copy outside its ancestors would lose (scoped rules such as `.sheet-peek-top .chip`). */
const KEEP = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color',
  'white-space', 'text-overflow', 'overflow', 'display', 'align-items', 'gap', 'height', 'padding', 'background-color',
  'border-radius', 'box-sizing', 'text-align'] as const

function placeClone(src: HTMLElement, at: Box): HTMLElement {
  const c = src.cloneNode(true) as HTMLElement
  c.removeAttribute('id')
  c.setAttribute('aria-hidden', 'true')
  const cs = getComputedStyle(src)
  for (const k of KEEP) c.style.setProperty(k, cs.getPropertyValue(k))
  Object.assign(c.style, {
    position: 'absolute', left: `${at.x}px`, top: `${at.y}px`, width: `${at.w}px`, margin: '0',
    transformOrigin: '0 0', visibility: 'visible', willChange: 'transform, opacity',
  })
  return c
}

/** The fold controller for one sheet element. Lives as long as the component. */
export class SheetMorph {
  private sheet: HTMLElement | null = null
  private geo: Geometry | null = null
  private p = 1
  private v = 0
  private target = 1
  private raf = 0
  private last = 0
  private dragFrom: number | null = null
  private onHeight: (h: number) => void = () => {}

  attach(sheet: HTMLElement | null, open: boolean, onHeight: (h: number) => void) {
    if (sheet !== this.sheet) { this.finish(); this.sheet = sheet; this.p = this.target = open ? 1 : 0 }
    this.onHeight = onHeight
  }

  detach() { this.finish(); this.sheet = null }

  /** The open state changed (tap, Escape, the summary button, or a released drag). */
  goTo(open: boolean, velocity = 0) {
    const t = open ? 1 : 0
    if (!this.sheet) { this.p = this.target = t; return }
    if (!this.geo && this.p === t) return
    this.target = t
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this.p = t; this.finish(); return }
    if (!this.begin()) { this.p = t; return }
    if (velocity) this.v = velocity
    this.reportHeight()
    this.run()
  }

  dragStart() {
    if (!this.sheet || !this.begin()) return
    cancelAnimationFrame(this.raf)
    this.dragFrom = this.p
    this.v = 0
  }

  /** `dy`: pixels the finger moved down since the drag started. */
  dragMove(dy: number) {
    const g = this.geo
    if (this.dragFrom === null || !g) return
    this.p = clamp01(this.dragFrom - dy / Math.max(1, g.openH - g.foldH))
    this.apply()
  }

  /** `vy`: the finger's speed at release, px/s, positive downwards. Returns the open state to commit. */
  dragEnd(vy: number): boolean {
    const g = this.geo
    if (this.dragFrom === null || !g) return this.target === 1
    this.dragFrom = null
    const open = vy < -FLICK ? true : vy > FLICK ? false : this.p > 0.5
    this.target = open ? 1 : 0
    this.v = -vy / Math.max(1, g.openH - g.foldH)
    this.reportHeight()
    this.run()
    return open
  }

  /** Measure both layouts and build the morph overlay. False when there is nothing to animate. */
  private begin(): boolean {
    if (this.geo) return true
    const sheet = this.sheet
    const stage = sheet?.querySelector<HTMLElement>(':scope > .sheet-stage')
    const body = stage?.querySelector<HTMLElement>(':scope > .sheet-body')
    const peek = stage?.querySelector<HTMLElement>(':scope > .sheet-fold-peek')
    if (!sheet || !stage || !body || !peek) return false
    const scroll = body.scrollTop
    // Handle, footer and padding, measured in the settled layout before the stage is unpinned.
    const chrome = sheet.getBoundingClientRect().height - stage.getBoundingClientRect().height
    sheet.dataset.morph = ''
    stage.style.height = ''
    // The open height: the card's content, capped so the whole sheet stays within its max-height.
    const maxH = getComputedStyle(sheet).maxHeight
    const parent = (sheet.offsetParent as HTMLElement | null) ?? document.documentElement
    const cap = maxH.endsWith('%') ? (parseFloat(maxH) / 100) * parent.clientHeight : parseFloat(maxH)
    const openH = Math.min(body.scrollHeight, Number.isFinite(cap) ? cap - chrome : Infinity)
    const foldH = peek.offsetHeight
    body.style.height = `${openH}px`
    body.scrollTop = scroll // folding a scrolled card starts from what is on screen
    const origin = stage.getBoundingClientRect()
    const overlay = document.createElement('div')
    overlay.className = 'sheet-morph'
    overlay.setAttribute('aria-hidden', 'true')
    const pairs: Pair[] = []
    for (const [inCard, inPeek, byText] of PAIRS) {
      const card = body.querySelector<HTMLElement>(inCard)
      const pk = peek.querySelector<HTMLElement>(inPeek)
      if (!visible(card) || !visible(pk)) continue
      const a = box(card, origin, byText)
      const b = box(pk, origin, byText)
      if (a.y > openH) continue // scrolled out of the open card: it just fades with the rest
      // Same words on both sides (the start panel's title): each word slides to its new place,
      // so a left-aligned line re-centres smoothly instead of cross-fading two alignments.
      const wa = byText ? words(card, origin) : null
      const wb = wa ? words(pk, origin) : null
      if (wa && wb && wa.length === wb.length && wa.every((w, i) => w.text === wb[i].text)) {
        const cs = getComputedStyle(card)
        for (const [i, w] of wa.entries()) {
          const span = document.createElement('span')
          span.textContent = w.text
          for (const k of ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color'] as const) span.style.setProperty(k, cs.getPropertyValue(k))
          Object.assign(span.style, { position: 'absolute', left: `${w.at.x}px`, top: `${w.at.y}px`, whiteSpace: 'nowrap', lineHeight: 'normal', transformOrigin: '0 0', willChange: 'transform' })
          overlay.append(span)
          pairs.push({ card, peek: pk, cardClone: span, peekClone: null, a: w.at, b: wb[i].at })
        }
        card.style.visibility = 'hidden'
        pk.style.visibility = 'hidden'
        continue
      }
      const cardClone = placeClone(card, a)
      const peekClone = placeClone(pk, b)
      overlay.append(cardClone, peekClone)
      card.style.visibility = 'hidden'
      pk.style.visibility = 'hidden'
      pairs.push({ card, peek: pk, cardClone, peekClone, a, b })
    }
    stage.append(overlay)
    this.geo = { stage, body, peek, overlay, openH, foldH, pairs }
    this.apply()
    return true
  }

  private apply() {
    const g = this.geo
    if (!g) return
    const p = this.p
    g.stage.style.height = `${lerp(g.foldH, g.openH, p)}px`
    const card = clamp01((p - 0.4) / 0.6)
    g.body.style.opacity = `${card}`
    g.body.style.transform = `translateY(${(1 - p) * 14}px)`
    g.peek.style.opacity = `${clamp01((0.6 - p) / 0.6)}`
    const swap = clamp01((p - 0.35) / 0.3) // the card copy takes over from the summary copy midway
    for (const { cardClone, peekClone, a, b } of g.pairs) {
      const x = lerp(b.x, a.x, p)
      const y = lerp(b.y, a.y, p)
      const s = lerp(b.size, a.size, p)
      cardClone.style.transform = `translate(${x - a.x}px, ${y - a.y}px) scale(${s / a.size})`
      if (!peekClone) continue // a travelling word: no cross-fade
      cardClone.style.opacity = `${swap}`
      peekClone.style.transform = `translate(${x - b.x}px, ${y - b.y}px) scale(${s / b.size})`
      // The one-line summary copy leaves a little earlier, so it does not ghost beside a wrapped title.
      peekClone.style.opacity = `${1 - clamp01((p - 0.3) / 0.2)}`
    }
  }

  private run() {
    cancelAnimationFrame(this.raf)
    this.last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - this.last) / 1000)
      this.last = now
      for (let i = 0; i < 4; i++) {
        const a = -STIFFNESS * (this.p - this.target) - DAMPING * this.v
        this.v += (a * dt) / 4
        this.p += (this.v * dt) / 4
      }
      if (Math.abs(this.p - this.target) < 0.002 && Math.abs(this.v) < 0.02) {
        this.p = this.target
        this.finish()
        return
      }
      this.apply()
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  /** Tell the map the height the sheet is heading for, so it eases along at once. */
  private reportHeight() {
    const g = this.geo
    if (!g || !this.sheet) return
    const now = this.sheet.getBoundingClientRect().height
    this.onHeight(now - g.stage.getBoundingClientRect().height + (this.target ? g.openH : g.foldH))
  }

  /** Drop the overlay and every inline style; the classes alone describe the settled state. */
  private finish() {
    cancelAnimationFrame(this.raf)
    this.v = 0
    this.dragFrom = null
    const g = this.geo
    this.geo = null
    if (!g) return
    for (const { card, peek } of g.pairs) { card.style.visibility = ''; peek.style.visibility = '' }
    g.overlay.remove()
    for (const el of [g.stage, g.body, g.peek]) { el.style.height = ''; el.style.opacity = ''; el.style.transform = '' }
    if (this.sheet) delete this.sheet.dataset.morph
  }
}

/**
 * Drives the phone sheet's fold. `open` is the committed state; the returned controller also
 * takes the grip's drag. `onHeight` gets the sheet's end height as soon as a fold starts.
 */
export function useSheetMorph(sheetRef: RefObject<HTMLElement | null>, open: boolean, enabled: boolean, onHeight: (h: number) => void): SheetMorph {
  const [morph] = useState(() => new SheetMorph())
  useLayoutEffect(() => {
    morph.attach(enabled ? sheetRef.current : null, open, onHeight)
  })
  useLayoutEffect(() => {
    if (enabled) morph.goTo(open)
  }, [morph, open, enabled])
  useEffect(() => () => morph.detach(), [morph])
  return morph
}
