// IndexedDB storage for reports and photos (SPEC 4.7). Everything stays on this device.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { emptyForm } from '../report/ReportForm'
import { exportFileName, toSummary } from './summary'
import type { ReportSummary, StoredReport } from './types'

interface Schema extends DBSchema {
  reports: { key: string; value: StoredReport; indexes: { updatedAt: number } }
}

export { exportFileName }

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'))
    dbPromise = openDB<Schema>('parkstop', 1, {
      upgrade(d) {
        const store = d.createObjectStore('reports', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      },
    }).catch((e: unknown) => {
      dbPromise = null
      throw e
    })
  }
  return dbPromise
}

export function newReportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function saveReport(r: StoredReport): Promise<void> {
  await (await db()).put('reports', r)
}

export async function getReport(id: string): Promise<StoredReport | undefined> {
  return (await db()).get('reports', id)
}

export async function listReports(): Promise<ReportSummary[]> {
  const all = await (await db()).getAll('reports')
  return all.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteReport(id: string): Promise<void> {
  await (await db()).delete('reports', id)
}

export async function deleteAllReports(): Promise<void> {
  await (await db()).clear('reports')
}

/** New draft for a new incident at the same place/car: photos and time start empty. */
export async function duplicateReport(id: string): Promise<StoredReport> {
  const src = await getReport(id)
  if (!src) throw new Error('Report not found')
  const now = Date.now()
  const copy: StoredReport = {
    id: newReportId(),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    handedAt: null,
    pin: src.pin ? { ...src.pin } : null,
    address: src.address,
    addressEdited: src.addressEdited,
    recipientId: src.recipientId,
    recipientName: src.recipientName,
    districtRoman: src.districtRoman,
    // The copy has no photos, so its plate is the user's own value (nothing to confirm against).
    form: { ...emptyForm(), ...src.form, time: '', plateSource: 'user', plateVia: undefined },
    timeSource: 'none',
    photos: [],
  }
  await saveReport(copy)
  return copy
}

async function blobToDataUrl(blob: Blob, fallbackType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${blob.type || fallbackType || 'application/octet-stream'};base64,${btoa(bin)}`
}

export async function exportAll(extra: Record<string, unknown>): Promise<Blob> {
  const all = (await (await db()).getAll('reports')).sort((a, b) => b.updatedAt - a.updatedAt)
  const reports = []
  for (const r of all) {
    const photos = []
    for (const p of r.photos) photos.push({ name: p.name, type: p.type, dataUrl: await blobToDataUrl(p.blob, p.type) })
    reports.push({ ...r, photos })
  }
  const json = JSON.stringify({ app: 'ParkStop', exportedAt: new Date().toISOString(), version: 1, ...extra, reports }, null, 2)
  return new Blob([json], { type: 'application/json' })
}
