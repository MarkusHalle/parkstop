// Pure helpers for the history list (no IndexedDB, no UI): summary building and date labels.
import { hu } from '../i18n/hu'
import type { ReportSummary, StoredReport } from './types'

export function toSummary(r: StoredReport): ReportSummary {
  return {
    id: r.id,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    status: r.status,
    handedAt: r.handedAt,
    plate: r.form.plate,
    address: r.address,
    violationId: r.form.violationId,
    customText: r.form.customText,
    recipientName: r.recipientName,
    time: r.form.time,
    photoCount: r.photos.length,
  }
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** Parses "YYYY-MM-DDTHH:mm" as local time; null when it is not that shape. */
export function parseLocalTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  return Number.isNaN(d.getTime()) ? null : d
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Ma 08:42", "Tegnap 17:10", "nov. 8. 12:05", or "2025. nov. 8. 12:05" for other years. */
export function dateLabel(d: Date, now: Date): string {
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (days === 0) return `${hu.history.today} ${hm}`
  if (days === 1) return `${hu.history.yesterday} ${hm}`
  const md = `${hu.history.monthsShort[d.getMonth()]} ${d.getDate()}.`
  return d.getFullYear() === now.getFullYear() ? `${md} ${hm}` : `${d.getFullYear()}. ${md} ${hm}`
}

/** The row's date: the observation time, falling back to updatedAt. */
export function summaryDate(s: ReportSummary, now: Date): string {
  return dateLabel(parseLocalTime(s.time) ?? new Date(s.updatedAt), now)
}

/** "parkstop-export-2026-11-12.json" */
export function exportFileName(now: Date): string {
  return `parkstop-export-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}.json`
}
