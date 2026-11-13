import { describe, expect, it } from 'vitest'
import { dateLabel, exportFileName, parseLocalTime, summaryDate, toSummary } from './summary'
import type { StoredReport } from './types'

const now = new Date(2026, 10, 12, 10, 0)

const report: StoredReport = {
  id: 'a', createdAt: 1, updatedAt: 2, status: 'draft', handedAt: null, pin: null, address: 'X utca 1.',
  addressEdited: false, recipientId: null, recipientName: 'BKK', districtRoman: null,
  form: { plate: 'ABC-123', violationId: 'jarda', customText: '', time: '2026-11-12T08:42', vehicle: '', note: '' },
  timeSource: 'user',
  photos: [{ name: 'a.jpg', type: 'image/jpeg', blob: new Blob(['x']) }],
}

describe('dateLabel', () => {
  it('today, yesterday, this year, other year', () => {
    expect(dateLabel(new Date(2026, 10, 12, 8, 42), now)).toBe('Ma 08:42')
    expect(dateLabel(new Date(2026, 10, 11, 17, 10), now)).toBe('Tegnap 17:10')
    expect(dateLabel(new Date(2026, 10, 8, 12, 5), now)).toBe('nov. 8. 12:05')
    expect(dateLabel(new Date(2025, 10, 8, 12, 5), now)).toBe('2025. nov. 8. 12:05')
  })
})

describe('summary helpers', () => {
  it('builds a summary without blobs', () => {
    const s = toSummary(report)
    expect(s).toMatchObject({ id: 'a', plate: 'ABC-123', violationId: 'jarda', photoCount: 1, time: '2026-11-12T08:42' })
    expect('photos' in s).toBe(false)
  })
  it('uses the observation time, else updatedAt', () => {
    expect(summaryDate(toSummary(report), now)).toBe('Ma 08:42')
    const s = { ...toSummary(report), time: '', updatedAt: new Date(2026, 10, 11, 17, 10).getTime() }
    expect(summaryDate(s, now)).toBe('Tegnap 17:10')
  })
  it('parses local times strictly', () => {
    expect(parseLocalTime('')).toBeNull()
    expect(parseLocalTime('2026-11-12T08:42')?.getHours()).toBe(8)
  })
  it('names the export file', () => {
    expect(exportFileName(new Date(2026, 10, 12))).toBe('parkstop-export-2026-11-12.json')
  })
})
