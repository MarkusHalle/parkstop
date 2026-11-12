// Picks the 30 resolver test points (roadmap 1.7, SPEC 11.1) from OSM and the bundled data.
// Run from the repo root: node scripts/make-test-points.mjs
// Writes tests/fixtures/authority-test-points.json. A human reviews the result; after that the
// fixture is the reference and this script is only rerun on purpose (it needs scripts/.cache/).
import { readFileSync, writeFileSync } from 'node:fs'
import pip from '@turf/boolean-point-in-polygon'
import p2l from '@turf/point-to-line-distance'
import { point, lineString } from '@turf/helpers'

const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV',
  'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII']
const D = JSON.parse(readFileSync('src/data/districts.geojson', 'utf8'))
const G = JSON.parse(readFileSync('src/data/capital-roads.geojson', 'utf8'))
const O = JSON.parse(readFileSync('scripts/.cache/capital-roads-overpass.json', 'utf8'))

const round = (x) => Math.round(x * 1e6) / 1e6
const district = (ll) => D.features.find((f) => pip(point(ll), f))?.properties.district ?? null
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates)
const parts = G.features.flatMap((f) => lines(f.geometry).map((c) => lineString(c)))
const minRoad = (ll) => Math.min(...parts.map((l) => p2l(point(ll), l, { units: 'meters' })))
function borderDist(ll, d) {
  const f = D.features.find((x) => x.properties.district === d)
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  return Math.min(...polys.flat().map((ring) => p2l(point(ll), lineString(ring), { units: 'meters' })))
}
const mid = (c) => c[Math.floor(c.length / 2)]
const police = (d) => (d === null ? null : d === 20 || d === 23 ? 'police-20-23' : `police-${String(d).padStart(2, '0')}`)
const body = (d) => `district-${String(d).padStart(2, '0')}`
const feat = (id) => G.features.find((f) => `${f.properties.annex}/${f.properties.row}` === id)
function onFeature(id) {
  const f = feat(id)
  if (!f) throw new Error(`no capital-road feature ${id}`)
  const longest = lines(f.geometry).sort((a, b) => b.length - a.length)[0]
  return { f, ll: mid(longest) }
}

const pts = []
function add(category, label, ll, expected, why) {
  pts.push({ id: `P${String(pts.length + 1).padStart(2, '0')}`, category, label, lat: round(ll[1]), lon: round(ll[0]), expected, why })
}

// A — ordinary district streets (10)
const capNames = new Set(G.features.map((f) => f.properties.name))
const ways = O.elements
  .filter((e) => e.type === 'way' && e.tags?.highway === 'residential' && e.tags?.name && e.geometry?.length >= 6)
  .sort((a, b) => a.id - b.id)
for (const d of [1, 2, 3, 4, 9, 12, 14, 16, 19, 22]) {
  const w = ways.find((w) => {
    if (capNames.has(w.tags.name)) return false
    const g = mid(w.geometry)
    const ll = [g.lon, g.lat]
    return district(ll) === d && minRoad(ll) > 60 && borderDist(ll, d) > 120
  })
  const g = mid(w.geometry)
  add('district-street', `${w.tags.name} (${R[d - 1]}.)`, [g.lon, g.lat],
    { district: d, insideBudapest: true, capitalRoad: null, primaryId: body(d), policeId: police(d), confidence: 'biztos' },
    `Residential street not named in Decree 432/2012, over 60 m from any capital road and over 120 m from the district border (OSM way ${w.id}).`)
}

// B — capital roads (8): FÖRI unless on a districtActsOn list
for (const id of ['2/312', '2/332', '1/2', '2/406', '2/545', '2/134', '1/3.5', '2/71a']) {
  const { f, ll } = onFeature(id)
  const d = district(ll)
  const p = f.properties
  const low = p.kind === 'square' || (p.partial && (!p.cutApplied || p.cutApprox))
  add('capital-road', `${p.name} (${d ? R[d - 1] + '.' : 'kerület nélkül'})`, ll,
    { district: d, insideBudapest: true, capitalRoad: id, primaryId: 'fori', policeId: police(d), confidence: low ? 'bizonytalan' : 'valószínű' },
    `On decree row ${id} (${p.section ?? 'whole road'}), not on a districtActsOn list, so FÖRI (D21).${low ? ' Section ends approximate, so bizonytalan.' : ''}`)
}

