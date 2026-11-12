import { describe, expect, it } from 'vitest'
import districtsRaw from '../data/districts.geojson?raw'
import roadsRaw from '../data/capital-roads.geojson?raw'
import authoritiesJson from '../data/authorities.json'
import fixture from '../../tests/fixtures/authority-test-points.json'
import type { Feature, LineString, MultiLineString, Polygon } from 'geojson'
import pointToLineDistance from '@turf/point-to-line-distance'
import { lineString, point } from '@turf/helpers'
import { createResolver, isStale, ROAD_TIE_M, type AuthoritiesData, type DistrictProps, type ResolverData, type RoadProps } from './resolver'
import type { Authority, LatLon, Resolution } from './types'

const today = new Date('2026-11-12T12:00:00Z')
const opts = { today }

type Resolved = Extract<Resolution, { kind: 'resolved' }>
function resolved(r: Resolution): Resolved {
  if (r.kind !== 'resolved') throw new Error('expected a resolved result')
  return r
}
const altIds = (r: Resolved) => r.alternatives.map((a) => `${a.role}:${a.authority.id}`)

// ---------------------------------------------------------------------------
// Real data: the 30 owner-confirmed points (tests/fixtures/authority-test-points.json).

// Bundled files read the same way the app reads them (load.ts); no node:fs, so the test
// typechecks under the app tsconfig.
const realData: ResolverData = {
  districts: JSON.parse(districtsRaw),
  roads: JSON.parse(roadsRaw),
  authorities: authoritiesJson as unknown as AuthoritiesData,
}
const real = createResolver(realData)
const roadDistance = (key: string, lon: number, lat: number) =>
  Math.min(
    ...realData.roads.features
      .filter((f) => `${f.properties.annex}/${f.properties.row}` === key)
      .flatMap((f: Feature<LineString | MultiLineString, RoadProps>) =>
        f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates,
      )
      .map((c) => pointToLineDistance(point([lon, lat]), lineString(c), { units: 'meters' })),
  )

type Exp = {
  district: number | null
  insideBudapest: boolean
  capitalRoad: string | null
  primaryId: string | null
  policeId: string | null
  confidence: string | null
}
const points = fixture.points as { id: string; label: string; lat: number; lon: number; expected: Exp }[]

describe('resolver on the 30 owner-confirmed test points', () => {
  it('has 30 points', () => expect(points).toHaveLength(30))

  for (const p of points) {
    it(`${p.id} ${p.label}`, () => {
      const r = real({ lat: p.lat, lon: p.lon }, opts)
      const e = p.expected
      if (!e.insideBudapest) {
        expect(r).toEqual({ kind: 'outside' })
        return
      }
      const res = resolved(r)
      expect(res.district).toBe(e.district)
      expect(res.primary.id).toBe(e.primaryId)
      const police = res.alternatives.filter((a) => a.role === 'police')
      if (e.policeId === null) expect(police).toEqual([])
      else {
        expect(police.map((a) => a.authority.id)).toEqual([e.policeId])
        expect(res.alternatives.at(-1)?.role).toBe('police')
      }
      expect(res.confidence).toBe(e.confidence)
      if (e.capitalRoad !== null) {
        // The fixture names one road within 15 m; at junctions and on rows the decree lists
        // twice (e.g. 1/18.2 and 2/545) several roads tie at the same distance, and the
        // resolver names one of them. Check the expected road is part of that tie.
        if (!('road' in res.reason)) throw new Error(`expected a road reason, got ${res.reason.code}`)
        const exp = roadDistance(e.capitalRoad, p.lon, p.lat)
        expect(exp).toBeLessThanOrEqual(res.reason.road.distanceM + ROAD_TIE_M + 0.1)
      }
      if (e.capitalRoad === null) expect('road' in res.reason).toBe(false)
      expect(res.stale).toBe(false)
    })
  }

  it('averages under 20 ms per resolve over the real data', () => {
    const ll = points.map((p) => ({ lat: p.lat, lon: p.lon }))
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) real(ll[i % ll.length], opts)
    const avg = (performance.now() - t0) / 100
    expect(avg).toBeLessThan(20)
  })
})

// ---------------------------------------------------------------------------
// Synthetic data on a metre grid near Budapest.
//
// City outline: x 0–2000 m, y 0–1000 m. District 1: x 0–1000, district 2: x 1000–1800,
// x 1800–2000 is inside the city but in no district (like Margit-sziget).

