import { describe, expect, it } from 'vitest'
import { hu } from './hu'

describe('hu strings', () => {
  it('has no empty values', () => {
    for (const [key, value] of Object.entries(hu)) {
      expect(value.trim().length, key).toBeGreaterThan(0)
    }
  })
})