// C — VI/VII agreement lists (3)
for (const [id, dist, full] of [['2/329', 6, true], ['2/344', 7, true], ['2/346', 7, false]]) {
  const { f, ll } = onFeature(id)
  add('district-acts-on', `${f.properties.name} (${R[dist - 1]}.)`, ll,
    { district: district(ll), insideBudapest: true, capitalRoad: id, primaryId: full ? body(dist) : 'fori', policeId: police(dist), confidence: full ? 'valószínű' : 'bizonytalan' },
    full
      ? `Decree row ${id} is on the ${R[dist - 1]}. district's agreement list, so the district body is primary (D21).`
      : `Decree row ${id} is only partly on the VII list (Dohány utca – Rákóczi út): FÖRI stays primary, district body first alternative, bizonytalan.`)
}

// D — near a district border (2): residential vertex 8–25 m from the border, over 40 m from capital roads
for (const w of ways) {
  if (pts.filter((p) => p.category === 'border').length === 2) break
  for (const g of w.geometry) {
    const ll = [g.lon, g.lat]
    const d = district(ll)
    if (!d || pts.some((p) => p.category === 'border' && p.expected.district === d)) continue
    const b = borderDist(ll, d)
    if (b > 8 && b < 25 && minRoad(ll) > 40) {
      add('border', `${w.tags.name} (${R[d - 1]}., kerülethatár mellett)`, ll,
        { district: d, insideBudapest: true, capitalRoad: null, primaryId: body(d), policeId: police(d), confidence: 'valószínű' },
        `${Math.round(b)} m from the district border (inside the 30 m band), not near a capital road (OSM way ${w.id}).`)
      break
    }
  }
}

// E — in Budapest but in no district (2)
add('no-district', 'Margitsziget, a sziget közepe', [19.048, 47.527],
  { district: null, insideBudapest: true, capitalRoad: null, primaryId: 'fori', policeId: null, confidence: 'valószínű' },
  'Inside Budapest, in no district (Mötv. 22. § (4)) → FÖRI (D21). No police alternative yet (O8).')
add('no-district', 'Duna, a Margitsziget és az óbudai part között', [19.045, 47.53],
  { district: null, insideBudapest: true, capitalRoad: null, primaryId: 'fori', policeId: null, confidence: 'valószínű' },
  'River channel beside Margit-sziget: inside Budapest, in no district → FÖRI.')

// F — outside Budapest (3)
for (const [label, ll] of [['Budaörs, városközpont', [18.958, 47.461]], ['Budakeszi', [18.93, 47.51]], ['Szentendre, Fő tér', [19.075, 47.669]]]) {
  add('outside', label, ll,
    { district: null, insideBudapest: false, capitalRoad: null, primaryId: null, policeId: null, confidence: null },
    'Outside the Budapest outline → "outside" result.')
}

// G — a square, H — an uncut partial section
{
  const squares = G.features.filter((x) => x.properties.kind === 'square')
  const f = squares.find((x) => x.properties.name === 'Széll Kálmán tér') ?? squares[0]
  const id = `${f.properties.annex}/${f.properties.row}`
  const { ll } = onFeature(id)
  const d = district(ll)
  add('square', `${f.properties.name} (${R[d - 1]}.)`, ll,
    { district: d, insideBudapest: true, capitalRoad: id, primaryId: 'fori', policeId: police(d), confidence: 'bizonytalan' },
    'A square on a capital-road row: squares stay "bizonytalan" (SPEC 4.2 step 6).')
}
{
  const { f, ll } = onFeature('2/179')
  const d = district(ll)
  add('partial-uncut', `${f.properties.name} (${R[d - 1]}.)`, ll,
    { district: d, insideBudapest: true, capitalRoad: '2/179', primaryId: 'fori', policeId: police(d), confidence: 'bizonytalan' },
    'Section listed between two junctions that could not be placed on the map (cutApplied false) → bizonytalan.')
}

const out = {
  generatedOn: new Date().toISOString().slice(0, 10),
  confirmedByOwner: null,
  devNote: 'Roadmap 1.7: resolver test points (SPEC 11.1). `expected` is what the resolver must return (SPEC 4.2, D21). Picked by scripts/make-test-points.mjs, reviewed by a human; tests/data/test-points.test.ts checks the bundled data still agrees.',
  points: pts,
}
writeFileSync('tests/fixtures/authority-test-points.json', JSON.stringify(out, null, 2) + '\n')
console.log(`${pts.length} points written`)
for (const p of pts) console.log(p.id, p.category.padEnd(16), p.label.padEnd(48), `${p.lat},${p.lon}`, '→', p.expected.primaryId, p.expected.confidence)
