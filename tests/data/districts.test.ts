import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

type District = Feature<Polygon | MultiPolygon, { district: number; roman: string; name: string; osmRelation: number }>

const fc = JSON.parse(
  readFileSync(new URL('../../src/data/districts.geojson', import.meta.url), 'utf8'),
) as FeatureCollection<Polygon | MultiPolygon> & {
  source: string
  license: string
  budapest: Polygon | MultiPolygon
}
const districts = fc.features as District[]

function districtAt(lat: number, lon: number): string | null {
  const hit = districts.find((f) => booleanPointInPolygon([lon, lat], f))
  return hit ? hit.properties.roman : null
}

describe('districts.geojson', () => {
  it('has 23 features numbered 1 to 23 in order', () => {
    expect(districts).toHaveLength(23)
    expect(districts.map((f) => f.properties.district)).toEqual(
      Array.from({ length: 23 }, (_, i) => i + 1),
    )
  })

  it('carries source, licence and exact property keys', () => {
    expect(fc.source).toContain('OpenStreetMap')
    expect(fc.license).toBe('ODbL-1.0')
    for (const f of districts) {
      expect(Object.keys(f.properties).sort()).toEqual(['district', 'name', 'osmRelation', 'roman'])
      expect(Number.isInteger(f.properties.osmRelation)).toBe(true)
    }
  })

  it.each([
    ['Parliament', 47.5072, 19.0456, 'V'],
    ['Buda Castle, Matyas church', 47.502, 19.0344, 'I'],
    ['Keleti station', 47.5003, 19.0838, 'VIII'],
    ['Szent Istvan park, Pest bank opposite Margit island', 47.52, 19.056, 'XIII'],
    ['Airport Terminal 2', 47.433, 19.261, 'XVIII'],
    ['Csepel, Szent Imre ter', 47.426, 19.07, 'XXI'],
    ['Budaors (outside Budapest)', 47.461, 18.958, null],
  ])('%s resolves correctly', (_name, lat, lon, expected) => {
    expect(districtAt(lat, lon)).toBe(expected)
  })
})

describe('Budapest outline', () => {
  const inBudapest = (lat: number, lon: number) =>
    booleanPointInPolygon([lon, lat], { type: 'Feature', properties: {}, geometry: fc.budapest })

  // Margit-sziget belongs to no district (administered by the capital since 2013);
  // the Danube channels around it are also in no district. Both are inside Budapest.
  // Statute: see coordinator report (njt.jog.gov.hu), deliberately not stored in data.
  it('Margit island is inside Budapest but in no district', () => {
    expect(inBudapest(47.527, 19.048)).toBe(true)
    expect(districtAt(47.527, 19.048)).toBeNull()
  })

  it('Danube channel at 47.5300, 19.0450 is inside Budapest but in no district', () => {
    expect(inBudapest(47.53, 19.045)).toBe(true)
    expect(districtAt(47.53, 19.045)).toBeNull()
  })

  it('Budaors is outside Budapest', () => {
    expect(inBudapest(47.461, 18.958)).toBe(false)
  })

  it('contains a point of every district', () => {
    for (const f of districts) {
      const ring = (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0])[0]
      expect(ring.length).toBeGreaterThan(3)
    }
    expect(inBudapest(47.5072, 19.0456)).toBe(true)
  })
})
