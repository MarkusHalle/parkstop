import { describe, expect, it } from 'vitest'
import { firstTakenAt, timeFromExif } from './exif'

describe('timeFromExif', () => {
  it('prefers DateTimeOriginal, falls back to CreateDate', () => {
    const t = new Date(2026, 10, 11, 8, 42)
    expect(timeFromExif({ DateTimeOriginal: t, CreateDate: new Date(2020, 0, 1) })).toBe(t)
    expect(timeFromExif({ CreateDate: t })).toBe(t)
  })
  it('ignores missing and broken values', () => {
    expect(timeFromExif(undefined)).toBeNull()
    expect(timeFromExif({})).toBeNull()
    expect(timeFromExif({ DateTimeOriginal: new Date('x') })).toBeNull()
    expect(timeFromExif({ DateTimeOriginal: new Date(1980, 0, 1) })).toBeNull()
    expect(timeFromExif({ DateTimeOriginal: '2026:11:11 08:42:00' })).toBeNull()
  })
})

describe('firstTakenAt', () => {
  it('uses the first photo that has a time', () => {
    const t = new Date(2026, 10, 11, 8, 42)
    expect(firstTakenAt([null, t, new Date(2026, 10, 12)])).toBe(t)
    expect(firstTakenAt([])).toBeNull()
  })
})
