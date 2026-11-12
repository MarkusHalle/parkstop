import { describe, expect, it } from 'vitest'
import { compactPlate, HU_PLATE_FORMATS, hungarianFormat, normalizePlate, plateWhileTyping } from './plate'
import { parseLocalDateTime, toLocalDateTime, validateReport, type ReportFields } from './validate'

describe('normalizePlate', () => {
  it.each([
    ['abc123', 'ABC-123', 'old'],
    [' abc-123 ', 'ABC-123', 'old'],
    ['ABC 123', 'ABC-123', 'old'],
    ['aabb123', 'AA BB-123', 'new'],
    ['AA BB 123', 'AA BB-123', 'new'],
    ['aa bb-123', 'AA BB-123', 'new'],
    ['ABCD-123', 'ABCD-123', 'new'],
    ['b  mw  1234', 'B MW 1234', 'unusual'],
    ['CD 12-34', 'CD 12-34', 'unusual'],
    ['', '', 'empty'],
    ['   ', '', 'empty'],
  ])('%s → %s (%s)', (raw, value, format) => {
    expect(normalizePlate(raw)).toEqual({ value, format })
  })

  it('has one test per Hungarian format in the table (F-PLATE-8)', () => {
    expect(HU_PLATE_FORMATS.map((f) => f.id)).toEqual(['old', 'new', 'oldtimer'])
    expect(hungarianFormat('ABC123')?.id).toBe('old')
    expect(hungarianFormat('AIFD684')?.id).toBe('new')
    expect(hungarianFormat('OT6440')?.id).toBe('oldtimer')
    expect(normalizePlate('ot6440').value).toBe('OT 64-40')
    expect(hungarianFormat('OT644')).toBeNull()
    expect(hungarianFormat('DRVA02')).toBeNull()
    expect(hungarianFormat('ABC1234')).toBeNull()
  })

  it('compacts plates for comparison', () => {
    expect(compactPlate('aa bb-123')).toBe('AABB123')
    expect(compactPlate('B.MW 1234')).toBe('BMW1234')
  })

  it('only upper-cases while typing', () => {
    expect(plateWhileTyping('aa b')).toBe('AA B')
  })
})

describe('local date-time helpers', () => {
  it('round-trips', () => {
    const d = new Date(2026, 10, 11, 8, 42)
    expect(toLocalDateTime(d)).toBe('2026-11-11T08:42')
    expect(parseLocalDateTime('2026-11-11T08:42')?.getTime()).toBe(d.getTime())
  })
  it('rejects malformed and impossible dates', () => {
    expect(parseLocalDateTime('')).toBeNull()
    expect(parseLocalDateTime('2026-02-30T10:00')).toBeNull()
    expect(parseLocalDateTime('2026-11-11T24:00')).toBeNull()
  })
})

describe('validateReport', () => {
  const now = new Date(2026, 10, 12, 12, 0)
  const ok: ReportFields = {
    photoCount: 1,
    plate: 'ABC-123',
    violationId: 'jarda',
    customText: '',
    time: '2026-11-12T11:30',
    address: 'Pannónia utca 14.',
  }

  it('accepts a complete report', () => {
    expect(validateReport(ok, now)).toEqual([])
  })
  it('lists every missing required field', () => {
    expect(validateReport({ ...ok, photoCount: 0, plate: ' ', violationId: '', time: '', address: '' }, now)).toEqual([
      'address', 'photos', 'plate', 'violation', 'time',
    ])
  })
  it('needs a reader suggestion to be confirmed or edited (F-PLATE-3)', () => {
    expect(validateReport({ ...ok, plateSource: 'reader' }, now)).toEqual(['plateUnconfirmed'])
    expect(validateReport({ ...ok, plateSource: 'confirmed' }, now)).toEqual([])
    expect(validateReport({ ...ok, plateSource: 'user' }, now)).toEqual([])
    expect(validateReport({ ...ok, plate: '', plateSource: 'reader' }, now)).toEqual(['plate'])
  })
  it('needs a description for "Egyéb"', () => {
    expect(validateReport({ ...ok, violationId: 'egyeb' }, now)).toEqual(['custom'])
    expect(validateReport({ ...ok, violationId: 'egyeb', customText: 'kerékpártároló előtt' }, now)).toEqual([])
  })
  it('rejects a time in the future beyond a few minutes', () => {
    expect(validateReport({ ...ok, time: '2026-11-12T12:04' }, now)).toEqual([])
    expect(validateReport({ ...ok, time: '2026-11-12T12:30' }, now)).toEqual(['timeFuture'])
  })
})
