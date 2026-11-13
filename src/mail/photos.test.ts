import { describe, expect, it } from 'vitest'
import { formatBytes, MAIL_PHOTO_BUDGET_BYTES, PhotoDecodeError, photoFileName, reduceAll, REDUCE_STEPS } from './photos'

describe('photoFileName', () => {
  const at = new Date(2026, 10, 11, 8, 42)
  it('numbers photos when there are several (index is 0-based)', () => {
    expect(photoFileName('ABC-123', at, 0, 3)).toBe('parkstop-ABC-123-2026-11-11-0842-1.jpg')
    expect(photoFileName('ABC-123', at, 2, 3)).toBe('parkstop-ABC-123-2026-11-11-0842-3.jpg')
  })
  it('no suffix for a single photo', () => {
    expect(photoFileName('ABC-123', at, 0, 1)).toBe('parkstop-ABC-123-2026-11-11-0842.jpg')
  })
  it('strips accents, spaces and unsafe characters', () => {
    expect(photoFileName('AA BC 123', at, 0, 1)).toBe('parkstop-AA-BC-123-2026-11-11-0842.jpg')
    expect(photoFileName(' Ő/Ű-ÁÉ 1 ', at, 0, 1)).toBe('parkstop-OU-AE-1-2026-11-11-0842.jpg')
    expect(photoFileName('', new Date(2026, 0, 5, 7, 3), 1, 2)).toBe('parkstop-2026-01-05-0703-2.jpg')
  })
})

describe('PhotoDecodeError', () => {
  it('is a typed Error', () => {
    const e = new PhotoDecodeError('cannot decode', 'IMG_1.CR2')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(PhotoDecodeError)
    expect(e.name).toBe('PhotoDecodeError')
    expect(e.fileName).toBe('IMG_1.CR2')
  })
})

describe('reduceAll (e-mail size budget, F-PHOTO-2)', () => {
  // Fake encoder: the output size depends only on the step's long edge.
  const SIZE: Record<number, number> = { 2000: 1_500_000, 1600: 1_000_000, 1280: 600_000 }
  const encode = async (f: Blob, s: { maxEdge: number }) => {
    if (f.type === 'image/x-canon-cr2') throw new Error('cannot decode')
    return new Blob([new Uint8Array(SIZE[s.maxEdge])])
  }
  const jpeg = () => new Blob(['x'], { type: 'image/jpeg' })

  it('keeps the default step when the set fits', async () => {
    const r = await reduceAll([jpeg(), jpeg(), jpeg()], encode)
    expect(r.totalBytes).toBe(4_500_000)
    expect(r.step).toBe(0)
  })
  it('shrinks the largest photos until five fit under the budget', async () => {
    const r = await reduceAll([jpeg(), jpeg(), jpeg(), jpeg(), jpeg()], encode)
    expect(r.totalBytes).toBeLessThanOrEqual(MAIL_PHOTO_BUDGET_BYTES)
    expect(r.blobs.filter((b) => b!.size === 1_000_000)).toHaveLength(1) // 7.5 MB → one step down
    expect(r.step).toBe(1)
  })
  it('stops at the smallest step even if still over the budget', async () => {
    const r = await reduceAll([jpeg(), jpeg()], encode, 100)
    expect(r.blobs.every((b) => b!.size === 600_000)).toBe(true)
    expect(r.step).toBe(REDUCE_STEPS.length - 1)
  })
  it('leaves undecodable photos out as null and carries on', async () => {
    const r = await reduceAll([jpeg(), new Blob(['x'], { type: 'image/x-canon-cr2' }), jpeg()], encode)
    expect(r.blobs[1]).toBeNull()
    expect(r.blobs.filter(Boolean)).toHaveLength(2)
  })
})

describe('formatBytes', () => {
  it('uses a decimal comma, a no-break space and MB / kB', () => {
    expect(formatBytes(4_230_000)).toBe('4,2\u00a0MB')
    expect(formatBytes(850_000)).toBe('850\u00a0kB')
  })
})
