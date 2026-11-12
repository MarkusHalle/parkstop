import { describe, expect, it } from 'vitest'
import authorities from '../data/authorities.json'
import { oldestVerifiedOn } from './dataDate'

describe('oldestVerifiedOn', () => {
  it('finds the oldest date at any depth', () => {
    const data = { a: [{ verifiedOn: '2026-11-12' }, { nested: { verifiedOn: '2025-03-01' } }], verifiedOn: '2026-01-02' }
    expect(oldestVerifiedOn(data)).toBe('2025-03-01')
  })

  it('ignores values that are not ISO dates', () => {
    expect(oldestVerifiedOn({ verifiedOn: 'soon', b: { verifiedOn: 3 } })).toBeNull()
  })

  it('finds a date in the bundled authority data', () => {
    expect(oldestVerifiedOn(authorities)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
