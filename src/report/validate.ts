// Report form validation (SPEC 4.3). Returns error codes; the UI shows hu.report.errors.

export interface ReportFields {
  photoCount: number
  plate: string
  violationId: string
  customText: string
  /** `<input type="datetime-local">` value, "YYYY-MM-DDTHH:mm" in local time. */
  time: string
  address: string
}

export type ReportError = 'photos' | 'plate' | 'violation' | 'custom' | 'time' | 'timeFuture' | 'address'

/** Field each error belongs to, in form order (for focusing the first one). */
export const ERROR_FIELD: Record<ReportError, string> = {
  address: 'address',
  photos: 'photos',
  plate: 'plate',
  violation: 'violation',
  custom: 'custom',
  time: 'time',
  timeFuture: 'time',
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

export function validateReport(f: ReportFields, now: Date): ReportError[] {
  const errors: ReportError[] = []
  if (f.address.trim() === '') errors.push('address')
  if (f.photoCount < 1) errors.push('photos')
  if (f.plate.trim() === '') errors.push('plate')
  if (f.violationId === '') errors.push('violation')
  else if (f.violationId === 'egyeb' && f.customText.trim() === '') errors.push('custom')
  const t = parseLocalDateTime(f.time)
  if (t === null) errors.push('time')
  else if (t.getTime() - now.getTime() > FUTURE_TOLERANCE_MS) errors.push('timeFuture')
  return errors
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs. */
export function toLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "YYYY-MM-DDTHH:mm" (local) → Date, or null when malformed or not a real date. */
export function parseLocalDateTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const date = new Date(y, mo - 1, d, h, mi)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null
  return date
}
