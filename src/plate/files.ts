// The plate reader's files, served from the app's own address (F-PLATE-1) and kept in the
// Cache Storage after the first download. files.test.ts checks the sizes against public/.

/** Bump when a model or the runtime changes, so old copies are dropped. */
export const CACHE_NAME = 'parkstop-plate-v1'
export const CACHE_PREFIX = 'parkstop-plate-'

export interface ReaderFile {
  /** Path below the app's base URL. */
  path: string
  /**
   * Exact size of a binary file, checked before it is cached, so a captive-portal page or
   * a cut-off download is never kept. Text files are not size-checked: git may change their
   * line endings on checkout; they are checked by content instead.
   */
  bytes: number | null
  kind: 'json' | 'js' | 'onnx' | 'wasm'
}

export const FILES = {
  ocrConfig: { path: 'models/cct_v2_global_plate_config.json', bytes: null, kind: 'json' },
  detector: { path: 'models/yolo-v9-t-384-license-plates-end2end.onnx', bytes: 7_771_218, kind: 'onnx' },
  ocr: { path: 'models/cct_xs_v2_global.onnx', bytes: 3_344_292, kind: 'onnx' },
  wasm: { path: 'vendor/ort/ort-wasm-simd-threaded.wasm', bytes: 14_848_852, kind: 'wasm' },
  /** ONNX Runtime Web's main bundle (imported by the worker). */
  runtime: { path: 'vendor/ort/ort.wasm.min.mjs', bytes: null, kind: 'js' },
  /** The WebAssembly loader the runtime imports. */
  loader: { path: 'vendor/ort/ort-wasm-simd-threaded.mjs', bytes: null, kind: 'js' },
} as const satisfies Record<string, ReaderFile>

/** Size shown for the progress of a text file before its real size is known. */
export const TEXT_FILE_ESTIMATE = 60_000

/**
 * Is this download the real file? Rejects HTML (a captive portal or an error page served
 * with status 200), a wrong size, and broken text files.
 */
export function verifyDownload(file: ReaderFile, contentType: string | null, body: ArrayBuffer): boolean {
  if (contentType && /text\/html/i.test(contentType)) return false
  if (file.bytes !== null && body.byteLength !== file.bytes) return false
  const head = new Uint8Array(body, 0, Math.min(16, body.byteLength))
  if (file.kind === 'wasm') return head[0] === 0 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d // "\0asm"
  if (file.kind === 'json') {
    try {
      const cfg = JSON.parse(new TextDecoder().decode(body)) as { alphabet?: unknown }
      return typeof cfg.alphabet === 'string'
    } catch {
      return false
    }
  }
  if (file.kind === 'js') {
    const text = new TextDecoder().decode(head).trimStart()
    return body.byteLength > 1000 && !text.startsWith('<')
  }
  return body.byteLength > 0
}
