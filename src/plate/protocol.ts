// Messages between the page (client.ts) and the plate-reader worker (worker.ts).
import type { Box, Margin, Rect, Timings } from './pipeline'

export interface WorkerPlate {
  text: string
  minConf: number
  meanConf: number
  region: string | null
  regionConf: number | null
  detScore: number
  /** Detector box in the decoded image's pixels. */
  box: Box
  /** What the reader saw (box plus margin, clamped), in the decoded image's pixels. */
  crop: Rect
  /** JPEG of `crop`, made where the image was decoded; null if that failed. */
  cropImage: Blob | null
}

export interface ReadOutput {
  /** Size of the decoded (possibly scaled-down) image the boxes refer to. */
  width: number
  height: number
  plates: WorkerPlate[]
  timings: Timings
}

export type ToWorker =
  | { type: 'load' }
  /** Decode the photo in the worker (OffscreenCanvas) and read it. */
  | { type: 'read'; id: number; file: Blob; margin?: Margin }
  /** The page decoded the photo: read these RGBA pixels. */
  | { type: 'readPixels'; id: number; width: number; height: number; buffer: ArrayBuffer; margin?: Margin }

export type FromWorker =
  /** Bytes fetched from the network so far (cached files are not counted). */
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  /** retryable: network or server trouble, try again later; else the device cannot run it. */
  | { type: 'loadFailed'; message: string; retryable: boolean }
  | ({ type: 'result'; id: number } & ReadOutput)
  /** The worker cannot decode images here: the page decodes and sends pixels. */
  | { type: 'needPixels'; id: number }
  | { type: 'readFailed'; id: number; message: string }
