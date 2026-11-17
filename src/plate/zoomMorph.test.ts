import { describe, expect, it } from 'vitest'
import { CLOSE_DISTANCE, CLOSE_FLICK, containRect, coverRect, dragFade, dragRect, dragScale, intersect, lerpRect, releaseCloses } from './zoomMorph'

describe('zoom morph geometry', () => {
  it('covers a square thumbnail with a landscape photo, centred and cropped at the sides', () => {
    expect(coverRect({ x: 10, y: 20, w: 84, h: 84 }, 4 / 3)).toEqual({ x: -4, y: 20, w: 112, h: 84 })
  })

  it('covers with a portrait photo cropped top and bottom', () => {
    expect(coverRect({ x: 0, y: 0, w: 80, h: 80 }, 0.5)).toEqual({ x: 0, y: -40, w: 80, h: 160 })
  })

  it('fits a photo in the viewport, centred', () => {
    expect(containRect({ x: 0, y: 100, w: 375, h: 600 }, 4 / 3)).toEqual({ x: 0, y: 259.375, w: 375, h: 281.25 })
    const pc = containRect({ x: 0, y: 0, w: 1280, h: 700 }, 4 / 3)
    expect(pc.h).toBe(700)
    expect(pc.w).toBeCloseTo(2800 / 3)
    expect(pc.x).toBeCloseTo((1280 - 2800 / 3) / 2)
    expect(pc.y).toBe(0)
  })

  it('interpolates rects', () => {
    expect(lerpRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 20, w: 30, h: 50 }, 0.5)).toEqual({ x: 5, y: 10, w: 20, h: 30 })
  })

  it('intersects rects, null when apart', () => {
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 })
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBeNull()
  })

  it('shrinks a dragged photo about its centre and moves it with the finger', () => {
    expect(dragRect({ x: 0, y: 0, w: 100, h: 50 }, 3, 40, 0.8)).toEqual({ x: 13, y: 45, w: 80, h: 40 })
  })
})

describe('drag down to close', () => {
  it('shrinks only a little, and not when dragged up', () => {
    expect(dragScale(0)).toBe(1)
    expect(dragScale(-200)).toBe(1)
    expect(dragScale(120)).toBeGreaterThan(0.9)
    expect(dragScale(5000)).toBeCloseTo(0.78)
  })

  it('fades the backdrop with the distance, fully at half the screen', () => {
    expect(dragFade(0, 800)).toBe(0)
    expect(dragFade(200, 800)).toBe(0.5)
    expect(dragFade(900, 800)).toBe(1)
  })

  it('closes past the distance or on a downward flick, springs back otherwise', () => {
    expect(releaseCloses(CLOSE_DISTANCE + 1, 0)).toBe(true)
    expect(releaseCloses(CLOSE_DISTANCE - 1, 0)).toBe(false)
    expect(releaseCloses(30, CLOSE_FLICK + 1)).toBe(true)
    // Far down but flung back up: stays open.
    expect(releaseCloses(300, -CLOSE_FLICK - 1)).toBe(false)
  })
})
