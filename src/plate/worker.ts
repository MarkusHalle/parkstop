// Plate-reader worker (SPEC 4.9). Loads ONNX Runtime Web (vendored CPU/WASM build,
// public/vendor/ort, D10) and the two models (public/models) from the app's own address,
// keeps every file in the Cache Storage so they are downloaded once and work offline
// afterwards (F-PLATE-1), then decodes photos and runs pipeline.ts: detect → crop with margin
// (F-PLATE-9) → read. Started only after the user opted in and a photo exists (F-PLATE-6).
import { CACHE_NAME, CACHE_PREFIX, FILES, TEXT_FILE_ESTIMATE, verifyDownload, type ReaderFile } from './files'
import { cropToBlob, decodeBitmap, type Decoded } from './image'
import { consensusRead } from './consensus'
import { CROP_MARGINS, DEFAULT_MARGIN_INDEX, DETECTOR_CONF, readPlates, readPlatesMulti, type Margin, type OcrConfig, type Sessions, type Timings } from './pipeline'
import type { FromWorker, ToWorker, WorkerPlate } from './protocol'

const ROOT = new URL(import.meta.env.BASE_URL, self.location.href)
const urlOf = (f: ReaderFile) => new URL(f.path, ROOT).href
const DETECTOR_SIZE = 384

// The part of ONNX Runtime Web's API used here (checked against the vendored 1.31.1 bundle:
// env.wasm.wasmPaths may be a prefix string or { mjs, wasm }; wasmBinary is honoured).
interface OrtModule {
  env: { wasm: { wasmPaths?: string | { mjs?: string }; wasmBinary?: ArrayBuffer | Uint8Array; numThreads?: number; proxy?: boolean } }
  InferenceSession: { create(model: Uint8Array, options: object): Promise<Sessions['detector']> }
  Tensor: Sessions['Tensor']
}

/** A failure that a later attempt may not repeat (network, server, captive portal). */
class RetryableError extends Error {}

const post = (msg: FromWorker) => self.postMessage(msg)

// ---------------------------------------------------------------------------------------
// Downloading with progress and caching

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name)
    }
    return await caches.open(CACHE_NAME)
  } catch {
    return null // e.g. storage blocked: download every time
  }
}

