import { describe, expect, it } from 'vitest'
import {
  decide, FILL_THRESHOLD, formatRead, judgePlate, optionWithValue, reconcileField,
  type FieldSituation, type Outcome, type PhotoRead, type ReadPlate,
} from './decide'

const hu = (text: string, minConf = 0.99): ReadPlate => ({ text, minConf, region: 'Hungary' })
const de = (text: string, minConf = 0.99): ReadPlate => ({ text, minConf, region: 'Germany' })
const done = (...plates: ReadPlate[]): PhotoRead<ReadPlate> => ({ status: 'done', plates })
const photo = (id: string, read: PhotoRead<ReadPlate> | undefined) => ({ id, read })

describe('judgePlate', () => {
  it('suggests a confident Hungarian read in the old and new formats', () => {
    expect(judgePlate(hu('ABC123'))).toEqual({ verdict: 'ok', value: 'ABC-123' })
    expect(judgePlate(hu('AIFD684'))).toEqual({ verdict: 'ok', value: 'AI FD-684' })
  })
  it('uses ≥ 0.90 on the least certain character (F-PLATE-4)', () => {
    expect(judgePlate(hu('ABC123', FILL_THRESHOLD)).verdict).toBe('ok')
    expect(judgePlate(hu('ABC123', 0.8999)).verdict).toBe('low')
    expect(judgePlate(hu('ABC123', Number.NaN)).verdict).toBe('low')
  })
  it('never fills a Hungarian read that fits no Hungarian format, however certain (F-PLATE-8)', () => {
    expect(judgePlate(hu('DRVA02', 0.9998))).toEqual({ verdict: 'incomplete', value: null })
    expect(judgePlate(hu('ABC12'))).toEqual({ verdict: 'incomplete', value: null })
  })
  it('passes foreign plates through unchanged, even when they look Hungarian (L3)', () => {
    expect(judgePlate(de('BMW1234'))).toEqual({ verdict: 'ok', value: 'BMW1234' })
    expect(judgePlate(de('ABC123'))).toEqual({ verdict: 'ok', value: 'ABC123' })
    expect(judgePlate({ text: 'ABCD123', minConf: 0.95, region: 'Austria' })).toEqual({ verdict: 'ok', value: 'ABCD123' })
    expect(judgePlate({ text: 'GT1234AB', minConf: 0.95, region: 'Netherlands' })).toEqual({ verdict: 'ok', value: 'GT1234AB' })
    expect(judgePlate({ text: 'W12345A', minConf: 0.95, region: null })).toEqual({ verdict: 'ok', value: 'W12345A' })
  })
  it('adds Hungarian separators for Hungary or a missing region label', () => {
    expect(judgePlate({ text: 'ABC123', minConf: 0.95, region: null }).value).toBe('ABC-123')
    expect(judgePlate(hu('AIFD684')).value).toBe('AI FD-684')
  })
  it('treats an empty read as unclear', () => {
    expect(judgePlate(hu('')).verdict).toBe('low')
  })
})

describe('formatRead (F-PLATE-5)', () => {
  it('only adds separators, never changes characters', () => {
    for (const t of ['ABC123', 'AIFD684', 'BMW1234', 'O0O0O0', '1TUR985', 'DRVA02']) {
      for (const region of ['Hungary', 'Germany', null]) expect(formatRead(t, region).replace(/[\s-]/g, '')).toBe(t)
    }
    expect(formatRead('O0O123', 'Hungary')).toBe('O0O123') // "O" is not corrected to "0" or back
    expect(formatRead('ABC123', 'Germany')).toBe('ABC123')
  })
})

describe('decide', () => {
  it('is none without photos and working while a photo is being read', () => {
    expect(decide([])).toEqual({ kind: 'none' })
    expect(decide([photo('p1', done(hu('ABC123'))), photo('p2', { status: 'pending' })]).kind).toBe('working')
    expect(decide([photo('p1', undefined)]).kind).toBe('working')
  })

  it('suggests one plate, de-duplicated across photos', () => {
    const o = decide([photo('p1', done(hu('ABC123'))), photo('p2', done(hu('ABC123', 0.95))), photo('p3', done())])
    expect(o.kind).toBe('suggest')
    if (o.kind === 'suggest') expect(o.option).toMatchObject({ key: 'p1#0', photoIndex: 0, value: 'ABC-123' })
  })

  it('asks when an unclear read on another photo may be a different car (L1)', () => {
    const o = decide([photo('p1', done(hu('XYZ128', 0.5))), photo('p2', done(hu('ABC123')))])
    expect(o.kind).toBe('pick')
    if (o.kind === 'pick') expect(o.options.map((x) => [x.key, x.verdict])).toEqual([['p2#0', 'ok'], ['p1#0', 'low']])
  })
  it('keeps the suggestion when the unclear read has the same characters', () => {
    const o = decide([photo('p1', done(hu('ABC123', 0.5))), photo('p2', done(hu('ABC123')))])
    expect(o.kind).toBe('suggest')
  })

  it('asks the user to pick when the photos show different plates', () => {
    const o = decide([photo('p1', done(hu('ABC123'))), photo('p2', done(hu('XYZ987')))])
    expect(o.kind).toBe('pick')
    if (o.kind === 'pick') expect(o.options.map((x) => x.value)).toEqual(['ABC-123', 'XYZ-987'])
  })

  it('never picks on its own when one photo shows several plates (F-PLATE-2)', () => {
    const o = decide([photo('p1', done(hu('SEM629'), hu('PJZ07', 0.4)))])
    expect(o.kind).toBe('pick')
    if (o.kind === 'pick') {
      expect(o.options.map((x) => [x.key, x.verdict, x.value])).toEqual([
        ['p1#0', 'ok', 'SEM-629'],
        ['p1#1', 'low', null],
      ])
    }
  })

  it('falls back to manual entry with the crops when nothing is certain', () => {
    const o = decide([photo('p1', done(hu('1TUR955', 0.6)))])
    expect(o).toMatchObject({ kind: 'manual', incomplete: false })
    if (o.kind === 'manual') expect(o.options).toHaveLength(1)
  })

  it('flags a cut-off Hungarian read as incomplete', () => {
    expect(decide([photo('p1', done(hu('DRVA02', 0.9998)))])).toMatchObject({ kind: 'manual', incomplete: true })
  })

  it('shows the zoomable photo when no plate was found or the read failed', () => {
    expect(decide([photo('p1', done()), photo('p2', { status: 'failed' })])).toEqual({ kind: 'manual', options: [], incomplete: false })
  })

  it('forgets a removed photo', () => {
    const both = [photo('p1', done(hu('ABC123'))), photo('p2', done(hu('XYZ987')))]
    expect(decide(both).kind).toBe('pick')
    expect(decide(both.slice(1))).toMatchObject({ kind: 'suggest', option: { key: 'p2#0' } })
  })
})

