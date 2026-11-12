import { describe, expect, it } from 'vitest'
import { toastBottom } from './layout'

describe('toastBottom', () => {
  it('sits at the base offset without a sheet', () => {
    expect(toastBottom(null)).toBe(16)
    expect(toastBottom(0)).toBe(16)
  })
  it('sits above the sheet', () => {
    expect(toastBottom(240.4)).toBe(252)
  })
})
