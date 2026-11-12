import { describe, expect, it } from 'vitest'
import { PhotoDecodeError, photoFileName } from './photos'

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
