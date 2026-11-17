// Step 1 → 2 summary morph on the phone (roadmap 6.19, owner-approved mockup). Moving between
// step 1 and step 2 — a swipe, the main button, or Back — the authority's name and the place
// travel from step 1's sheet (the open card's title and address, or the folded summary) into
// step 2's context line under its title. Every word travels on its own to its place in the
// wrapped line and rides with its sliding page on the way (the source end with step 1's sheet,
// the target end with step 2's page); font size, weight and colour interpolate, and a word only
// one side has (the "·" between name and place) fades. When a text is cut by an ellipsis or a
// word breaks across lines, the two texts cross-fade instead. One progress value drives it
// (0 = step 1, 1 = step 2); transforms, opacity and the travelling words' own font change per
// frame, no React render.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { spring } from './spring'

interface Look { x: number; y: number; size: number; weight: number; color: number[] }
interface Word { text: string; at: Look; family: string }
interface Mover { el: HTMLElement; a: Look | null; b: Look | null; offA: [number, number]; offB: [number, number] }
interface Run {
  layer: HTMLElement | null
  movers: Mover[]
  /** Cross-fade instead of travelling words. */
  fade: { sources: HTMLElement[]; target: HTMLElement } | null
  hidden: HTMLElement[]
}
export interface Ends { sources: HTMLElement[]; target: HTMLElement }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => t * t * (3 - 2 * t)
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function rgb(c: string): number[] | null {
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim())
  if (!m) return null
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return n.length >= 3 && n.slice(0, 3).every(Number.isFinite) ? [n[0], n[1], n[2], n[3] ?? 1] : null
}

/** Each word of `el` with its place and look, or null when a word breaks or the text is cut. */
function words(el: HTMLElement, origin: DOMRect): Word[] | null {
  if (el.scrollWidth > el.clientWidth + 1) return null // an ellipsis
  const out: Word[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const cs = getComputedStyle(n.parentElement ?? el)
    const color = rgb(cs.color)
    if (!color) return null
    const look = { size: parseFloat(cs.fontSize) || 16, weight: parseFloat(cs.fontWeight) || 400, color }
    for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
      range.setStart(n, m.index)
      range.setEnd(n, m.index + m[0].length)
      const rects = range.getClientRects()
      if (rects.length !== 1) return null // a word broken across lines
      const r = rects[0]
      out.push({ text: m[0], family: cs.fontFamily, at: { x: r.left - origin.left, y: r.top - origin.top, ...look } })
    }
  }
  return out
}

/** Pairs equal words in order (longest common subsequence): [source index | null, target index | null]. */
export function pairWords(a: readonly string[], b: readonly string[]): Array<[number | null, number | null]> {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  }
  const out: Array<[number | null, number | null]> = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push([i++, j++])
    else if (j < b.length && (i === a.length || L[i][j + 1] >= L[i + 1][j])) out.push([null, j++])
    else out.push([i++, null])
  }
  return out
}

function setLook(el: HTMLElement, l: Pick<Look, 'size' | 'weight' | 'color'>) {
  el.style.fontSize = `${l.size}px`
  el.style.fontWeight = `${Math.round(l.weight)}`
  el.style.color = `rgba(${l.color[0]}, ${l.color[1]}, ${l.color[2]}, ${l.color[3]})`
}

/** Where a copy's glyphs sit relative to its own box, in a look (measured once, so both ends land exactly). */
function glyphOffset(el: HTMLElement, l: Look): [number, number] {
  setLook(el, l)
  const box = el.getBoundingClientRect()
  const range = document.createRange()
  range.selectNodeContents(el)
  const r = range.getBoundingClientRect()
  return [r.left - box.left, r.top - box.top]
}

/** The texts step 1 shows: the open card's title and address, or the folded summary. Only what is on screen. */
export function summarySources(sheet: HTMLElement | null): HTMLElement[] {
  if (!sheet || sheet.hasAttribute('data-morph')) return []
  const folded = sheet.classList.contains('is-folded')
  const view = sheet.querySelector<HTMLElement>(folded ? '.sheet-stage' : '.sheet-body')
  if (!view) return []
  const clip = view.getBoundingClientRect()
  const pick = folded ? ['.sheet-fold-peek .sheet-peek-name', '.sheet-fold-peek .sheet-peek-sub'] : ['.sheet-body .title', '.sheet-body .address-line > span']
  return pick.map((s) => sheet.querySelector<HTMLElement>(s)).filter((el): el is HTMLElement => {
    const r = el?.getBoundingClientRect()
    return !!r && r.height > 0 && r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1
  })
}

/** The morph layer for one app. `track` builds it on first use; `end` drops it. */
export class StepMorph {
  private run: Run | null = null
  private failed = false
  private shift = { src: 0, dst: 0 }
  /** Who drives the morph: a swipe in progress, or an animation started by a button or Back. */
  mode: 'gesture' | 'auto' | null = null
  private stopAuto: (() => void) | null = null
  private autoDone: (() => void) | null = null