const LAT0 = 47.5
const LON0 = 19
const M_LAT = 111_320
const M_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180)
const xy = (x: number, y: number): [number, number] => [LON0 + x / M_LON, LAT0 + y / M_LAT]
const P = (x: number, y: number): LatLon => ({ lon: LON0 + x / M_LON, lat: LAT0 + y / M_LAT })
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[xy(x0, y0), xy(x1, y0), xy(x1, y1), xy(x0, y1), xy(x0, y0)]],
})
const district = (n: number, roman: string, g: Polygon): Feature<Polygon, DistrictProps> => ({
  type: 'Feature',
  properties: { district: n, roman, name: `${roman}. kerület` },
  geometry: g,
})
const road = (row: string, y: number, x0: number, x1: number, extra: Partial<RoadProps> = {}): Feature<LineString, RoadProps> => ({
  type: 'Feature',
  properties: { name: `Út ${row}`, annex: 2, row, partial: false, cutApplied: false, cutApprox: false, section: null, kind: 'road', ...extra },
  geometry: { type: 'LineString', coordinates: [xy(x0, y), xy((x0 + x1) / 2, y), xy(x1, y)] },
})
const authority = (id: string, type: Authority['type'], verifiedOn = '2026-11-12'): Authority => ({
  id,
  name: id,
  type,
  districts: [],
  email: null,
  sourceUrl: 'https://example.invalid/',
  verifiedOn,
})

function synth(change?: (a: AuthoritiesData) => void) {
  const authorities: AuthoritiesData = {
    authorities: [
      authority('fori', 'fori'),
      authority('district-01', 'district'),
      authority('district-02', 'district'),
      authority('police-01', 'police'),
      authority('police-02', 'police'),
    ],
    districtRules: [
      {
        district: 1,
        roman: 'I',
        ownBody: true,
        primaryId: 'district-01',
        policeId: 'police-01',
        districtActsOn: [
          { annex: 2, row: '2', text: 'Listed road', scope: 'full' },
          { annex: 2, row: '4', text: 'Narrow part text', scope: 'narrower' },
        ],
        verifiedOn: '2026-11-12',
      },
      { district: 2, roman: 'II', ownBody: true, primaryId: 'district-02', policeId: 'police-02', verifiedOn: '2026-11-12' },
    ],
    noDistrictAreas: [{ id: 'island', name: 'Sziget', primaryId: 'fori', policeId: null, verifiedOn: '2026-11-12' }],
  }
  change?.(authorities)
  return createResolver({
    districts: {
      budapest: rect(0, 0, 2000, 1000),
      features: [district(1, 'I', rect(0, 0, 1000, 1000)), district(2, 'II', rect(1000, 0, 1800, 1000))],
    },
    roads: {
      features: [
        road('1', 500, 100, 400), // plain capital road, unlisted
        road('2', 500, 500, 900), // listed "full" in district 1
        road('3', 500.5, 650, 800), // unlisted, runs beside row 2 (tie)
        road('4', 200, 500, 900), // listed "narrower" in district 1
        road('5', 800, 100, 400, { kind: 'square' }),
        road('6', 200, 100, 400, { partial: true, cutApplied: false }),
        road('7', 800, 500, 900, { partial: true, cutApplied: true, cutApprox: true }),
        road('8', 900, 950, 1000), // unlisted, ends at the district border
        road('9', 503, 820, 880), // unlisted, 3 m beside row 2
      ],
    },
    authorities,
  })
}

