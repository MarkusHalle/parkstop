// Pure helpers for the map pin: keyboard nudging and the map attribution.

const STEP = 8
const BIG_STEP = 40

/** Pixel offset for an arrow key (Shift = bigger step), or null for any other key. */
export function nudgeOffset(key: string, shift: boolean): { dx: number; dy: number } | null {
  const s = shift ? BIG_STEP : STEP
  switch (key) {
    case 'ArrowLeft': return { dx: -s, dy: 0 }
    case 'ArrowRight': return { dx: s, dy: 0 }
    case 'ArrowUp': return { dx: 0, dy: -s }
    case 'ArrowDown': return { dx: 0, dy: s }
    default: return null
  }
}

interface StyleLike {
  sources?: Record<string, { type?: string; attribution?: string }>
}

/** Replaces the English attribution of the OpenFreeMap vector source with `html`. */
export function withAttribution<T extends StyleLike>(style: T, html: string): T {
  const sources = style.sources
  if (!sources) return style
  const next: NonNullable<StyleLike['sources']> = {}
  for (const [id, src] of Object.entries(sources)) {
    next[id] = src.type === 'vector' ? { ...src, attribution: html } : src
  }
  return { ...style, sources: next }
}