  get active() { return this.mode !== null }

  /**
   * Places the morph at progress `p`. `src` and `dst`: how far step 1's sheet and step 2's page
   * are moved sideways right now. Measures both ends on first call.
   */
  track(p: number, src: number, dst: number, ends: () => Ends | null, mode: 'gesture' | 'auto' = 'gesture') {
    // Marked even when there is nothing to morph, so Back after a swipe does not play it again.
    this.mode ??= mode
    if (this.failed) return
    if (!this.run) {
      if (reducedMotion()) { this.failed = true; return }
      const e = ends()
      if (!e || e.sources.length === 0) { this.failed = true; return }
      this.run = this.begin(e, src, dst)
    }
    this.shift = { src, dst }
    this.apply(p)
  }

  /** Measure both ends (subtracting the pages' current shifts) and build the travelling words. */
  private begin({ sources, target }: Ends, src: number, dst: number): Run {
    const app = target.closest<HTMLElement>('.app-phone') ?? document.body
    const origin = app.getBoundingClientRect()
    const shifted = (w: Word, by: number): Word => ({ ...w, at: { ...w.at, x: w.at.x - by } })
    const sw: Word[] = []
    let ok = true
    for (const s of sources) {
      const w = words(s, origin)
      if (!w) { ok = false; break }
      sw.push(...w.map((x) => shifted(x, src)))
    }
    const tw = ok ? words(target, origin)?.map((x) => shifted(x, dst)) : null
    if (!tw) return { layer: null, movers: [], fade: { sources, target }, hidden: [] }

    const layer = document.createElement('div')
    layer.className = 'step-morph'
    layer.setAttribute('aria-hidden', 'true')
    app.append(layer)
    const lo = layer.getBoundingClientRect()
    const dx = origin.left - lo.left
    const dy = origin.top - lo.top
    const local = (l: Look): Look => ({ ...l, x: l.x + dx, y: l.y + dy })
    const movers: Mover[] = []
    for (const [i, j] of pairWords(sw.map((w) => w.text), tw.map((w) => w.text))) {
      const from = i === null ? null : sw[i]
      const to = j === null ? null : tw[j]
      const any = (to ?? from)!
      const el = document.createElement('span')
      el.textContent = any.text
      el.style.fontFamily = any.family
      layer.append(el)
      const a = from && local(from.at)
      const b = to && local(to.at)
      const offA = glyphOffset(el, a ?? b!)
      const offB = glyphOffset(el, b ?? a!)
      movers.push({ el, a, b, offA, offB })
    }
    const hidden = [...sources, target]
    for (const el of hidden) el.style.visibility = 'hidden'
    return { layer, movers, fade: null, hidden }
  }

  private apply(p: number) {
    const r = this.run
    if (!r) return
    const { src, dst } = this.shift
    if (r.fade) {
      for (const s of r.fade.sources) s.style.opacity = `${1 - clamp01(p * 1.5)}`
      r.fade.target.style.opacity = `${clamp01(p * 1.5 - 0.5)}`
      return
    }
    const t = ease(clamp01(p))
    for (const { el, a, b, offA, offB } of r.movers) {
      // Each end rides with its own page; a word only one side has stays with that side and fades.
      const A = a && { ...a, x: a.x + src }
      const B = b && { ...b, x: b.x + dst }
      const k = A && B ? t : B ? 1 : 0
      const from = A ?? B!
      const to = B ?? A!
      const look = {
        size: lerp(from.size, to.size, k),
        weight: lerp(from.weight, to.weight, k),
        color: from.color.map((v, i) => lerp(v, to.color[i], k)),
      }
      setLook(el, look)
      const ox = lerp(offA[0], offB[0], k)
      const oy = lerp(offA[1], offB[1], k)
      el.style.transform = `translate(${lerp(from.x, to.x, k) - ox}px, ${lerp(from.y, to.y, k) - oy}px)`
      el.style.opacity = A && B ? '1' : B ? `${clamp01((p - 0.66) / 0.34)}` : `${1 - clamp01(p / 0.34)}`
    }
  }

  /** Drop the layer and every inline style it set. */
  end() {
    this.stopAuto?.()
    this.stopAuto = null
    const done = this.autoDone
    this.autoDone = null
    const r = this.run
    this.run = null
    this.failed = false
    this.mode = null
    if (r) {
      r.layer?.remove()
      for (const el of r.hidden) el.style.visibility = ''
      if (r.fade) for (const el of [...r.fade.sources, r.fade.target]) el.style.opacity = ''
    }
    done?.()
  }

