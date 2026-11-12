// Photo decoding and crop images for the plate reader, shared by the worker (OffscreenCanvas)
// and the page (fallback when the worker cannot decode). Mirrors the spike's app.js: the
// EXIF orientation is applied, longer photos are scaled down to MAX_SIDE.
import type { Rect, RgbaImage } from './pipeline'

/** Longer photos are scaled down by the browser before reading (spike S3). */
export const MAX_SIDE = 4000
/** Height of the crop JPEG; shown at about 56 px, sharper when zoomed. */
export const CROP_IMAGE_MAX_H = 192

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
export type MakeCanvas = (w: number, h: number) => AnyCanvas

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return Object.assign(document.createElement('canvas'), { width: w, height: h })
}

function ctx2d(c: AnyCanvas): Ctx | null {
  return c.getContext('2d', { willReadFrequently: true }) as Ctx | null
}

export interface Decoded {
  canvas: AnyCanvas
  image: RgbaImage
}

/** Draw a decoded photo, scaled to MAX_SIDE, and read its RGBA pixels. Null if impossible. */
export function rasterize(src: CanvasImageSource, w0: number, h0: number, make: MakeCanvas = makeCanvas): Decoded | null {
  if (!(w0 > 0 && h0 > 0)) return null
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
  const w = Math.round(w0 * scale)
  const h = Math.round(h0 * scale)
  const canvas = make(w, h)
  const ctx = ctx2d(canvas)
  if (!ctx) return null
  ctx.drawImage(src, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  return { canvas, image: { data: data.data, width: w, height: h } }
}

/** createImageBitmap with the photo's own orientation; works in the worker and the page. */
export async function decodeBitmap(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
  try {
    return rasterize(bmp, bmp.width, bmp.height)
  } finally {
    bmp.close()
  }
}

/** Page-only fallback: an <img> applies the EXIF orientation in current browsers. */
export async function decodeWithImg(file: Blob): Promise<Decoded | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return rasterize(img, img.naturalWidth, img.naturalHeight)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** JPEG of one region of the decoded photo, for showing next to the field. */
export async function cropToBlob(src: AnyCanvas, rect: Rect, make: MakeCanvas = makeCanvas): Promise<Blob | null> {
  try {
    const dh = Math.max(1, Math.round(Math.min(CROP_IMAGE_MAX_H, rect.h * 3)))
    const dw = Math.max(1, Math.round((rect.w / rect.h) * dh))
    const c = make(dw, dh)
    const ctx = ctx2d(c)
    if (!ctx) return null
    ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, dw, dh)
    if ('convertToBlob' in c) return await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    return await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85))
  } catch {
    return null
  }
}
