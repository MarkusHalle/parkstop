import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FILES, verifyDownload, type ReaderFile } from './files'

const pub = (p: string) => new URL(`../../public/${p}`, import.meta.url)
const buf = (p: string) => {
  const b = readFileSync(pub(p))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('reader files', () => {
  it.each(Object.entries(FILES))('%s exists and passes its own check', (_name, f: ReaderFile) => {
    if (f.bytes !== null) expect(statSync(pub(f.path)).size).toBe(f.bytes)
    expect(verifyDownload(f, null, buf(f.path))).toBe(true)
  })
})

describe('verifyDownload (M1: never cache a wrong file)', () => {
  const html = new TextEncoder().encode('<!doctype html><title>Wi-Fi login</title>').buffer as ArrayBuffer
  it('rejects HTML', () => {
    expect(verifyDownload(FILES.detector, 'text/html; charset=utf-8', buf(FILES.detector.path))).toBe(false)
    expect(verifyDownload(FILES.runtime, null, html)).toBe(false)
    expect(verifyDownload(FILES.ocrConfig, 'application/json', html)).toBe(false)
  })
  it('rejects a wrong size or a cut-off file', () => {
    const full = buf(FILES.ocr.path)
    expect(verifyDownload(FILES.ocr, 'application/octet-stream', full.slice(0, full.byteLength - 1))).toBe(false)
    const wasm = buf(FILES.wasm.path)
    const bad = new Uint8Array(wasm.slice(0))
    bad[0] = 0x3c
    expect(verifyDownload(FILES.wasm, null, bad.buffer)).toBe(false)
  })
})