  /** Step 2 opened by the main button: the page slides in over the sheet as a swipe would, and the words travel. */
  enter(page: HTMLElement | null, sheet: HTMLElement | null, ends: () => Ends | null) {
    if (!page || !sheet || reducedMotion()) return
    for (const a of page.getAnimations()) if (a instanceof CSSAnimation && a.animationName.startsWith('ps-slide-in')) a.finish()
    const w = page.getBoundingClientRect().width || window.innerWidth
    sheet.style.visibility = 'visible' // CSS hides it under an open page after 300 ms
    this.play(0, 1, ends, (p) => {
      page.style.transform = p === 1 ? '' : `translateX(${(1 - p) * w}px)`
      sheet.style.transform = p === 0 ? '' : `translateX(${-p * w}px)`
      return { src: -p * w, dst: (1 - p) * w }
    }, () => {
      page.style.transform = ''
      sheet.style.transform = ''
      sheet.style.visibility = ''
    })
  }

  /** Back from step 2 to step 1, not by a swipe: a still copy of the page slides away and the words travel back. */
  leave(page: HTMLElement | null, ends: (ghost: HTMLElement) => () => Ends | null) {
    const app = page?.parentElement
    if (!page || !app || this.mode === 'gesture' || reducedMotion()) return
    this.end()
    const ghost = page.cloneNode(true) as HTMLElement
    // A copy keeps attributes, not what was typed: carry the fields' values over.
    const fields = 'input, textarea, select'
    const live = page.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fields)
    ghost.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fields).forEach((f, i) => {
      if (live[i] && f.type !== 'file') f.value = live[i].value
    })
    for (const el of [ghost, ...ghost.querySelectorAll('[id]')]) el.removeAttribute('id')
    ghost.className = 'page-ghost'
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    app.append(ghost)
    ghost.scrollTop = page.scrollTop
    const w = page.getBoundingClientRect().width || window.innerWidth
    this.play(1, 0, ends(ghost), (p) => {
      ghost.style.transform = `translateX(${(1 - p) * w}px)`
      return { src: 0, dst: (1 - p) * w }
    }, () => ghost.remove())
  }

  /**
   * Plays the change without a finger: `pages(p)` moves the screens and returns their shifts.
   * `cleanup` puts the screens back once it ends (or is cut short by a touch or another change).
   */
  private play(from: 0 | 1, to: 0 | 1, ends: () => Ends | null, pages: (p: number) => { src: number; dst: number }, cleanup: () => void) {
    this.end()
    const frame = (p: number) => {
      const s = pages(p)
      this.track(p, s.src, s.dst, ends, 'auto')
    }
    frame(from)
    this.autoDone = cleanup
    this.stopAuto = spring(from, to, 0, frame, () => { this.stopAuto = null; this.end() })
  }
}

interface Refs {
  sheet: RefObject<HTMLElement | null>
  page: RefObject<HTMLElement | null>
  peekForward: RefObject<HTMLElement | null>
}

/** Step 1's summary → the context line inside `root` (step 2's page, its peeking header or a copy). */
const endsIn = (sheet: RefObject<HTMLElement | null>, root: HTMLElement | null | undefined) => (): Ends | null => {
  const t = root?.querySelector<HTMLElement>('.page-context')
  return t ? { sources: summarySources(sheet.current), target: t } : null
}

/**
 * Wires the morph to the phone's steps. Returns the swipe's `track` hooks for the current view
 * and `leave`, which Back calls before step 2 closes. Call it before useStepSwipe: its layout
 * effect must see a swipe's arrival before the swipe settles (and ends the morph).
 */
export function useStepMorph(enabled: boolean, view: string, canForward: boolean, { sheet, page, peekForward }: Refs) {
  const [morph] = useState(() => new StepMorph())

  // Step 2 opened from step 1 without a swipe (the main button).
  const prev = useRef(view)
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = view
    if (enabled && from === 'map' && view === 'report' && morph.mode !== 'gesture') morph.enter(page.current, sheet.current, endsIn(sheet, page.current))
  }, [view, enabled, morph, page, sheet])
  useLayoutEffect(() => () => morph.end(), [morph])

  const leave = () => { if (enabled) morph.leave(page.current, (ghost) => endsIn(sheet, ghost)) }

  // Always present while enabled, so the swipe that arrives here can end the morph it started.
  const track = enabled ? {
    move: (x: number, w: number) => {
      // Step 1: the sheet moves with the finger, step 2's header comes in from the right.
      if (view === 'map' && canForward && (x < 0 || morph.active)) morph.track(clamp01(-x / w), x, w + x, endsIn(sheet, peekForward.current))
      // Step 2: the page moves with the finger; step 1's sheet waits underneath.
      else if (view === 'report' && (x > 0 || morph.active)) morph.track(1 - clamp01(x / w), 0, x, endsIn(sheet, page.current))
    },
    end: () => morph.end(),
    interrupt: () => { if (morph.mode === 'auto') morph.end() },
  } : undefined

  return { track, leave }
}