describe('resolver rules on synthetic data', () => {
  const r = synth()

  it('outside the city outline', () => {
    expect(r(P(2100, 300), opts)).toEqual({ kind: 'outside' })
    expect(r(P(300, -50), opts)).toEqual({ kind: 'outside' })
  })

  it('district street: district body, biztos, FÖRI then police', () => {
    const res = resolved(r(P(300, 350), opts))
    expect(res).toMatchObject({ district: 1, districtRoman: 'I', primaryRole: 'district', reason: { code: 'district-street' }, confidence: 'biztos', nearBorder: null, stale: false })
    expect(res.primary.id).toBe('district-01')
    expect(altIds(res)).toEqual(['fori:fori', 'police:police-01'])
  })

  it('capital road within 8 m: FÖRI, valószínű, district body then police', () => {
    const res = resolved(r(P(250, 505), opts))
    expect(res.primary.id).toBe('fori')
    expect(res.primaryRole).toBe('fori')
    expect(res.reason.code).toBe('capital-road')
    expect(res.confidence).toBe('valószínű')
    if (res.reason.code !== 'capital-road') throw new Error()
    expect(res.reason.road).toMatchObject({ annex: 2, row: '1', name: 'Út 1', section: null, kind: 'road' })
    expect(res.reason.road.distanceM).toBeCloseTo(5, 0)
    expect(res.reason.road.distanceM * 10).toBe(Math.round(res.reason.road.distanceM * 10))
    expect(altIds(res)).toEqual(['district:district-01', 'police:police-01'])
  })

  it('8–15 m band: capital-road-edge, bizonytalan; beyond 15 m: district street', () => {
    const edge = resolved(r(P(250, 511), opts))
    expect(edge.reason.code).toBe('capital-road-edge')
    expect(edge.primary.id).toBe('fori')
    expect(edge.confidence).toBe('bizonytalan')
    const far = resolved(r(P(250, 517), opts))
    expect(far.reason.code).toBe('district-street')
    expect(far.primary.id).toBe('district-01')
  })

  it('listed road (full): district body, valószínű; bizonytalan in the 8–15 m band', () => {
    const res = resolved(r(P(550, 505), opts))
    expect(res.reason.code).toBe('district-acts-on')
    expect(res.primary.id).toBe('district-01')
    expect(res.confidence).toBe('valószínű')
    expect(altIds(res)).toEqual(['fori:fori', 'police:police-01'])
    const edge = resolved(r(P(550, 511), opts))
    expect(edge.reason.code).toBe('district-acts-on')
    expect(edge.confidence).toBe('bizonytalan')
  })

  it('tie between a listed and an unlisted road: FÖRI with the unlisted road', () => {
    // Listed row 2 at 1 m, unlisted row 3 at 1.5 m (within dMin + 1 m).
    const res = resolved(r(P(700, 499), opts))
    expect(res.primary.id).toBe('fori')
    expect(res.reason.code).toBe('capital-road')
    if (res.reason.code !== 'capital-road') throw new Error()
    expect(res.reason.road.row).toBe('3')
    expect(res.reason.road.distanceM).toBeCloseTo(1.5, 0)
  })

  it('unlisted road more than 1 m farther than a listed one is not a tie', () => {
    // Listed row 2 at 0.5 m, unlisted row 9 at 2.5 m: no tie, district body.
    expect(resolved(r(P(850, 500.5), opts)).primary.id).toBe('district-01')
    // Row 2 at 1 m, row 9 at 2 m: tie, FÖRI with row 9.
    const res = resolved(r(P(850, 501), opts))
    expect(res.primary.id).toBe('fori')
    expect('road' in res.reason && res.reason.road.row).toBe('9')
  })

  it("'narrower' scope: FÖRI primary, district body first alternative, bizonytalan", () => {
    const res = resolved(r(P(700, 205), opts))
    expect(res.primary.id).toBe('fori')
    expect(res.reason).toMatchObject({ code: 'district-acts-on-partial', sectionText: 'Narrow part text', road: { row: '4' } })
    expect(res.confidence).toBe('bizonytalan')
    expect(altIds(res)).toEqual(['district:district-01', 'police:police-01'])
  })

  it('square: capital-square, bizonytalan', () => {
    const res = resolved(r(P(250, 805), opts))
    expect(res.reason.code).toBe('capital-square')
    expect(res.confidence).toBe('bizonytalan')
  })

  it('section ends not placed (uncut or approximate cut): capital-road-unplaced, bizonytalan', () => {
    for (const p of [P(250, 205), P(700, 805)]) {
      const res = resolved(r(p, opts))
      expect(res.reason.code).toBe('capital-road-unplaced')
      expect(res.primary.id).toBe('fori')
      expect(res.confidence).toBe('bizonytalan')
    }
  })

  it('near a district border: neighbour alternative, confidence capped at valószínű', () => {
    const res = resolved(r(P(985, 350), opts))
    expect(res.primary.id).toBe('district-01')
    expect(res.nearBorder).toMatchObject({ district: 2, roman: 'II' })
    expect(res.nearBorder?.distanceM).toBeCloseTo(15, 0)
    expect(res.confidence).toBe('valószínű')
    expect(altIds(res)).toEqual(['neighbour:district-02', 'fori:fori', 'police:police-01'])
    // 40 m from the border: no longer near.
    expect(resolved(r(P(960, 350), opts)).nearBorder).toBeNull()
  })

  it('near the city edge: nearBorder without a district, no neighbour alternative', () => {
    const res = resolved(r(P(300, 15), opts))
    expect(res.nearBorder).toMatchObject({ district: null, roman: null })
    expect(res.confidence).toBe('valószínű')
    expect(altIds(res)).toEqual(['fori:fori', 'police:police-01'])
  })

  it('FÖRI primary near a border: district body, neighbour, police', () => {
    const res = resolved(r(P(985, 905), opts))
    expect(res.primary.id).toBe('fori')
    expect(res.reason.code).toBe('capital-road')
    expect(res.nearBorder?.district).toBe(2)
    expect(altIds(res)).toEqual(['district:district-01', 'neighbour:district-02', 'police:police-01'])
  })

  it('no district (island): FÖRI, valószínű, no alternatives', () => {
    const res = resolved(r(P(1900, 500), opts))
    expect(res).toMatchObject({ district: null, districtRoman: null, primaryRole: 'fori', reason: { code: 'no-district', areaName: 'Sziget' }, confidence: 'valószínű', alternatives: [], nearBorder: null })
    expect(res.primary.id).toBe('fori')
  })

  it('district without its own body: FÖRI, no-own-body, valószínű', () => {
    const r2 = synth((a) => {
      a.districtRules[1].ownBody = false
    })
    const res = resolved(r2(P(1400, 500), opts))
    expect(res.primary.id).toBe('fori')
    expect(res.reason.code).toBe('no-own-body')
    expect(res.confidence).toBe('valószínű')
    expect(altIds(res)).toEqual(['police:police-02'])
    // A neighbour without its own body adds no neighbour alternative.
    const nb = resolved(r2(P(985, 350), opts))
    expect(nb.nearBorder?.district).toBe(2)
    expect(altIds(nb)).toEqual(['fori:fori', 'police:police-01'])
  })

  it('alternatives are deduped and never include the primary', () => {
    // District 2 shares district 1's body and police station.
    const r2 = synth((a) => {
      a.districtRules[1].primaryId = 'district-01'
      a.districtRules[1].policeId = 'police-01'
    })
    const res = resolved(r2(P(1015, 350), opts))
    expect(res.primary.id).toBe('district-01')
    expect(res.nearBorder?.district).toBe(1)
    expect(altIds(res)).toEqual(['fori:fori', 'police:police-01'])
  })

  it('stale data: older than 12 months → stale, bizonytalan', () => {
    expect(resolved(r(P(300, 350), { today: new Date('2027-11-12T12:00:00Z') })).stale).toBe(false)
    const res = resolved(r(P(300, 350), { today: new Date('2027-11-13T12:00:00Z') }))
    expect(res.stale).toBe(true)
    expect(res.confidence).toBe('bizonytalan')
    // Only the primary authority's own date (here FÖRI's) is old.
    const r2 = synth((a) => {
      a.authorities[0].verifiedOn = '2025-01-01'
    })
    expect(resolved(r2(P(300, 350), opts)).stale).toBe(false)
    const onRoad = resolved(r2(P(250, 505), opts))
    expect(onRoad.stale).toBe(true)
    expect(onRoad.confidence).toBe('bizonytalan')
    // Island: the area record's own date counts too.
    const r3 = synth((a) => {
      a.noDistrictAreas[0].verifiedOn = '2024-06-01'
    })
    expect(resolved(r3(P(1900, 500), opts))).toMatchObject({ stale: true, confidence: 'bizonytalan' })
  })

  it('isStale', () => {
    expect(isStale('2025-11-12', today)).toBe(false)
    expect(isStale('2025-11-11', today)).toBe(true)
    expect(isStale('not a date', today)).toBe(true)
  })
})

