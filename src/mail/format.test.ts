import { describe, expect, it } from 'vitest'
import { daySuffix, formatCoord, formatHuDate, formatHuTime } from './format'

describe('daySuffix', () => {
  // Spoken ordinals: elsején, másodikán, harmadikán, negyedikén, ötödikén, hatodikán,
  // hetedikén, nyolcadikán, kilencedikén, tizedikén, tizenegyedikén, tizenkettedikén, …
  const expected: Record<number, string> = {
    1: 'jén', 2: 'án', 3: 'án', 4: 'én', 5: 'én', 6: 'án', 7: 'én', 8: 'án', 9: 'én', 10: 'én',
    11: 'én', 12: 'én', 13: 'án', 14: 'én', 15: 'én', 16: 'án', 17: 'én', 18: 'án', 19: 'én', 20: 'án',
    21: 'én', 22: 'én', 23: 'án', 24: 'én', 25: 'én', 26: 'án', 27: 'én', 28: 'án', 29: 'én', 30: 'án',
    31: 'én',
  }
  for (let d = 1; d <= 31; d++) {
    it(`day ${d} → -${expected[d]}`, () => expect(daySuffix(d)).toBe(expected[d]))
  }
})

describe('formatHuDate', () => {
  const months = [
    'január', 'február', 'március', 'április', 'május', 'június',
    'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
  ]
  months.forEach((m, i) => {
    it(`month ${i + 1}`, () => expect(formatHuDate(new Date(2026, i, 5, 12, 0))).toBe(`2026. ${m} 5-én`))
  })
  it('examples', () => {
    expect(formatHuDate(new Date(2026, 10, 11, 8, 42))).toBe('2026. november 11-én')
    expect(formatHuDate(new Date(2026, 0, 1, 0, 0))).toBe('2026. január 1-jén')
    expect(formatHuDate(new Date(2026, 2, 3, 23, 59))).toBe('2026. március 3-án')
    expect(formatHuDate(new Date(2026, 11, 31, 23, 59))).toBe('2026. december 31-én')
  })
})

describe('formatHuTime', () => {
  it('pads hours and minutes', () => {
    expect(formatHuTime(new Date(2026, 10, 11, 8, 42))).toBe('08:42')
    expect(formatHuTime(new Date(2026, 10, 11, 0, 5))).toBe('00:05')
    expect(formatHuTime(new Date(2026, 10, 11, 23, 0))).toBe('23:00')
  })
})

describe('formatCoord', () => {
  it('six decimals with a dot', () => {
    expect(formatCoord(47.5188)).toBe('47.518800')
    expect(formatCoord(19.05171234)).toBe('19.051712')
    expect(formatCoord(19)).toBe('19.000000')
  })
})
