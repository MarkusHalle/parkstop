import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pointToLineDistance from '@turf/point-to-line-distance'
import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson'

type RoadProps = {
  name: string
  annex: 1 | 2
  row: string
  partial: boolean
  cutApplied: boolean
  cutApprox: boolean
  section: string | null
  kind: 'road' | 'bridge' | 'square' | 'tunnel' | 'other' | 'link'
}
type Road = Feature<LineString | MultiLineString, RoadProps>
type Unmatched = { annex: number; row: string; name: string; reason: string }
type Roads = FeatureCollection<LineString | MultiLineString, RoadProps> & {
  source: string
  consolidatedVersion: string
  osmSource: string
  generatedOn: string
  unmatched: Unmatched[]
}
type DecreeItem = { annex: 1 | 2; row: string; name: string; from: string | null; to: string | null }

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
const fc = read('../../src/data/capital-roads.geojson') as Roads
const decree = read('../../scripts/data/decree-432-2012-roads.json') as { items: DecreeItem[] }
const report = read('../../scripts/data/capital-roads-report.json') as {
  highways: Record<string, string[]>
  osmWays: Record<string, number[]>
}
const expectedUnmatched = read('../../scripts/data/capital-roads-expected-unmatched.json') as { row: string }[]
// `kind: 'link'` features are display-only stretches that close gaps in the drawn band (D49);
// the resolver ignores them, so the row checks below use the rows' own features.
const all = fc.features as Road[]
const links = all.filter((f) => f.properties.kind === 'link')
const roads = all.filter((f) => f.properties.kind !== 'link')
const key = (p: { annex: number; row: string }) => `${p.annex}/${p.row}`

const linesOf = (r: Road) => (r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates)

/** Distance in metres from a point to the nearest capital road, and the rows within 15 m. */
function near(lat: number, lon: number): { metres: number; rows: string[] } {
  let metres = Infinity
  const rows: string[] = []
  for (const road of roads) {
    let best = Infinity
    for (const line of linesOf(road)) best = Math.min(best, pointToLineDistance([lon, lat], line, { units: 'meters' }))
    if (best <= 15) rows.push(key(road.properties))
    metres = Math.min(metres, best)
  }
  return { metres, rows }
}

// Rows that cannot be matched to OpenStreetMap, reviewed by hand (2026-11-12; ten rows placed
// from scripts/data/capital-roads-osm-places.json on 2026-11-13, D47): unnamed
// connector roads, a parking area, bus stations, roads to bus garages, squares or streets
// with no carriageway of that name in the district, one 8 m fragment, and one continuation
// row whose geometry equals the row before it.
const EXPECTED_UNMATCHED = [
  '2/36', '2/190', '2/265', '2/376', '2/396', '2/441', '2/451', '2/509',
  '2/519', '2/522', '2/525', '2/848', '2/854', '2/872',
  '2/970', '2/1001', '2/1015', '2/1041', '2/1043', '2/1048', '2/1051',
  '2/1057', '2/1100', '2/1163', '2/1174',
]

describe('decree-432-2012-roads.json', () => {
  it('has all 1273 numbered annex 2 rows plus the lettered rows 71a and 138a', () => {
    const annex2 = new Set(decree.items.filter((i) => i.annex === 2).map((i) => i.row.split('.')[0]))
    const numbered = [...annex2].filter((r) => /^\d+$/.test(r)).map(Number).sort((a, b) => a - b)
    expect(numbered).toEqual(Array.from({ length: 1273 }, (_, i) => i + 1))
    expect([...annex2].filter((r) => /[a-z]$/.test(r)).sort()).toEqual(['138a', '71a'])
  })

  it('has the 20 points of annex 1', () => {
    const points = new Set(decree.items.filter((i) => i.annex === 1).map((i) => i.row.split('.')[0]))
    expect(points.size).toBe(20)
  })
})

