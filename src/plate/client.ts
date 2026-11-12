// Page side of the plate reader: one worker per page, started on demand, reads one photo at
// a time. F-PLATE-7: a device that cannot run it (no WebAssembly or module workers, the
// models fail to start after a verified download, out of memory, a worker that dies while
// reading) turns the reader off for this page, and the form falls back to manual entry
// without an error screen. Network trouble while downloading (or a stalled download) is
// retried when the next photo is added.
import { CACHE_PREFIX } from './files'
import { cropToBlob, decodeBitmap, decodeWithImg } from './image'
import type { Margin } from './pipeline'
import type { FromWorker, ReadOutput, ToWorker } from './protocol'

/** 'retry': the last download failed for a network reason; the next photo tries again. */
export type ReaderStatus = 'idle' | 'loading' | 'ready' | 'retry' | 'failed'

export interface ReaderSnapshot {
  status: ReaderStatus
  /** Network bytes while the models are downloaded for the first time; null otherwise. */
  progress: { loaded: number; total: number } | null
  /** For announcing the download once at its start and once at its end. */
  download: 'none' | 'running' | 'done'
}

/** An error after which a later attempt may succeed. */
export class ReaderRetryError extends Error {}

/** Without any message from the worker for this long while loading, give up for now. */
const LOAD_IDLE_TIMEOUT_MS = 60_000
/** One photo takes about 1 s on the owner's phone (D19); a worker that stays silent has died. */
const READ_TIMEOUT_MS = 30_000

let snapshot: ReaderSnapshot = { status: 'idle', progress: null, download: 'none' }
const listeners = new Set<() => void>()
let worker: Worker | null = null
let loadPromise: Promise<void> | null = null
let loadSettle: { resolve: () => void; reject: (e: Error) => void } | null = null
let loadWatchdog: ReturnType<typeof setTimeout> | undefined
let nextId = 1
let queue: Promise<unknown> = Promise.resolve()
const calls = new Map<number, { resolve: (m: FromWorker) => void; reject: (e: Error) => void }>()

function set(patch: Partial<ReaderSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
}

export function subscribeReader(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const getReaderSnapshot = (): ReaderSnapshot => snapshot

/** Stop the worker. retryable: the next startReader() starts afresh; else off for this page. */
function fail(message: string, retryable: boolean) {
  clearTimeout(loadWatchdog)
  worker?.terminate()
  worker = null
  loadPromise = null
  const err = retryable ? new ReaderRetryError(message) : new Error(message)
  loadSettle?.reject(err)
  loadSettle = null
  calls.forEach((c) => c.reject(err))
  calls.clear()
  set({
    status: retryable ? 'retry' : 'failed',
    progress: null,
    download: snapshot.download === 'running' ? 'none' : snapshot.download,
  })
}

function armLoadWatchdog() {
  clearTimeout(loadWatchdog)
  loadWatchdog = setTimeout(() => fail('The plate reader stopped loading', true), LOAD_IDLE_TIMEOUT_MS)
}

function onMessage(msg: FromWorker) {
  switch (msg.type) {
    case 'progress':
      armLoadWatchdog()
      set({
        status: 'loading',
        progress: { loaded: msg.loaded, total: msg.total },
        download: msg.loaded >= msg.total ? 'done' : 'running',
      })
      return
    case 'ready':
      clearTimeout(loadWatchdog)
      loadSettle?.resolve()
      loadSettle = null
      set({ status: 'ready', progress: null })
      return
    case 'loadFailed':
      fail(msg.message, msg.retryable)
      return
    case 'result':
    case 'needPixels':
    case 'readFailed': {
      const c = calls.get(msg.id)
      if (!c) return
      calls.delete(msg.id)
      if (msg.type === 'readFailed') c.reject(new Error(msg.message))
      else c.resolve(msg)
    }
  }
}

/** Start the worker and load the models (once per page). Rejects when it cannot run now. */
export function startReader(): Promise<void> {
  if (loadPromise) return loadPromise
  if (snapshot.status === 'failed') return Promise.reject(new Error('The plate reader cannot run here'))
  loadPromise = new Promise<void>((resolve, reject) => {
    loadSettle = { resolve, reject }
    if (typeof Worker === 'undefined' || typeof WebAssembly !== 'object') {
      fail('Workers or WebAssembly are not available', false)
      return
    }
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      fail(e instanceof Error ? e.message : 'The worker could not start', false)
      return
    }
    worker.onmessage = (ev: MessageEvent<FromWorker>) => onMessage(ev.data)
    worker.onerror = (ev) => { ev.preventDefault(); fail(ev.message || 'The worker failed', false) }
    worker.onmessageerror = () => fail('A worker message could not be read', false)
    set({ status: 'loading', progress: null })
    armLoadWatchdog()
    post({ type: 'load' })
  })
  loadPromise.catch(() => {})
  return loadPromise
}

function post(msg: ToWorker, transfer: Transferable[] = []) {
  worker?.postMessage(msg, transfer)
}

function call(msg: ToWorker & { id: number }, transfer: Transferable[] = []): Promise<FromWorker> {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new ReaderRetryError('The plate reader is not running')); return }
    const timer = setTimeout(() => fail('The plate reader did not answer', false), READ_TIMEOUT_MS)
    calls.set(msg.id, {
      resolve: (m) => { clearTimeout(timer); resolve(m) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })
    post(msg, transfer)
  })
}

async function readNow(file: Blob, margin: Margin | undefined): Promise<ReadOutput> {
  await startReader()
  const first = await call({ type: 'read', id: nextId++, file, margin })
  if (first.type === 'result') return first
  // The worker cannot decode images here (no OffscreenCanvas): decode on the page.
  const d = (await decodeBitmap(file)) ?? (await decodeWithImg(file))
  if (!d) throw new Error('The photo could not be decoded')
  const { width, height } = d.image
  const buffer = d.image.data.buffer as ArrayBuffer
  const res = await call({ type: 'readPixels', id: nextId++, width, height, buffer, margin }, [buffer])
  if (res.type !== 'result') throw new Error('Unexpected answer from the plate reader')
  const plates = await Promise.all(res.plates.map(async (p) => ({ ...p, cropImage: await cropToBlob(d.canvas, p.crop) })))
  return { ...res, plates }
}

/**
 * Read the plates on one photo. Photos are read one after another. Rejects with a
 * ReaderRetryError when the download failed and a later attempt may work. `margin`
 * overrides the crop margin (F-PLATE-9; only for measuring it).
 */
export function readPhoto(file: Blob, margin?: Margin): Promise<ReadOutput> {
  const run = () => readNow(file, margin)
  const p = queue.then(run, run)
  queue = p.catch(() => {})
  return p
}

/** "Minden adat törlése": also remove the downloaded reader files from this device. */
export async function clearPlateCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name)
  } catch {
    // Storage unavailable: nothing to delete.
  }
}
