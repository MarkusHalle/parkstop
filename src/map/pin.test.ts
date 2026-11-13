import { describe, expect, it } from 'vitest'
import { geoFailureFromCode } from './geolocation'
import { nudgeOffset, withAttribution } from './pin'

describe('nudgeOffset', () => {
  it('maps arrows to pixel steps, Shift enlarges', () => {
    expect(nudgeOffset('ArrowLeft', false)).toEqual({ dx: -8, dy: 0 })
    expect(nudgeOffset('ArrowDown', false)).toEqual({ dx: 0, dy: 8 })
    expect(nudgeOffset('ArrowUp', true)).toEqual({ dx: 0, dy: -40 })
  })
  it('ignores other keys', () => {
    expect(nudgeOffset('a', false)).toBeNull()
    expect(nudgeOffset('Enter', true)).toBeNull()
  })
})

describe('geoFailureFromCode', () => {
  it('only code 1 is a permission problem', () => {
    expect(geoFailureFromCode(1)).toBe('denied')
    expect(geoFailureFromCode(2)).toBe('unavailable')
    expect(geoFailureFromCode(3)).toBe('unavailable')
  })
})

describe('withAttribution', () => {
  it('replaces the attribution of vector sources only', () => {
    const style = {
      sources: {
        openmaptiles: { type: 'vector', attribution: 'English' },
        other: { type: 'geojson', attribution: 'keep' },
      },
    }
    const out = withAttribution(style, 'Magyar')
    expect(out.sources.openmaptiles.attribution).toBe('Magyar')
    expect(out.sources.other.attribution).toBe('keep')
    expect(style.sources.openmaptiles.attribution).toBe('English')
  })
  it('leaves a style without sources alone', () => {
    const style = {}
    expect(withAttribution(style, 'x')).toBe(style)
  })
})