describe('capital-roads.geojson', () => {
  it('carries the decree and OSM sources', () => {
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.source).toBe('https://njt.jog.gov.hu/jogszabaly/2012-432-20-22')
    expect(fc.consolidatedVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(fc.osmSource).toBe('OpenStreetMap contributors (ODbL)')
    expect(fc.generatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('has exactly the agreed properties on every feature', () => {
    for (const f of all) {
      // `area: true` marks a hand-placed square or area (closed outline rings, read as a polygon).
      const area = 'area' in f.properties
      expect(Object.keys(f.properties).sort()).toEqual(
        ['annex', ...(area ? ['area'] : []), 'cutApplied', 'cutApprox', 'kind', 'name', 'partial', 'row', 'section'],
      )
      const p = f.properties
      if (area) expect([(p as { area?: unknown }).area, p.kind]).toEqual([true, 'square'])
      expect([1, 2]).toContain(p.annex)
      if (p.cutApplied) expect(p.partial).toBe(true)
      if (p.cutApprox) expect(p.cutApplied).toBe(true)
      if (p.partial) expect(p.section).not.toBeNull()
      expect(['road', 'bridge', 'square', 'tunnel', 'other', 'link']).toContain(p.kind)
    }
  })

  it('has valid line geometry inside Budapest, rounded to 6 decimals', () => {
    for (const f of all) {
      for (const line of linesOf(f)) {
        expect(line.length).toBeGreaterThanOrEqual(2)
        for (const [lon, lat] of line) {
          expect(lon).toBeGreaterThan(18.9)
          expect(lon).toBeLessThan(19.35)
          expect(lat).toBeGreaterThan(47.34)
          expect(lat).toBeLessThan(47.62)
          expect(Math.round(lon * 1e6) / 1e6).toBe(lon)
          expect(Math.round(lat * 1e6) / 1e6).toBe(lat)
        }
      }
    }
  })

  it('accounts for every decree row exactly once, with the reviewed rows unmatched', () => {
    const rows = decree.items.filter((i) => i.name !== '').map(key)
    const seen = [...roads.map((f) => key(f.properties)), ...fc.unmatched.map(key)]
    expect([...seen].sort()).toEqual([...rows].sort())
    expect(fc.unmatched.map(key).sort()).toEqual([...EXPECTED_UNMATCHED].sort())
    expect(expectedUnmatched.map((u) => u.row).sort()).toEqual([...EXPECTED_UNMATCHED].sort())
  })

  it('names each feature as the decree row does; loops "X – X" are whole roads', () => {
    const byRow = new Map(decree.items.map((i) => [key(i), i]))
    for (const f of roads) {
      const item = byRow.get(key(f.properties))!
      expect(item.name).toBe(f.properties.name)
      const loop = item.from !== null && item.from === item.to
      expect(f.properties.partial).toBe((item.from !== null || item.to !== null) && !loop)
    }
  })

  it('contains no motorway or motorway_link way (decree §1 (2))', () => {
    for (const f of roads) {
      const types = report.highways[key(f.properties)]
      expect(types?.length).toBeGreaterThan(0)
      expect(types.filter((t) => t.startsWith('motorway'))).toEqual([])
      expect(report.osmWays[key(f.properties)].length).toBeGreaterThan(0)
    }
  })

  // Each road below was checked against scripts/data/decree-432-2012-roads.json; the points
  // are OpenStreetMap centre-line vertices of the road, some moved off the centre line.
  it.each([
    // [label, lat, lon, expected row]
    ['Andrássy út between Oktogon and Kodály körönd (row 2/312, VI.)', 47.5068, 19.06562, '2/312'],
    ['Teréz körút (row 2/332, VI.)', 47.50558, 19.06286, '2/332'],
    ['Hungária körút near Kőbányai út (annex 1 point 15)', 47.49027, 19.10909, '1/15.4'],
    ['Váci út in XIII. (annex 1 point 2)', 47.53505, 19.06795, '1/2'],
    ['Bécsi út in II., Frankel Leó utca – Szépvölgyi út (lettered row 2/71a)', 47.52581, 19.03714, '2/71a'],
    ['Bécsi út in II., 12 m off the centre line (row 2/71a)', 47.52581, 19.03732, '2/71a'],
    ['Aranyvölgy utca in III., Bécsi út – Aranyhegyi út (lettered row 2/138a)', 47.57204, 19.02223, '2/138a'],
  ])('%s is within 15 m of that capital road', (_label, lat, lon, row) => {
    const hit = near(lat, lon)
    expect(hit.metres).toBeLessThanOrEqual(15)
    expect(hit.rows).toContain(row)
  })

  // Residential streets that appear nowhere in the decree, and points just outside a cut
  // section; all are more than 15 m from every capital road.
  it.each([
    ['Dob utca (VII.), not in the decree', 47.49973, 19.06291],
    ['Paulay Ede utca (VI.), not in the decree', 47.50036, 19.05756],
    ['Szív utca (VI.), not in the decree', 47.51024, 19.06692],
    ['Bimbó út ~40 m west of Fenyves utca, outside section 2/72', 47.52364, 19.00135],
    ['the stray Pesti út namesake at the city edge, dropped from row 2/939', 47.4912, 19.3134],
    ['Kelenhegyi út far from its Somlói út section (row 2/574)', 47.48342, 19.04342],
  ])('%s is more than 15 m from every capital road', (_label, lat, lon) => {
    expect(near(lat, lon).metres).toBeGreaterThan(15)
  })

  it('has at most one short display-only link per row, each next to its row (D49)', () => {
    expect(links.length).toBeGreaterThan(0)
    const seen = new Set<string>()
    for (const l of links) {
      const k = key(l.properties)
      expect(seen.has(k)).toBe(false)
      seen.add(k)
      const own = roads.find((r) => key(r.properties) === k)!
      expect(own).toBeDefined()
      expect({ ...l.properties, kind: own.properties.kind }).toEqual(own.properties)
      // Every link line touches the row's own geometry (within 3 m) at one end at least.
      for (const line of linesOf(l)) {
        const d = Math.min(...[line[0], line.at(-1)!].map((p) => Math.min(...linesOf(own).map((c) => pointToLineDistance(p, c, { units: 'meters' })))))
        expect(d).toBeLessThanOrEqual(3)
      }
    }
  })

  it('keeps bridges whole across district borders', () => {
    for (const row of ['2/99', '2/52', '2/303', '2/452']) {
      const f = roads.find((r) => key(r.properties) === row)!
      expect(f.properties.kind).toBe('bridge')
    }
    // Margit híd (row 2/99, II.) still reaches the Pest bank in district V / XIII.
    const margit = roads.find((r) => key(r.properties) === '2/99')!
    const lons = linesOf(margit).flat().map(([lon]) => lon)
    expect(Math.max(...lons) - Math.min(...lons)).toBeGreaterThan(0.008) // ~600 m east–west
  })
})
