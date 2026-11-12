// Hungarian date, time and coordinate formatting for the e-mail (SPEC 7). Pure.

import { hu } from '../i18n/hu'

/**
 * Hungarian superessive suffix of a day of the month, written after the digits
 * ("1-jén", "2-án", "12-én"). It follows the spoken ordinal:
 * elsején, másodikán, harmadikán, negyedikén, ötödikén, hatodikán, hetedikén,
 * nyolcadikán, kilencedikén, tizedikén, huszadikán, harmincadikán.
 * In compounds "-egyedikén" and "-kettedikén" take -én (11, 21, 31, 12, 22).
 */
export function daySuffix(day: number): string {
  if (day === 1) return 'jén'
  if (day === 20 || day === 30) return 'án'
  if (day === 10) return 'én'
  const last = day % 10
  if (last === 2) return day === 2 ? 'án' : 'én' // másodikán, but tizenkettedikén / huszonkettedikén
  if (last === 3 || last === 6 || last === 8) return 'án'
  return 'én' // 1 in compounds, 4, 5, 7, 9
}

/** "2026. november 11-én" (local time). */
export function formatHuDate(d: Date): string {
  const day = d.getDate()
  return `${d.getFullYear()}. ${hu.mailTemplate.months[d.getMonth()]} ${day}-${daySuffix(day)}`
}

/** "08:42" (local time); the template adds "-kor". */
export function formatHuTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Six decimals with a dot, e.g. "47.518800". */
export function formatCoord(n: number): string {
  return n.toFixed(6)
}
