// Authority resolver (SPEC 4.2, D8, D21, roadmap 2.3). Pure: no UI, no network, no
// Hungarian prose. Returns codes; the UI maps them to hu.ts strings.

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import pointToLineDistance from '@turf/point-to-line-distance'
import { lineString, point } from '@turf/helpers'
import type { Feature, LineString, MultiLineString, MultiPolygon, Point, Polygon, Position } from 'geojson'
import type {
  Alternative,
  AlternativeRole,
  Authority,
  Confidence,
  LatLon,
  NearBorder,
  Reason,
  Resolution,
  ResolveOptions,
  RoadRef,
} from './types'

// ---------------------------------------------------------------------------
// Shapes of the bundled data files (only the fields the resolver reads).

export interface DistrictProps {
  district: number
  roman: string
  name: string
}

/** `src/data/districts.geojson`: 23 district polygons plus the city outline. */
export interface DistrictsData {
  budapest: Polygon | MultiPolygon
  features: Feature<Polygon | MultiPolygon, DistrictProps>[]
}

export interface RoadProps {
  name: string
  annex: number
  row: string
  partial: boolean
  cutApplied: boolean
  cutApprox: boolean
  section: string | null
  kind: string
  /**
   * True for a hand-placed square or area (Blaha Lujza tér, a parking lot): its lines are
   * the closed outline rings of a polygon. It counts only for a pin inside the polygon or
   * within AREA_SNAP_M of its outline, not within the 15 m road snap.
   */
  area?: boolean
}

/** `src/data/capital-roads.geojson`: capital-managed roads (Decree 432/2012 annexes). */
export interface RoadsData {
  features: Feature<LineString | MultiLineString, RoadProps>[]
}

export interface DistrictActsOn {
  annex: number
  row: string
  text: string
  scope: 'full' | 'narrower'
}

export interface DistrictRule {
  district: number
  roman: string
  ownBody: boolean
  primaryId: string
  policeId: string | null
  capitalRoads?: string
  districtActsOn?: DistrictActsOn[]
  verifiedOn: string
}

export interface NoDistrictArea {
  id: string
  name: string
  primaryId: string
  policeId: string | null
  verifiedOn: string
}

/** `src/data/authorities.json`. */
export interface AuthoritiesData {
  authorities: Authority[]
  districtRules: DistrictRule[]
  noDistrictAreas: NoDistrictArea[]
}

export interface ResolverData {
  districts: DistrictsData
  roads: RoadsData
  authorities: AuthoritiesData
}

/** Outcome of SPEC 4.2 steps 3 and 4 for one district's rule. */
interface Decision {
  primary: Authority
  primaryRole: 'district' | 'fori'
  reason: Reason
  confidence: Confidence
}

export type Resolver = (ll: LatLon, opts: ResolveOptions) => Resolution

// ---------------------------------------------------------------------------
// Tunables (SPEC 4.2 and the owner's decisions of 2026-11-12).

/** Snap distance to a capital-managed road. */
export const ROAD_SNAP_M = 15
/** Beyond this the road match is the 8–15 m "edge" band: bizonytalan. */
export const ROAD_EDGE_M = 8
/** Roads within dMin + this count as a tie. */
export const ROAD_TIE_M = 1
/**
 * An area feature (`area: true`) counts for a pin inside it or this close to its outline
 * (OSM outline error), so the square does not spill 15 m into the side streets around it.
 */
export const AREA_SNAP_M = 2
/** District border band. */
export const BORDER_M = 30
/** Data older than this many months is stale. */
export const STALE_MONTHS = 12
/**
 * A pin inside the city outline but in no district polygon within this distance of a
 * district takes that district: the simplified polygons leave slivers up to ~3.3 m wide
 * along 18 km of borders (sceptic 2.3). Farther away it is a real no-district area.
 */
export const GAP_M = 5

const FORI_ID = 'fori'

// ---------------------------------------------------------------------------
// Geometry helpers.

type BBox = [minX: number, minY: number, maxX: number, maxY: number]

/** A short piece of a line with its bbox, so most pieces are skipped before turf runs. */
interface Chunk {
  owner: number
  bbox: BBox
  line: Feature<LineString>
}

const CHUNK_SEGMENTS = 16
// Metres → degrees with margin: latitude is fixed; longitude uses cos(48°), a bit north
// of Budapest, so the expanded bbox is never too small.
// 111 000 m per degree is below turf's 111 195, and BBOX_PAD_M covers the great-circle
// bulge of long east–west segments beyond their vertex bbox (sceptic 2.3, claim f).
const M_PER_DEG_LAT = 111_000
const M_PER_DEG_LON = 111_000 * Math.cos((48 * Math.PI) / 180)
const BBOX_PAD_M = 0.5

