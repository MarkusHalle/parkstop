// Number-plate formatting for the "Rendszám" field (SPEC 4.3). Fixed rules only: upper
// case, Hungarian formats hyphenated, anything else kept as typed with an "unusual" flag.
// The same table drives the plate reader's format check (SPEC 4.9 F-PLATE-8).

export type HungarianFormat = 'old' | 'new' | 'oldtimer'
export type PlateFormat = HungarianFormat | 'unusual' | 'empty'

/**
 * Where the field's value came from (SPEC 4.9 F-PLATE-3): 'user' typed it (or it is empty),
 * 'reader' suggested it and the user has not confirmed it yet, 'confirmed' by "Jó".
 */
export type PlateSource = 'user' | 'reader' | 'confirmed'

/** How a reader value got into the field: filled in automatically, or picked by the user. */
export type PlateVia = 'auto' | 'pick'

export interface PlateValue {
  value: string
  format: PlateFormat
}

interface FormatRule {
  id: HungarianFormat
  /** Matches the compact form: upper case, no spaces or hyphens. */
  pattern: RegExp
  /** Display form; only inserts separators. */
  display: (compact: string) => string
}

/**
 * Hungarian plate formats the app recognises. F-PLATE-8: other official formats are added
 * here as they are met (each one also needs a test in report.test.ts).
 */
export const HU_PLATE_FORMATS: readonly FormatRule[] = [
  // Ordinary plates until 2022: ABC-123.
  { id: 'old', pattern: /^[A-Z]{3}\d{3}$/, display: (c) => `${c.slice(0, 3)}-${c.slice(3)}` },
  // Ordinary plates since 2022: AA BB-123.
  { id: 'new', pattern: /^[A-Z]{4}\d{3}$/, display: (c) => `${c.slice(0, 2)} ${c.slice(2, 4)}-${c.slice(4)}` },
  // Veteran (oldtimer) plates: OT 64-40 (met in the owner's test photos, 2026-11-12).
  { id: 'oldtimer', pattern: /^OT\d{4}$/, display: (c) => `OT ${c.slice(2, 4)}-${c.slice(4)}` },
]

/** Upper case without spaces, hyphens and dots, for comparing plates. */
export function compactPlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-‐-―·.]/g, '')
}

/** The Hungarian format a compact plate matches, or null. */
export function hungarianFormat(compact: string): FormatRule | null {
  return HU_PLATE_FORMATS.find((f) => f.pattern.test(compact)) ?? null
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
  const rule = hungarianFormat(compact)
  if (!rule) return { value: upper, format: 'unusual' }
  if (rule.id === 'new' && /^[A-Z]{4}-\d{3}$/.test(upper)) return { value: upper, format: 'new' }
  return { value: rule.display(compact), format: rule.id }
}
