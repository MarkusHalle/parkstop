import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import pointToLineDistance from '@turf/point-to-line-distance'
import { lineString, point } from '@turf/helpers'
import type { Feature, MultiPolygon, Polygon } from 'geojson'

// The 30 resolver test points (roadmap 1.7, SPEC 11.1). The resolver tests in M2 check
// `expected` against the resolver; this file checks that the bundled data still supports it.
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const fixture = load('tests/fixtures/authority-test-points.json')
const districts = load('src/data/districts.geojson')
const roads = load('src/data/capital-roads.geojson')
const auth = load('src/data/authorities.json')

type Exp = { district: number | null; insideBudapest: boolean; capitalRoad: string | null; primaryId: string | null; policeId: string | null }
type Pt = { id: string; label: string; lat: number; lon: number; category: string; expected: Exp }
const points: Pt[] = fixture.points

const districtOf = (ll: [number, number]) =>
  districts.features.find((f: Feature<Polygon | MultiPolygon>) => booleanPointInPolygon(point(ll), f))?.properties.district ?? null
const budapest = { type: 'Feature', properties: {}, geometry: districts.budapest } as Feature<Polygon | MultiPolygon>
// Display-only links (kind 'link', D49) are not capital roads for the resolver.
const parts: { id: string; l: ReturnType<typeof lineString> }[] = roads.features.filter((f: { properties: { kind: string } }) => f.properties.kind !== 'link').flatMap(
  (f: { properties: { annex: number; row: string }; geometry: { type: string; coordinates: number[][] | number[][][] } }) =>
    (f.geometry.type === 'LineString' ? [f.geometry.coordinates as number[][]] : (f.geometry.coordinates as number[][][])).map((c) => ({
      id: `${f.properties.annex}/${f.properties.row}`,
      l: lineString(c),
    })),
)
const roadsWithin = (ll: [number, number], m: number) =>
  [...new Set(parts.filter((p) => pointToLineDistance(point(ll), p.l, { units: 'meters' }) <= m).map((p) => p.id))]
const ids = new Set(auth.authorities.map((a: { id: string }) => a.id))
const actsOn = (d: number | null) =>
  new Set((auth.districtRules.find((r: { district: number }) => r.district === d)?.districtActsOn ?? []).map((a: { annex: number; row: string }) => `${a.annex}/${a.row}`))

describe('authority test points', () => {
  it('has 30 points covering every category', () => {
    expect(points).toHaveLength(30)
    const cats = new Set(points.map((p) => p.category))
    for (const c of ['district-street', 'capital-road', 'district-acts-on', 'border', 'no-district', 'outside', 'square', 'partial-uncut']) expect(cats).toContain(c)
  })

  for (const p of points) {
    it(`${p.id} ${p.label}`, () => {
      const ll: [number, number] = [p.lon, p.lat]
      expect(booleanPointInPolygon(point(ll), budapest)).toBe(p.expected.insideBudapest)
      expect(districtOf(ll)).toBe(p.expected.district)
      const near = roadsWithin(ll, 15)
      if (p.expected.capitalRoad === null) expect(near).toEqual([])
      else expect(near).toContain(p.expected.capitalRoad)
      // A pin on a listed VI/VII section must not also touch an unlisted capital road,
      // otherwise the expected primary would be ambiguous.
      if (p.category === 'district-acts-on' && p.expected.primaryId !== 'fori') {
        const listed = actsOn(p.expected.district)
        expect(near.filter((r) => !listed.has(r))).toEqual([])
      }
      for (const id of [p.expected.primaryId, p.expected.policeId]) if (id !== null) expect(ids).toContain(id)
    })
  }
})
