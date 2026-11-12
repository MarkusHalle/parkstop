// Photo preparation for the e-mail (F-PHOTO-2, F-PHOTO-3, F-MAIL-2). Browser only (canvas).
// Ported from the owner-tested spike public/spikes/mail/common.js. The original file is
// never modified: every function returns a new Blob.

/** Thrown when the browser cannot decode a file (HEIC on some devices, camera RAW). */
export class PhotoDecodeError extends Error {
  readonly fileName: string | undefined
  constructor(message: string, fileName?: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PhotoDecodeError'
    this.fileName = fileName
  }
}

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  return String(e)
}

type Drawable = ImageBitmap | HTMLImageElement

async function loadBitmap(file: Blob): Promise<Drawable> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (e1) {
    // Fallback: <img>. Modern browsers apply EXIF orientation to <img> by default.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      await img.decode()
      return img
    } catch (e2) {
      const name = file instanceof File ? file.name : undefined
      throw new PhotoDecodeError(`cannot decode image (${errText(e1)}; fallback ${errText(e2)})`, name, {
        cause: e2,
      })
    } finally {
      // Safe after decode: the decoded image is drawn from memory.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}

async function renderToCanvas(file: Blob, maxEdge: number, whiteBackground: boolean): Promise<HTMLCanvasElement> {
  const src = await loadBitmap(file)
  try {
    const w0 = src instanceof HTMLImageElement ? src.naturalWidth : src.width
    const h0 = src instanceof HTMLImageElement ? src.naturalHeight : src.height
    if (!w0 || !h0) throw new PhotoDecodeError('image has no size', file instanceof File ? file.name : undefined)
    const scale = Math.min(1, maxEdge / Math.max(w0, h0))
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    if (whiteBackground) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(src, 0, 0, w, h)
    return canvas
  } finally {
    if ('close' in src) src.close()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), type, quality)
  })
}

/** Per-photo size target (F-PHOTO-2: ≤ 1.5 MB each so five stay under 10 MB). */
export const PHOTO_TARGET_BYTES = 1.5e6
const FALLBACK_QUALITIES = [0.75, 0.65]

/**
 * Long edge at most maxEdge px, JPEG at the given quality (F-PHOTO-2). A very detailed photo
 * that still exceeds the size target is re-encoded at lower quality (review 2.6, finding 7).
 */
export async function downscaleToJpeg(file: Blob, maxEdge = 2000, quality = 0.85): Promise<Blob> {
  const canvas = await renderToCanvas(file, maxEdge, true)
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  for (const q of FALLBACK_QUALITIES) {
    if (blob.size <= PHOTO_TARGET_BYTES || q >= quality) break
    blob = await canvasToBlob(canvas, 'image/jpeg', q)
  }
  return blob
}

/**
 * Total size budget for the reduced photos of one e-mail (F-PHOTO-2: "the whole message
 * stays under 10 MB"). Attachments travel base64-encoded, which adds a third, so 7 MB of
 * JPEG becomes about 9.4 MB on the wire, leaving room for the text.
 */
export const MAIL_PHOTO_BUDGET_BYTES = 7e6

/** Encoding steps tried in order until the set fits the budget (step 0 = F-PHOTO-2 default). */
export const REDUCE_STEPS: readonly { maxEdge: number; quality: number }[] = [
  { maxEdge: 2000, quality: 0.85 },
  { maxEdge: 1600, quality: 0.8 },
  { maxEdge: 1280, quality: 0.75 },
]

export interface ReduceAllResult {
  /** One entry per input, in order; null when that photo could not be decoded. */
  blobs: (Blob | null)[]
  totalBytes: number
  /** Index into REDUCE_STEPS of the last step used. */
  step: number
}

/**
 * Reduces every photo, then — while the set is over the budget — re-encodes the largest
 * photo with the next smaller step. A photo that fails to decode is null and the others
 * carry on (F-PHOTO-3). The encoder is injected so the budget logic is unit-tested.
 */
export async function reduceAll(
  files: Blob[],
  encode: (file: Blob, step: { maxEdge: number; quality: number }) => Promise<Blob>,
  budget = MAIL_PHOTO_BUDGET_BYTES,
): Promise<ReduceAllResult> {
  const steps = files.map(() => 0)
  const blobs: (Blob | null)[] = []
  for (const f of files) {
    try { blobs.push(await encode(f, REDUCE_STEPS[0])) } catch { blobs.push(null) }
  }
  const total = () => blobs.reduce((s, b) => s + (b?.size ?? 0), 0)
  for (;;) {
    if (total() <= budget) break
    // Largest photo that can still go one step smaller.
    let pick = -1
    blobs.forEach((b, i) => {
      if (b && steps[i] < REDUCE_STEPS.length - 1 && (pick < 0 || b.size > blobs[pick]!.size)) pick = i
    })
    if (pick < 0) break
    steps[pick]++
    try { blobs[pick] = await encode(files[pick], REDUCE_STEPS[steps[pick]]) } catch { /* keep the earlier copy */ }
  }
  return { blobs, totalBytes: total(), step: Math.max(0, ...steps) }
}

/** "4,2 MB" / "850 kB" (Hungarian decimal comma). */
export function formatBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(n / 1e3))} kB`
}

/** Reduced PNG for the clipboard, long edge at most maxEdge px (F-MAIL-2). */
export async function downscaleToPng(file: Blob, maxEdge = 1280): Promise<Blob> {
  const canvas = await renderToCanvas(file, maxEdge, false)
  return canvasToBlob(canvas, 'image/png')
}

function asciiSafe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * ASCII-safe download name, e.g. "parkstop-ABC-123-2026-11-11-0842-1.jpg".
 * `index` is 0-based (array index); the suffix is index + 1 and is left out when count is 1.
 */
export function photoFileName(plate: string, observedAt: Date, index: number, count: number): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  const date = `${observedAt.getFullYear()}-${p2(observedAt.getMonth() + 1)}-${p2(observedAt.getDate())}`
  const time = `${p2(observedAt.getHours())}${p2(observedAt.getMinutes())}`
  const parts = ['parkstop', asciiSafe(plate), date, time]
  if (count > 1) parts.push(String(index + 1))
  return `${parts.filter(Boolean).join('-')}.jpg`
}
