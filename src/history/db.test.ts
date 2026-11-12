import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteAllReports, deleteReport, duplicateReport, exportAll, getReport, listReports, newReportId, saveReport } from './db'
import type { StoredReport } from './types'

const make = (id: string, updatedAt: number, plate = 'ABC-123'): StoredReport => ({
  id, createdAt: updatedAt, updatedAt, status: 'handed', handedAt: updatedAt, pin: { lat: 47.5, lon: 19.04 },
  address: 'X utca 1.', addressEdited: true, recipientId: 'bkk', recipientName: 'BKK', districtRoman: 'XI.',
  form: { plate, violationId: 'jarda', customText: '', time: '2026-11-12T08:42', vehicle: 'piros', note: 'n' },
  timeSource: 'photo',
  photos: [{ name: 'a.jpg', type: 'image/jpeg', blob: new Blob(['hello'], { type: 'image/jpeg' }) }],
})

beforeEach(async () => {
  await deleteAllReports()
})

describe('history db', () => {
  it('saves, gets and lists newest first without blobs', async () => {
    await saveReport(make('a', 100))
    await saveReport(make('b', 300))
    await saveReport(make('c', 200))
    expect((await listReports()).map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect('photos' in (await listReports())[0]).toBe(false)
    expect((await getReport('a'))?.form.plate).toBe('ABC-123')
    expect(await getReport('zz')).toBeUndefined()
  })

  it('deletes one and all', async () => {
    await saveReport(make('a', 1))
    await saveReport(make('b', 2))
    await deleteReport('a')
    expect((await listReports()).map((s) => s.id)).toEqual(['b'])
    await deleteAllReports()
    expect(await listReports()).toEqual([])
  })

  it('duplicates as a fresh draft without photos or time', async () => {
    await saveReport(make('a', 1))
    const d = await duplicateReport('a')
    expect(d.id).not.toBe('a')
    expect(d).toMatchObject({ status: 'draft', handedAt: null, timeSource: 'none', photos: [], address: 'X utca 1.', recipientName: 'BKK' })
    expect(d.form).toMatchObject({ plate: 'ABC-123', time: '', vehicle: 'piros' })
    expect(await getReport(d.id)).toBeDefined()
    await expect(duplicateReport('nope')).rejects.toThrow()
  })

  it('makes a duplicated reader suggestion the user\'s own value', async () => {
    const src = make('r', 1)
    src.form = { ...src.form, plateSource: 'reader', plateVia: 'pick' }
    await saveReport(src)
    const d = await duplicateReport('r')
    expect(d.form.plate).toBe('ABC-123')
    expect(d.form.plateSource).toBe('user')
    expect(d.form.plateVia).toBeUndefined()
  })

  it('generates ids', () => {
    expect(newReportId()).not.toBe(newReportId())
  })

  it('exports JSON with data-URL photos', async () => {
    await saveReport(make('a', 1))
    const blob = await exportAll({ extra: 1 })
    expect(blob.type).toBe('application/json')
    const json = JSON.parse(await blob.text())
    expect(json).toMatchObject({ app: 'ParkStop', version: 1, extra: 1 })
    expect(typeof json.exportedAt).toBe('string')
    expect(json.reports).toHaveLength(1)
    expect(json.reports[0].photos[0]).toEqual({ name: 'a.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,aGVsbG8=' })
  })
})
