import { describe, expect, it } from 'vitest'
import { chooseRead, consensusRead, plausible } from './consensus'
import { judgePlate } from './decide'
import { DEFAULT_MARGIN_INDEX as D } from './pipeline'

// Reads at the five CROP_MARGINS widths, taken from the owner's test photos (2026-11-12).
const r = (text: string, minConf: number, region: string | null = 'Hungary') => ({ text, minConf, region })

describe('chooseRead / consensusRead (F-PLATE-9, D38)', () => {
  it('DR VA-023: tight crops cut the last digit, two wider crops agree on the full plate', () => {
    const reads = [r('DRVA02', 1), r('DRVA02', 1), r('DRVA023', 0.348), r('DRVA023', 0.998), r('DRVA023', 1)]
    const c = chooseRead(reads, D)
    expect(c.agreed).toBe(true)
    expect(reads[c.index].text).toBe('DRVA023')
    expect(judgePlate(consensusRead(reads, D)!)).toEqual({ verdict: 'ok', value: 'DR VA-023' })
  })
  it('half-covered plate: one confident wide read alone is never filled', () => {
    const reads = [r('ST636', 0.185, 'Latvia'), r('SF666', 0.114, 'Latvia'), r('S636', 0.698, 'Latvia'), r('S636', 0.973, 'Latvia'), r('S6666', 0.521, 'Latvia')]
    expect(chooseRead(reads, D).agreed).toBe(false)
    expect(judgePlate(consensusRead(reads, D)!).verdict).toBe('low')
  })
  it('KEL-185: the wide crops misread at low confidence, the agreeing narrow ones win', () => {
    const reads = [r('KEL185', 0.986), r('KEL185', 0.942), r('KEL185', 0.945), r('KEL186', 0.639), r('KEL165', 0.551)]
    expect(consensusRead(reads, D)!.text).toBe('KEL185')
    expect(chooseRead(reads, D)).toEqual({ index: D, agreed: true })
  })
  it('two different confident reads disagree: nothing is filled', () => {
    const reads = [r('ABC123', 0.99), r('ABC123', 0.99), r('ABC128', 0.99), null, null]
    expect(chooseRead(reads, D).agreed).toBe(false)
    expect(judgePlate(consensusRead(reads, D)!).verdict).toBe('low')
  })
  it('a single confident read is not enough', () => {
    const reads = [null, null, r('ABC123', 0.999), r('ABC12', 0.5), null]
    expect(chooseRead(reads, D).agreed).toBe(false)
  })
  it('keeps a Hungarian read that fails the format so the field can say "Nem teljes a rendszám?"', () => {
    const reads = [r('DRVA02', 1), r('DRVA02', 1), r('DRVA02', 1), r('DRVA02', 1), r('DRVA02', 1)]
    expect(judgePlate(consensusRead(reads, D)!).verdict).toBe('incomplete')
  })
  it('foreign plates agree without the Hungarian format check', () => {
    const reads = [r('1TUR955', 0.498, 'Belgium'), r('1TUR985', 0.999, 'Belgium'), r('1TUR985', 0.999, 'Belgium'), r('1TUR985', 0.999, 'Belgium'), r('1TUR985', 0.998, 'Belgium')]
    expect(consensusRead(reads, D)!.text).toBe('1TUR985')
  })
  it('veteran plates (OT 64-40) are a Hungarian format', () => {
    expect(plausible(r('OT6440', 1))).toBe(true)
    expect(judgePlate(r('OT6440', 1)).value).toBe('OT 64-40')
  })
  it('zoomed finds must be Hungarian: a half-hidden plate read as Finnish "SAM7" is not offered (D39)', () => {
    const reads = [r('SAM7', 1, 'Finland'), r('SAM7', 1, 'Finland'), r('SAM7', 0.99, 'Finland'), r('SAM7', 0.93, 'Finland'), r('SAM7', 0.93, 'Finland')]
    expect(chooseRead(reads, D).agreed).toBe(true) // the normal rule would accept it
    expect(chooseRead(reads, D, true).agreed).toBe(false)
    expect(judgePlate(consensusRead(reads, D, true)!).verdict).toBe('low')
    const paw = [r('PAW132', 1), r('PAW132', 1), r('PAW132', 1), r('PAW132', 1), r('PAW132', 1)]
    expect(judgePlate(consensusRead(paw, D, true)!).value).toBe('PAW-132')
  })
  it('falls back to the first crop that exists when the default one could not be made', () => {
    expect(chooseRead([null, r('X', 0.2), null, null, null], D)).toEqual({ index: 1, agreed: false })
    expect(consensusRead([null, null, null, null, null], D)).toBeNull()
  })
})