// Counter-examples from the Fable sceptic pass on 2.3 (2026-11-12), on the real data.
describe('resolver: sceptic regressions (real data)', () => {
  const at = (lat: number, lon: number) => resolved(real({ lat, lon }, opts))

  it('a sliver between district polygons is not Margit-sziget', () => {
    for (const [lat, lon] of [[47.481189, 18.977971], [47.486377, 19.032785], [47.48453, 19.00942], [47.390736, 18.951662]]) {
      const res = at(lat, lon)
      expect(res.reason.code, `${lat},${lon}`).not.toBe('no-district')
      expect(res.district, `${lat},${lon}`).not.toBeNull()
      expect(res.alternatives.some((a) => a.role === 'police'), `${lat},${lon}`).toBe(true)
    }
  })

  it('Margit-sziget itself still resolves to FÖRI with no district', () => {
    const p24 = points.find((p) => p.id === 'P24')!
    expect(at(p24.lat, p24.lon)).toMatchObject({ district: null, reason: { code: 'no-district' } })
  })

  it('a listed border street is not defeated by the other district row of the same name', () => {
    expect(at(47.51604, 19.060185)).toMatchObject({ primary: { id: 'district-06' }, reason: { code: 'district-acts-on' } })
    expect(at(47.507434, 19.07245)).toMatchObject({ primary: { id: 'district-07' }, reason: { code: 'district-acts-on' } })
  })

  it('a listed square stays bizonytalan', () => {
    expect(at(47.503634, 19.079608)).toMatchObject({ primary: { id: 'district-07' }, confidence: 'bizonytalan' })
  })

  it('a pin above the Alagút is not on the tunnel road', () => {
    const res = at(47.497945, 19.038322)
    expect(res.reason.code === 'capital-road' && res.reason.road.name.includes('Alagút')).toBe(false)
  })

  it('isStale fails closed on bad input', () => {
    expect(isStale('2025-13-45', today)).toBe(true)
    expect(isStale('2026-01-01', new Date('nonsense'))).toBe(true)
  })
})
