// Number-plate formatting for the "Rendszám" field (SPEC 4.3). Fixed rules only: upper
// case, Hungarian formats hyphenated, anything else kept as typed with an "unusual" flag.

export type PlateFormat = 'old' | 'new' | 'unusual' | 'empty'

export interface PlateValue {
  value: string
  format: PlateFormat
}

/** Upper-case while typing; keeps the user's spacing so the caret does not jump. */
export function plateWhileTyping(raw: string): string {
  return raw.toUpperCase()
}

/**
 * Final form, applied on blur: "abc123" → "ABC-123" (old format), "aabb123" or "AA BB 123"
 * → "AA BB-123" (format since 2022), "ABCD-123" typed with a hyphen stays "ABCD-123".
 * Anything else (foreign, diplomatic, custom plates) is upper-cased, spacing collapsed,
 * and flagged as unusual.
 */
export function normalizePlate(raw: string): PlateValue {
  const upper = raw.toUpperCase().trim().replace(/\s+/g, ' ')
  if (upper === '') return { value: '', format: 'empty' }
  const compact = upper.replace(/[\s-]/g, '')
  let m = /^([A-Z]{3})(\d{3})$/.exec(compact)
  if (m) return { value: `${m[1]}-${m[2]}`, format: 'old' }
  m = /^([A-Z]{2})([A-Z]{2})(\d{3})$/.exec(compact)
  if (m) {
    if (/^[A-Z]{4}-\d{3}$/.test(upper)) return { value: upper, format: 'new' }
    return { value: `${m[1]} ${m[2]}-${m[3]}`, format: 'new' }
  }
  return { value: upper, format: 'unusual' }
}
