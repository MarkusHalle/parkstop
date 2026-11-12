// Contract of the authority resolver (SPEC 4.2, D21, roadmap 2.3). Pure types: the
// resolver returns codes and numbers; the UI turns them into Hungarian text from hu.ts.

export type Confidence = 'biztos' | 'valószínű' | 'bizonytalan'

export interface LatLon {
  lat: number
  lon: number
}

/** One record of `src/data/authorities.json` → `authorities[]`. */
export interface Authority {
  id: string
  name: string
  type: 'district' | 'fori' | 'police'
  districts: number[]
  email: string | null
  emailNote?: string
  phone?: string | null
  phoneNote?: string
  web?: string
  address?: string
  sourceUrl: string
  verifiedOn: string
  /** The body asks for reports by phone (X. district, SPEC 4.2): show the phone first. */
  prefersPhone?: boolean
}

/** The capital-managed road the pin snapped to (`capital-roads.geojson` feature). */
export interface RoadRef {
  annex: number
  row: string
  name: string
  /** Decree section text, e.g. "Szépvölgyi út – Pitypang utca"; null for a whole road. */
  section: string | null
  kind: string
  /** Distance from the pin to the road geometry, metres, rounded to 0.1 m. */
  distanceM: number
}

export type Reason =
  | { code: 'district-street' }
  | { code: 'no-own-body' }
  | { code: 'capital-road'; road: RoadRef }
  /** Nearest capital road is 8–15 m away (owner's choice 2026-11-12): FÖRI, but bizonytalan. */
  | { code: 'capital-road-edge'; road: RoadRef }
  /** `partial && (!cutApplied || cutApprox)`: section ends not placed on the map. */
  | { code: 'capital-road-unplaced'; road: RoadRef }
  /** `kind === 'square'` (or another area-like kind): squares and parks are bizonytalan. */
  | { code: 'capital-square'; road: RoadRef }
  /** Road section listed in the district's `districtActsOn` with scope "full". */
  | { code: 'district-acts-on'; road: RoadRef }
  /** Listed with scope "narrower": FÖRI stays primary, district first alternative. */
  | { code: 'district-acts-on-partial'; road: RoadRef; sectionText: string }
  /** Inside Budapest, in no district (Margit-sziget, `noDistrictAreas`). */
  | { code: 'no-district'; areaName: string }

export type AlternativeRole = 'district' | 'fori' | 'neighbour' | 'police'

export interface Alternative {
  role: AlternativeRole
  authority: Authority
}

export interface NearBorder {
  /** Neighbouring district within 30 m, or null when the nearby border is the city edge. */
  district: number | null
  roman: string | null
  distanceM: number
}

export type Resolution =
  | { kind: 'outside' }
  | {
      kind: 'resolved'
      district: number | null
      districtRoman: string | null
      primary: Authority
      primaryRole: 'district' | 'fori'
      /** In display order, primary excluded; police always last when known. */
      alternatives: Alternative[]
      reason: Reason
      confidence: Confidence
      nearBorder: NearBorder | null
      /** The primary authority's or the district rule's `verifiedOn` is older than 12 months. */
      stale: boolean
    }

export interface ResolveOptions {
  /** "Today" for the 12-month staleness rule; injected so the resolver stays pure. */
  today: Date
}