async function readBody(res: Response, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  if (!res.body) {
    const buf = await res.arrayBuffer()
    onBytes(buf.byteLength)
    return buf
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    onBytes(value.byteLength)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out.buffer
}

/**
 * Every file, cache first. Network bytes are reported as progress; a download is cached
 * only after verifyDownload() accepted it.
 */
async function fetchAll(files: ReaderFile[]): Promise<ArrayBuffer[]> {
  const cache = await openCache()
  const hits = await Promise.all(files.map(async (f) => {
    try {
      const hit = (await cache?.match(urlOf(f))) ?? null
      if (!hit) return null
      const buf = await hit.arrayBuffer()
      return verifyDownload(f, hit.headers.get('Content-Type'), buf) ? buf : null
    } catch {
      return null
    }
  }))
  const total = files.reduce((sum, f, i) => sum + (hits[i] ? 0 : (f.bytes ?? TEXT_FILE_ESTIMATE)), 0)
  let loaded = 0
  let lastPost = 0
  const onBytes = (n: number) => {
    loaded += n
    const now = performance.now()
    if (now - lastPost > 150) {
      lastPost = now
      post({ type: 'progress', loaded: Math.min(loaded, total), total })
    }
  }
  if (total > 0) post({ type: 'progress', loaded: 0, total })
  const bufs = await Promise.all(files.map(async (f, i) => {
    const hit = hits[i]
    if (hit) return hit
    let res: Response
    try {
      res = await fetch(urlOf(f), { cache: 'no-cache' })
    } catch (e) {
      throw new RetryableError(`Download failed for ${f.path}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok) throw new RetryableError(`HTTP ${res.status} for ${f.path}`)
    let buf: ArrayBuffer
    try {
      buf = await readBody(res, onBytes)
    } catch (e) {
      throw new RetryableError(`Download broke off for ${f.path}: ${e instanceof Error ? e.message : String(e)}`)
    }
    const type = res.headers.get('Content-Type')
    if (!verifyDownload(f, type, buf)) throw new RetryableError(`Unexpected content for ${f.path}`)
    try {
      await cache?.put(urlOf(f), new Response(buf, { headers: { 'Content-Type': type ?? 'application/octet-stream' } }))
    } catch {
      // Quota or storage refused: works, just downloads again next time.
    }
    return buf
  }))
  if (total > 0) post({ type: 'progress', loaded: total, total })
  return bufs
}

async function dropCache() {
  try { await caches?.delete(CACHE_NAME) } catch { /* nothing cached */ }
}

// ---------------------------------------------------------------------------------------
// Loading

let sessions: Sessions | null = null
let loading: Promise<void> | null = null

const jsUrl = (buf: ArrayBuffer) => URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }))

async function load(): Promise<void> {
  if (typeof WebAssembly !== 'object') throw new Error('No WebAssembly')
  const [cfgBuf, detBuf, ocrBuf, wasmBuf, runtimeBuf, loaderBuf] = await fetchAll([
    FILES.ocrConfig, FILES.detector, FILES.ocr, FILES.wasm, FILES.runtime, FILES.loader,
  ])
  const ocrConfig = JSON.parse(new TextDecoder().decode(cfgBuf)) as OcrConfig
  const threads = self.crossOriginIsolated
    ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
    : 1
  // The runtime and its loader come from the cached copies (blob URLs), so the reader also
  // starts offline. With several threads the runtime starts more workers from the loader's
  // address, so it then uses the network address instead (not the case on GitHub Pages).
  let ort: OrtModule
  try {
    ort = (await import(/* @vite-ignore */ jsUrl(runtimeBuf))) as OrtModule
  } catch (e) {
    throw new RetryableError(`The runtime could not be loaded: ${e instanceof Error ? e.message : String(e)}`)
  }
  const runtimeDir = new URL('vendor/ort/', ROOT).href
  ort.env.wasm.wasmPaths = threads > 1 ? runtimeDir : { mjs: jsUrl(loaderBuf) }
  ort.env.wasm.wasmBinary = wasmBuf
  ort.env.wasm.numThreads = threads
  ort.env.wasm.proxy = false // already off the main thread
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }
  try {
    const detector = await ort.InferenceSession.create(new Uint8Array(detBuf), opts)
    const ocr = await ort.InferenceSession.create(new Uint8Array(ocrBuf), opts)
    sessions = { detector, ocr, Tensor: ort.Tensor, detSize: DETECTOR_SIZE, ocrConfig }
  } catch (e) {
    // The files were verified, so the device cannot run the models (or a cached copy is
    // damaged): drop the cache so a later session downloads afresh, and stop for this page.
    await dropCache()
    throw e
  }
}

// ---------------------------------------------------------------------------------------
// Reading

async function decodeHere(file: Blob): Promise<Decoded | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  try {
    return await decodeBitmap(file)
  } catch {
    return null
  }
}

async function read(id: number, d: { image: Decoded['image']; canvas: Decoded['canvas'] | null }, margin: Margin | undefined) {
  if (!sessions) throw new Error('Models are not loaded')
  const timings: Timings = {}
  // A fixed margin (the spike's comparison) reads once; the app reads every plate at each
  // crop width and keeps a read only when two widths agree (consensus.ts, D38).
  const plates = margin
    ? await readPlates(d.image, sessions, { confThresh: DETECTOR_CONF, margin, timings })
    : (await readPlatesMulti(d.image, sessions, { confThresh: DETECTOR_CONF, margins: CROP_MARGINS, timings }))
      .flatMap((m) => {
        const r = consensusRead(m.reads, DEFAULT_MARGIN_INDEX, m.zoomed)
        return r ? [{ ...r, box: m.box, detScore: m.detScore }] : []
      })
  const out: WorkerPlate[] = []
  for (const p of plates) {
    out.push({
      text: p.text, minConf: p.minConf, meanConf: p.meanConf, region: p.region, regionConf: p.regionConf,
      detScore: p.detScore, box: p.box, crop: p.crop,
      cropImage: d.canvas ? await cropToBlob(d.canvas, p.crop) : null,
    })
  }
  post({ type: 'result', id, width: d.image.width, height: d.image.height, plates: out, timings })
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data
  if (msg.type === 'load') {
    loading ??= load()
    try {
      await loading
      post({ type: 'ready' })
    } catch (e) {
      loading = null
      post({ type: 'loadFailed', message: e instanceof Error ? e.message : String(e), retryable: e instanceof RetryableError })
    }
    return
  }
  try {
    if (msg.type === 'read') {
      const d = await decodeHere(msg.file)
      if (!d) { post({ type: 'needPixels', id: msg.id }); return }
      await read(msg.id, d, msg.margin)
    } else if (msg.type === 'readPixels') {
      const image = { data: new Uint8ClampedArray(msg.buffer), width: msg.width, height: msg.height }
      await read(msg.id, { image, canvas: null }, msg.margin)
    }
  } catch (e) {
    post({ type: 'readFailed', id: msg.id, message: e instanceof Error ? e.message : String(e) })
  }
}
