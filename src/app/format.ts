// Small display formatters (numbers and dates only; words come from hu.ts).

/** "2026-11-12" → "2026. 11. 12." (Hungarian short date). */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : iso
}

/** Date → "2026. 11. 12. 08:42". */
export function shortDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const coord = (n: number) => n.toFixed(6)

/** "+36 1 301 7500" → "tel:+3613017500". */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