function bboxOf(coords: Position[]): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

function polygonBBox(g: Polygon | MultiPolygon): BBox {
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
  return bboxOf(rings.flat())
}

function nearBBox(b: BBox, x: number, y: number, m: number): boolean {
  const dx = (m + BBOX_PAD_M) / M_PER_DEG_LON
  const dy = (m + BBOX_PAD_M) / M_PER_DEG_LAT
  return x >= b[0] - dx && x <= b[2] + dx && y >= b[1] - dy && y <= b[3] + dy
}

function chunkLine(owner: number, coords: Position[], out: Chunk[]): void {
  for (let i = 0; i < coords.length - 1; i += CHUNK_SEGMENTS) {
    const part = coords.slice(i, i + CHUNK_SEGMENTS + 1)
    if (part.length < 2) continue
    out.push({ owner, bbox: bboxOf(part), line: lineString(part) })
  }
}

function polygonRings(g: Polygon | MultiPolygon): Position[][] {
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
}

/** Even-odd test against a set of closed rings (outer and inner rings, several parts). */
function insideRings(x: number, y: number, rings: Position[][]): boolean {
  let inside = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]
      const [xj, yj] = r[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** Nearest distance in metres from `pt` to each owner's chunks within `maxM`. */
function distancesWithin(chunks: Chunk[], pt: Feature<Point>, maxM: number): Map<number, number> {
  const [x, y] = pt.geometry.coordinates
  const out = new Map<number, number>()
  for (const c of chunks) {
    if (!nearBBox(c.bbox, x, y, maxM)) continue
    const d = pointToLineDistance(pt, c.line, { units: 'meters' })
    if (d > maxM) continue
    const prev = out.get(c.owner)
    if (prev === undefined || d < prev) out.set(c.owner, d)
  }
  return out
}

// ---------------------------------------------------------------------------
// Rule helpers.

const RANK: Record<Confidence, number> = { biztos: 2, valószínű: 1, bizonytalan: 0 }

function lowest(...cs: Confidence[]): Confidence {
  return cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
}

/** True when `verifiedOn` (YYYY-MM-DD) is more than STALE_MONTHS before `today`. */
export function isStale(verifiedOn: string, today: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(verifiedOn)
  if (!m || Number.isNaN(today.getTime())) return true
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return true
  // Calendar dates in local (Budapest) time; Date.UTC only serves as a day counter.
  const limit = Date.UTC(y, mo - 1 + STALE_MONTHS, d)
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return t > limit
}

const round1 = (d: number) => Math.round(d * 10) / 10
const roadKey = (annex: number, row: string) => `${annex}/${row}`

// ---------------------------------------------------------------------------

export function createResolver(data: ResolverData): Resolver {
  const { districts, roads, authorities } = data

  const byId = new Map(authorities.authorities.map((a) => [a.id, a]))
  const ruleByDistrict = new Map(authorities.districtRules.map((r) => [r.district, r]))
  const auth = (id: string | null | undefined): Authority | undefined => (id ? byId.get(id) : undefined)
  const fori = byId.get(FORI_ID)
  if (!fori) throw new Error('authorities.json has no "fori" record')

  const cityFeature: Feature<Polygon | MultiPolygon> = { type: 'Feature', properties: {}, geometry: districts.budapest }
  const cityBBox = polygonBBox(districts.budapest)

  const districtFeatures = districts.features
  const districtBBoxes = districtFeatures.map((f) => polygonBBox(f.geometry))
  const borderChunks: Chunk[] = []
  districtFeatures.forEach((f, i) => {
    for (const ring of polygonRings(f.geometry)) chunkLine(i, ring, borderChunks)
  })

  const roadFeatures = roads.features
  const roadChunks: Chunk[] = []
  const areaChunks: Chunk[] = []
  const areas: { owner: number; rings: Position[][]; bbox: BBox }[] = []
  roadFeatures.forEach((f, i) => {
    // Tunnels are underground: a pin above one (e.g. Szent György tér over the Alagút) is
    // not on the road (sceptic 2.3).
    if (f.properties.kind === 'tunnel') return
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    if (f.properties.area === true) {
      areas.push({ owner: i, rings: lines, bbox: bboxOf(lines.flat()) })
      for (const l of lines) chunkLine(i, l, areaChunks)
      return
    }
    for (const l of lines) chunkLine(i, l, roadChunks)
  })

  /** Capital roads within the snap distance, plus areas the pin is in or right next to. */
  const capitalRoadDistances = (pt: Feature<Point>, x: number, y: number): Map<number, number> => {
    const out = distancesWithin(roadChunks, pt, ROAD_SNAP_M)
    const put = (i: number, d: number) => {
      const prev = out.get(i)
      if (prev === undefined || d < prev) out.set(i, d)
    }
    for (const [i, d] of distancesWithin(areaChunks, pt, AREA_SNAP_M)) put(i, d)
    for (const a of areas) if (nearBBox(a.bbox, x, y, 0) && insideRings(x, y, a.rings)) put(a.owner, 0)
    return out
  }

  const roadRef = (i: number, d: number): RoadRef => {
    const p = roadFeatures[i].properties
    return { annex: p.annex, row: p.row, name: p.name, section: p.section ?? null, kind: p.kind, distanceM: round1(d) }
  }

  /** Builds the alternatives list: primary excluded, deduped by id, police last. */
  const alternatives = (primary: Authority, items: [AlternativeRole, Authority | undefined][]): Alternative[] => {
    const seen = new Set([primary.id])
    const out: Alternative[] = []
    for (const [role, a] of items) {
      if (!a || seen.has(a.id)) continue
      seen.add(a.id)
      out.push({ role, authority: a })
    }
    return out
  }

  return function resolve(ll: LatLon, opts: ResolveOptions): Resolution {
    const x = ll.lon
    const y = ll.lat
    const pt = point([x, y])

    // 1. City outline.
    if (!nearBBox(cityBBox, x, y, 0) || !booleanPointInPolygon(pt, cityFeature)) return { kind: 'outside' }

    // 2. District.
    let di = -1
    for (let i = 0; i < districtFeatures.length; i++) {
      if (nearBBox(districtBBoxes[i], x, y, 0) && booleanPointInPolygon(pt, districtFeatures[i])) {
        di = i
        break
      }
    }

    if (di < 0) {
      // A sliver between simplified polygons: take the nearest district.
      let gd = Infinity
      for (const [i, d] of distancesWithin(borderChunks, pt, GAP_M)) {
        if (d < gd) {
          gd = d
          di = i
        }
      }
    }

    if (di < 0) {
      // In v1 the only no-district area is Margit-sziget and the channels around it.
      const area = authorities.noDistrictAreas[0]
      const primary = auth(area?.primaryId) ?? fori
      const stale = isStale(primary.verifiedOn, opts.today) || (area ? isStale(area.verifiedOn, opts.today) : false)
      return {
        kind: 'resolved',
        district: null,
        districtRoman: null,
        primary,
        primaryRole: 'fori',
        alternatives: alternatives(primary, [['police', auth(area?.policeId)]]),
        reason: { code: 'no-district', areaName: area?.name ?? '' },
        confidence: stale ? 'bizonytalan' : 'valószínű',
        nearBorder: null,
        stale,
      }
    }

    const dProps = districtFeatures[di].properties
    const rule = ruleByDistrict.get(dProps.district)
    const districtBody = rule?.ownBody ? auth(rule.primaryId) : undefined
    const police = auth(rule?.policeId)

    // Near border: own boundary within BORDER_M; neighbour = nearest other district within BORDER_M.
    let nearBorder: NearBorder | null = null
    let neighbourBody: Authority | undefined
    let neighbourDistrict: number | null = null
    const borderDist = distancesWithin(borderChunks, pt, BORDER_M)
    const own = borderDist.get(di)
    if (own !== undefined) {
      let ni = -1
      let nd = Infinity
      for (const [i, d] of borderDist) {
        if (i !== di && d < nd) {
          ni = i
          nd = d
        }
      }
      if (ni >= 0) {
        const np = districtFeatures[ni].properties
        nearBorder = { district: np.district, roman: np.roman, distanceM: round1(own), otherSidePrimaryId: null }
        neighbourDistrict = np.district
        const nRule = ruleByDistrict.get(np.district)
        neighbourBody = nRule?.ownBody ? auth(nRule.primaryId) : undefined
      } else {
        nearBorder = { district: null, roman: null, distanceM: round1(own), otherSidePrimaryId: null }
      }
    }

    // 3. Capital roads.
    const roadDist = capitalRoadDistances(pt, x, y)
    const dMin = roadDist.size > 0 ? Math.min(...roadDist.values()) : Infinity
    const candidates = [...roadDist].filter(([, d]) => d <= dMin + ROAD_TIE_M).sort((a, b) => a[1] - b[1])
    const edge = dMin > ROAD_EDGE_M

    /**
     * Steps 3 and 4 for one district's rule and body. Run for the pin's own district and,
     * near a border, for the neighbour, so the card can tell who is responsible on the far
     * side of the line (a capital road is FÖRI's on both sides, D21).
     */
    const decide = (dRule: DistrictRule | undefined, body: Authority | undefined): Decision => {
      if (candidates.length > 0) {
        const listed = new Map((dRule?.districtActsOn ?? []).map((e) => [roadKey(e.annex, e.row), e]))
        const entryOf = (i: number) => listed.get(roadKey(roadFeatures[i].properties.annex, roadFeatures[i].properties.row))
        // The decree lists a border street once per district (Lehel utca, Lövölde tér): a tied
        // row of the same name from the other district must not defeat this district's list.
        const listedNames = new Set(candidates.filter(([i]) => entryOf(i)).map(([i]) => roadFeatures[i].properties.name))
        const unlisted = candidates.find(([i]) => !entryOf(i) && !listedNames.has(roadFeatures[i].properties.name))
        const narrower = candidates.find(([i]) => entryOf(i)?.scope === 'narrower')

        if (unlisted || !body) {
          // FÖRI path (also when a listed road lies in a district with no body of its own).
          // The edge flag is set from the unrounded distance, so the card never re-derives it.
          const [ri, rd] = unlisted ?? candidates[0]
          const p = roadFeatures[ri].properties
          const road = roadRef(ri, rd)
          let reason: Reason
          if (p.kind === 'square') reason = { code: 'capital-square', road, edge }
          else if (p.partial && (!p.cutApplied || p.cutApprox)) reason = { code: 'capital-road-unplaced', road, edge }
          else if (edge) reason = { code: 'capital-road-edge', road }
          else reason = { code: 'capital-road', road }
          return { primary: fori, primaryRole: 'fori', reason, confidence: reason.code === 'capital-road' ? 'valószínű' : 'bizonytalan' }
        }
        if (narrower) {
          const [ri, rd] = narrower
          return {
            primary: fori,
            primaryRole: 'fori',
            reason: { code: 'district-acts-on-partial', road: roadRef(ri, rd), sectionText: entryOf(ri)?.text ?? '' },
            confidence: 'bizonytalan',
          }
        }
        const [ri, rd] = candidates.find(([i]) => entryOf(i)) ?? candidates[0]
        const p = roadFeatures[ri].properties
        // SPEC 4.2.6: squares and sections whose ends were not placed stay bizonytalan.
        const vague = p.kind === 'square' || (p.partial && (!p.cutApplied || p.cutApprox))
        return {
          primary: body,
          primaryRole: 'district',
          reason: { code: 'district-acts-on', road: roadRef(ri, rd) },
          confidence: edge || vague ? 'bizonytalan' : 'valószínű',
        }
      }
      // 4. District street.
      if (body) return { primary: body, primaryRole: 'district', reason: { code: 'district-street' }, confidence: 'biztos' }
      return { primary: fori, primaryRole: 'fori', reason: { code: 'no-own-body' }, confidence: 'valószínű' }
    }

    const decision = decide(rule, districtBody)
    const { primary, primaryRole, reason } = decision
    let confidence = decision.confidence
    if (nearBorder && neighbourDistrict !== null) {
      nearBorder.otherSidePrimaryId = decide(ruleByDistrict.get(neighbourDistrict), neighbourBody).primary.id
    }

    // 5. Alternatives.
    const alts =
      primaryRole === 'district'
        ? alternatives(primary, [
            ['neighbour', neighbourBody],
            ['fori', fori],
            ['police', police],
          ])
        : alternatives(primary, [
            ['district', districtBody],
            ['neighbour', neighbourBody],
            ['police', police],
          ])

    // 6. Confidence factors.
    const stale = isStale(primary.verifiedOn, opts.today) || (rule ? isStale(rule.verifiedOn, opts.today) : false)
    if (nearBorder) confidence = lowest(confidence, 'valószínű')
    if (stale) confidence = 'bizonytalan'

    return {
      kind: 'resolved',
      district: dProps.district,
      districtRoman: dProps.roman,
      primary,
      primaryRole,
      alternatives: alts,
      reason,
      confidence,
      nearBorder,
      stale,
    }
  }
}
