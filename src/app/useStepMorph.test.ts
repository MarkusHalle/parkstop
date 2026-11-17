import { describe, expect, it } from 'vitest'
import { pairWords } from './useStepMorph'

describe('pairWords (step 1 → 2 summary morph)', () => {
  const split = (s: string) => s.split(' ')

  it('pairs every word in order and leaves the new separator unpaired', () => {
    const src = split('Zuglói Önkormányzati Rendészet Thököly út 80., XIV. kerület')
    const dst = split('Zuglói Önkormányzati Rendészet · Thököly út 80., XIV. kerület')
    const pairs = pairWords(src, dst)
    expect(pairs).toHaveLength(9)
    expect(pairs.filter(([a, b]) => a !== null && b !== null)).toHaveLength(8)
    expect(pairs.find(([a]) => a === null)).toEqual([null, 3])
  })

  it('pairs a repeated word with its own place, not the first match', () => {
    const src = split('Terézvárosi Rendészet (Terézvárosi Hivatal) Hunyadi tér')
    const dst = split('Terézvárosi Rendészet (Terézvárosi Hivatal) · Hunyadi tér')
    for (const [a, b] of pairWords(src, dst)) if (a !== null && b !== null) expect(src[a]).toBe(dst[b])
    expect(pairWords(src, dst).filter(([a, b]) => a !== null && b !== null).map(([a]) => a)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('lets words only one side has fade (a different recipient was chosen)', () => {
    const pairs = pairWords(split('A B C'), split('X B · C'))
    expect(pairs).toContainEqual([1, 1])
    expect(pairs).toContainEqual([2, 3])
    expect(pairs).toContainEqual([0, null])
    expect(pairs).toContainEqual([null, 0])
    expect(pairs).toContainEqual([null, 2])
  })
})
