// The TypeScript port must behave exactly like the spike's pipeline.js (the one measured in
// spike S3, D10/D16/D19). Both run here on the same synthetic inputs.
import { beforeAll, describe, expect, it } from 'vitest'
import * as ts from './pipeline'
import type { OcrConfig, OrtSessionLike, OrtTensorLike, RgbaImage } from './pipeline'

// Loaded at run time so TypeScript does not need types for the plain-JS spike file.
const SPIKE = '../../public/spikes/plate/pipeline.js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let js: any
beforeAll(async () => {
  js = await import(/* @vite-ignore */ SPIKE)
})

/** Deterministic pseudo-random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function image(w: number, h: number, seed: number): RgbaImage {
  const r = rng(seed)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i++) data[i] = (i & 3) === 3 ? 255 : Math.floor(r() * 256)
  return { data, width: w, height: h }
}

const CFG: OcrConfig = {
  max_plate_slots: 10,
  alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_',
  pad_char: '_',
  img_height: 64,
  img_width: 128,
  keep_aspect_ratio: false,
  image_color_mode: 'rgb',
  plate_regions: ['Austria', 'Germany', 'Hungary', 'Unknown'],
}

describe('pyRound', () => {
  it.each([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999, 3.5000001, 7, -7.5])('%s', (x) => {
    expect(ts.pyRound(x)).toBe(js.pyRound(x))
  })
})

describe('resizeRectToRGB', () => {
  it.each([
    [37, 23, { x: 0, y: 0, w: 37, h: 23 }, 16, 9],
    [37, 23, { x: 3, y: 2, w: 20, h: 11 }, 64, 40], // upscale
    [120, 80, { x: 10, y: 5, w: 100, h: 70 }, 33, 21], // downscale
    [5, 5, { x: 4, y: 4, w: 1, h: 1 }, 3, 3], // single pixel
  ])('%ix%i rect %o → %ix%i', (w, h, rect, dw, dh) => {
    const img = image(w, h, w * 31 + h)
    expect(Array.from(ts.resizeRectToRGB(img, rect, dw, dh))).toEqual(Array.from(js.resizeRectToRGB(img, rect, dw, dh)))
  })
})

describe('letterbox and detector preprocessing', () => {
  it.each([[640, 480], [480, 640], [1920, 1080], [383, 384], [1001, 999], [7, 3]])('%ix%i', (w, h) => {
    expect(ts.letterboxParams(w, h, 384)).toEqual(js.letterboxParams(w, h, 384))
  })
  it('detectorPreprocess', () => {
    const img = image(97, 61, 5)
    const a = ts.detectorPreprocess(img, 64)
    const b = js.detectorPreprocess(img, 64)
    expect(a.dims).toEqual(b.dims)
    expect(a.lb).toEqual(b.lb)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})

describe('detectorPostprocess', () => {
  it('maps boxes back and filters by score like the spike', () => {
    const r = rng(9)
    const rows = 12
    const out = new Float32Array(rows * 7)
    for (let i = 0; i < rows; i++) {
      out.set([0, r() * 384, r() * 384, r() * 384, r() * 384, 0, r()], i * 7)
    }
    for (const [w, h] of [[1920, 1080], [1080, 1920], [384, 384]]) {
      const lb = ts.letterboxParams(w, h, 384)
      expect(ts.detectorPostprocess(out, [rows, 7], lb, 0.4)).toEqual(js.detectorPostprocess(out, [rows, 7], lb, 0.4))
    }
  })
})

describe('cropRect', () => {
  it.each([
    [{ x1: 10, y1: 20, x2: 60, y2: 40 }],
    [{ x1: -5, y1: -3, x2: 30, y2: 12 }],
    [{ x1: 90, y1: 70, x2: 140, y2: 130 }],
    [{ x1: 50, y1: 50, x2: 50, y2: 60 }],
    [{ x1: 120, y1: 10, x2: 130, y2: 20 }],
  ])('%o', (box) => {
    expect(ts.cropRect(box, 100, 80)).toEqual(js.cropRect(box, 100, 80))
  })
})

describe('widenBox (F-PLATE-9)', () => {
  it('is the identity without a margin', () => {
    const box = { x1: 10, y1: 20, x2: 60, y2: 40 }
    expect(ts.widenBox(box, { x: 0, y: 0 })).toBe(box)
  })
  it('adds a fraction of the box size on each side, rounded outwards', () => {
    expect(ts.widenBox({ x1: 100, y1: 50, x2: 200, y2: 80 }, { x: 0.06, y: 0.1 })).toEqual({ x1: 94, y1: 47, x2: 206, y2: 83 })
  })
  it('matches the spike widenBox', () => {
    for (const box of [{ x1: 100, y1: 50, x2: 200, y2: 80 }, { x1: 3, y1: 7, x2: 41, y2: 19 }]) {
      expect(ts.widenBox(box, ts.CROP_MARGIN)).toEqual(js.widenBox(box, ts.CROP_MARGIN))
      expect(js.widenBox(box, undefined)).toBe(box)
    }
  })
  it('is clamped to the image by cropRect', () => {
    const wide = ts.widenBox({ x1: 2, y1: 1, x2: 98, y2: 79 }, ts.CROP_MARGIN)
    expect(ts.cropRect(wide, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 })
  })
})

describe('OCR preprocessing and decoding', () => {
  it.each([
    ['rgb, stretched', CFG],
    ['grayscale', { ...CFG, image_color_mode: 'grayscale' }],
    ['keep aspect ratio', { ...CFG, keep_aspect_ratio: true, padding_color: 114 }],
  ])('ocrPreprocess %s', (_name, cfg) => {
    const img = image(200, 90, 3)
    const rect = { x: 20, y: 30, w: 150, h: 40 }
    const a = ts.ocrPreprocess(img, rect, cfg)
    const b = js.ocrPreprocess(img, rect, cfg)
    expect(a.dims).toEqual(b.dims)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('ocrDecode matches on random soft-max outputs', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = rng(seed)
      const V = CFG.alphabet.length
      const plate = new Float32Array(CFG.max_plate_slots * V)
      for (let s = 0; s < CFG.max_plate_slots; s++) {
        // From slot 6 on, mostly the pad char, as real plates are shorter than 10 slots.
        const hot = s >= 6 && r() < 0.8 ? V - 1 : Math.floor(r() * V)
        for (let k = 0; k < V; k++) plate[s * V + k] = k === hot ? 0.5 + r() / 2 : r() / 50
      }
      const region = Float32Array.from({ length: CFG.plate_regions!.length }, () => r())
      expect(ts.ocrDecode(plate, CFG, region)).toEqual(js.ocrDecode(plate, CFG, region))
      expect(ts.ocrDecode(plate, CFG, null)).toEqual(js.ocrDecode(plate, CFG, null))
    }
  })
})

describe('readPlates with fake sessions', () => {
  class Tensor {
    type: string
    data: Float32Array | Uint8Array
    dims: readonly number[]
    constructor(type: string, data: Float32Array | Uint8Array, dims: readonly number[]) {
      this.type = type
      this.data = data
      this.dims = dims
    }
  }
  const V = CFG.alphabet.length
  /** OCR output derived from the input pixels, so a different crop gives a different read. */
  function ocrSession(): OrtSessionLike {
    return {
      inputNames: ['input'],
      outputNames: ['plate', 'region'],
      async run(feeds) {
        const inp = feeds.input as Tensor
        let sum = 0
        for (let i = 0; i < inp.data.length; i += 7) sum += inp.data[i]
        const plate = new Float32Array(CFG.max_plate_slots * V)
        for (let s = 0; s < CFG.max_plate_slots; s++) {
          const hot = s < 7 ? (sum + s * 13) % (V - 1) : V - 1
          for (let k = 0; k < V; k++) plate[s * V + k] = k === hot ? 0.9 + ((sum + s) % 10) / 100 : 0.001
        }
        const region = new Float32Array(4).fill(0.1)
        region[sum % 4] = 0.7
        const out: Record<string, OrtTensorLike> = { plate: { data: plate, dims: [1, 10, V] }, region: { data: region, dims: [1, 4] } }
        return out
      },
    }
  }
  const detector: OrtSessionLike = {
    inputNames: ['images'],
    outputNames: ['output0'],
    async run() {
      // Three boxes in 64x64 letterboxed space; one below the threshold, one off the edge.
      const data = Float32Array.from([
        0, 10, 20, 40, 30, 0, 0.9,
        0, 5, 5, 20, 12, 0, 0.2,
        0, 50, 40, 70, 60, 0, 0.6,
      ])
      return { output0: { data, dims: [3, 7] } }
    },
  }

  it('gives the same plates as the spike without a margin', async () => {
    const img = image(160, 120, 11)
    const sessions = { detector, ocr: ocrSession(), Tensor, detSize: 64, ocrConfig: CFG }
    const a = await ts.readPlates(img, sessions, { confThresh: 0.4 })
    const b = await js.readPlates(img, sessions, { confThresh: 0.4 })
    expect(a.length).toBe(2)
    expect(a).toEqual(b)
  })

  it('reads a wider crop with the margin and keeps the detector box', async () => {
    const img = image(160, 120, 11)
    const sessions = { detector, ocr: ocrSession(), Tensor, detSize: 64, ocrConfig: CFG }
    const plain = await ts.readPlates(img, sessions)
    const wide = await ts.readPlates(img, sessions, { margin: ts.CROP_MARGIN })
    expect(wide.map((p) => p.box)).toEqual(plain.map((p) => p.box))
    expect(wide[0].crop.w).toBeGreaterThan(plain[0].crop.w)
    expect(wide[0].crop.h).toBeGreaterThan(plain[0].crop.h)
  })

  it('gives the same plates as the spike with the margin (spike opts.cropMargin)', async () => {
    const img = image(160, 120, 11)
    const sessions = { detector, ocr: ocrSession(), Tensor, detSize: 64, ocrConfig: CFG }
    const a = await ts.readPlates(img, sessions, { margin: ts.CROP_MARGIN })
    const b = await js.readPlates(img, sessions, { cropMargin: ts.CROP_MARGIN })
    expect(a).toEqual(b)
  })

  it('rejects an empty image', async () => {
    const sessions = { detector, ocr: ocrSession(), Tensor, detSize: 64, ocrConfig: CFG }
    await expect(ts.readPlates({ data: new Uint8Array(0), width: 0, height: 0 }, sessions)).rejects.toThrow()
  })

  /** A detector that answers each call from a list (letterboxed 64x64 coordinates). */
  function scripted(calls: number[][][]): OrtSessionLike & { count: number } {
    const s = {
      count: 0,
      inputNames: ['images'],
      outputNames: ['output0'],
      async run() {
        const boxes = calls[s.count++] ?? []
        return { output0: { data: Float32Array.from(boxes.flatMap((b) => [0, ...b, 0, 0.9])), dims: [boxes.length, 7] } }
      },
    }
    return s
  }
  /** OCR that reads only pad characters: "no text". */
  const blankOcr: OrtSessionLike = {
    inputNames: ['input'],
    outputNames: ['plate'],
    async run() {
      const plate = new Float32Array(CFG.max_plate_slots * V)
      const pad = CFG.alphabet.indexOf(CFG.pad_char)
      for (let s = 0; s < CFG.max_plate_slots; s++) plate[s * V + pad] = 1
      return { plate: { data: plate, dims: [1, CFG.max_plate_slots, V] } }
    },
  }

  it('readPlatesMulti reads each plate at every margin and does not zoom when a plate is found', async () => {
    const det = scripted([[[10, 20, 40, 30]]])
    const res = await ts.readPlatesMulti(image(160, 120, 11), { detector: det, ocr: ocrSession(), Tensor, detSize: 64, ocrConfig: CFG }, { margins: ts.CROP_MARGINS })
    expect(det.count).toBe(1)
    expect(res).toHaveLength(1)
    expect(res[0].zoomed).toBe(false)
    expect(res[0].reads).toHaveLength(ts.CROP_MARGINS.length)
    expect(res[0].reads[0]!.crop.w).toBeLessThan(res[0].reads[4]!.crop.w)
  })

  it('zooms into four quarters when nothing is found, drops boxes cut by a quarter edge, maps boxes back', async () => {
    // 160x120 photo → 96x72 quarters, letterboxed at r = 2/3 with 8 px top padding.
    const edge = [50, 20, 64, 30] // reaches x = 96, the inner edge of the left quarters
    const inner = [10, 20, 30, 30]
    const det = scripted([[], [edge], [inner], [], []])
    const res = await ts.readPlatesMulti(image(160, 120, 11), { detector: det, ocr: ocrSession(), Tensor, detSize: 64, ocrConfig: CFG }, { margins: ts.CROP_MARGINS })
    expect(det.count).toBe(5)
    expect(res).toHaveLength(1)
    expect(res[0].zoomed).toBe(true)
    // inner box in the top-right quarter (x0 = 64): x1 = 10 * 1.5 + 64
    expect(res[0].box.x1).toBe(79)
    expect(res[0].reads.every((r) => r !== null && r.crop.x >= 64)).toBe(true)
  })

  it('leaves out detections that read nothing at any margin (a railing, a window)', async () => {
    const det = scripted([[[10, 20, 40, 30]], [], [], [], []])
    const res = await ts.readPlatesMulti(image(160, 120, 11), { detector: det, ocr: blankOcr, Tensor, detSize: 64, ocrConfig: CFG }, { margins: ts.CROP_MARGINS })
    expect(res).toHaveLength(0)
    expect(det.count).toBe(5) // nothing left, so the zoomed search ran
  })

  it('iou and subImage', () => {
    expect(ts.iou({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 0, x2: 15, y2: 10 })).toBeCloseTo(1 / 3)
    expect(ts.iou({ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: 2, y1: 2, x2: 3, y2: 3 })).toBe(0)
    const img = image(4, 3, 5)
    const sub = ts.subImage(img, 1, 1, 2, 2)
    expect(Array.from(sub.data.slice(0, 4))).toEqual(Array.from(img.data.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)))
  })
})