describe('optionWithValue', () => {
  it('matches ignoring separators', () => {
    const o = decide([photo('p1', done(hu('ABC123'))), photo('p2', done(hu('XYZ987')))])
    expect(optionWithValue(o, 'xyz 987')?.key).toBe('p2#0')
    expect(optionWithValue(o, 'ABC124')).toBeNull()
    expect(optionWithValue(o, '')).toBeNull()
  })
})

describe('reconcileField', () => {
  const suggest = decide([photo('p1', done(hu('ABC123')))])
  const pick = decide([photo('p1', done(hu('ABC123'))), photo('p2', done(hu('XYZ987')))])
  const base: FieldSituation<ReadPlate> = { plate: '', source: 'user', outcome: suggest, readerOn: true, readerFailed: false }

  it('fills an empty field with a single suggestion', () => {
    expect(reconcileField(base)).toEqual({ type: 'fill', value: 'ABC-123', key: 'p1#0' })
  })
  it('never overwrites what the user typed', () => {
    expect(reconcileField({ ...base, plate: 'ABC-128', typed: true })).toEqual({ type: 'none' })
  })
  it('typed during the download, read arrives, field emptied: stays empty (M2)', () => {
    // 1. The user types while the models download: the outcome is still "working".
    let field: FieldSituation<ReadPlate> = { ...base, plate: 'AB', typed: true, outcome: { kind: 'working' } }
    expect(reconcileField(field)).toEqual({ type: 'none' })
    // 2. The read arrives: the typed value stays.
    field = { ...field, outcome: suggest }
    expect(reconcileField(field)).toEqual({ type: 'none' })
    // 3. The user clears the field: it stays empty.
    field = { ...field, plate: '' }
    expect(reconcileField(field)).toEqual({ type: 'none' })
  })
  it('does nothing to a confirmed value, whatever new photos show', () => {
    expect(reconcileField({ ...base, plate: 'ABC-123', source: 'confirmed', outcome: pick })).toEqual({ type: 'none' })
    expect(reconcileField({ ...base, plate: 'ABC-123', source: 'confirmed', readerOn: false })).toEqual({ type: 'none' })
  })
  it('does not fill when off, failed, working or several plates', () => {
    expect(reconcileField({ ...base, readerOn: false })).toEqual({ type: 'none' })
    expect(reconcileField({ ...base, readerFailed: true })).toEqual({ type: 'none' })
    expect(reconcileField({ ...base, outcome: { kind: 'working' } })).toEqual({ type: 'none' })
    expect(reconcileField({ ...base, outcome: pick })).toEqual({ type: 'none' })
  })

  const filled: FieldSituation<ReadPlate> = { ...base, plate: 'ABC-123', source: 'reader', via: 'auto' }
  it('keeps an unconfirmed suggestion while it still stands', () => {
    expect(reconcileField(filled)).toEqual({ type: 'none' })
    expect(reconcileField({ ...filled, outcome: { kind: 'working' } })).toEqual({ type: 'none' })
  })
  it('withdraws it when its photo is removed', () => {
    const none: Outcome<ReadPlate> = { kind: 'none' }
    expect(reconcileField({ ...filled, outcome: none })).toEqual({ type: 'clear' })
    expect(reconcileField({ ...filled, outcome: decide([photo('p2', done(hu('XYZ987')))]) })).toEqual({ type: 'clear' })
  })
  it('withdraws an automatic suggestion when several plates compete, but keeps a picked one', () => {
    expect(reconcileField({ ...filled, outcome: pick })).toEqual({ type: 'clear' })
    expect(reconcileField({ ...filled, outcome: pick, via: 'pick' })).toEqual({ type: 'none' })
    // A draft saved before "via" existed is treated as automatic.
    expect(reconcileField({ ...filled, outcome: pick, via: undefined })).toEqual({ type: 'clear' })
  })
  it('withdraws it when the reader is switched off', () => {
    expect(reconcileField({ ...filled, readerOn: false })).toEqual({ type: 'clear' })
  })
})
