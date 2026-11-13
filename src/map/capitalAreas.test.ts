import { describe, expect, it } from 'vitest'
import { areaPolygons, ringArea } from './capitalAreas'

const square = (x: number, y: number, s: number) => [
  [x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y],
]

describe('areaPolygons', () => {
  it('keeps only the largest closed ring of an area feature', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Blaha Lujza tér', kind: 'square', area: true },
          geometry: { type: 'MultiLineString', coordinates: [square(0.2, 0.2, 0.1), square(0, 0, 1), square(0.5, 0.5, 0.2)] },
        },
        {
          type: 'Feature',
          properties: { name: 'Rákóczi út', kind: 'road' },
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        },
      ],
    }
    const out = areaPolygons(fc)
    expect(out.features).toHaveLength(1)
    expect(out.features[0].properties?.name).toBe('Blaha Lujza tér')
    expect(out.features[0].geometry.coordinates).toEqual([square(0, 0, 1)])
  })

  it('skips an area with no closed ring', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { area: true }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [1, 1]] } }],
    }
    expect(areaPolygons(fc).features).toHaveLength(0)
  })

  it('ringArea is the absolute shoelace area', () => {
    expect(ringArea(square(0, 0, 2))).toBe(4)
    expect(ringArea([...square(0, 0, 2)].reverse())).toBe(4)
  })
})
