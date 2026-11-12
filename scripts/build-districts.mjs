// Builds src/data/districts.geojson from OpenStreetMap (Overpass, build-time only).
// Usage: node scripts/build-districts.mjs [--refresh]
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import osmtogeojson from 'osmtogeojson'
import simplify from '@turf/simplify'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheFile = join(root, 'scripts', '.cache', 'districts-overpass.json')
const budapestCacheFile = join(root, 'scripts', '.cache', 'budapest-overpass.json')
const BUDAPEST_RELATION = 37244 // Budapest, admin_level=6
const outFile = join(root, 'src', 'data', 'districts.geojson')
const TOLERANCE = 0.00004 // degrees, about 4.5 m
const ROMAN = [
  '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII',
]
const QUERY = `[out:json][timeout:180];
area["name"="Budapest"]["boundary"="administrative"]["admin_level"="6"]->.b;
rel(area.b)["boundary"="administrative"]["admin_level"="9"];
out geom;`

function fail(msg) {
  console.error('FAILED: ' + msg)
  process.exit(1)
}

const BUDAPEST_QUERY = `[out:json][timeout:180];
rel(${BUDAPEST_RELATION})["boundary"="administrative"]["admin_level"="6"];
out geom;`

async function fetchRaw(query) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': 'ParkStop-data-build/0.1',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!res.ok) fail(`Overpass HTTP ${res.status}`)
  return res.text()
}

// One request at a time (never parallel); cached unless --refresh.
async function loadRaw(file, query) {
  if (!process.argv.includes('--refresh') && existsSync(file)) {
    console.log(`Using cached ${file}`)
    return readFile(file, 'utf8')
  }
  const text = await fetchRaw(query)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, text)
  console.log(`Fetched and cached ${file}`)
  return text
}
const gj = osmtogeojson(JSON.parse(await loadRaw(cacheFile, QUERY)))
const budapestGj = osmtogeojson(JSON.parse(await loadRaw(budapestCacheFile, BUDAPEST_QUERY)))

function districtNumber(tags) {
  const m = /^([IVX]+)\.\s*kerület/.exec(tags.name ?? '')
  return m ? ROMAN.indexOf(m[1]) : -1
}

function ringsOf(g) {
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
}

function simplified(geometry) {
  const s = simplify(
    { type: 'Feature', properties: {}, geometry },
    { tolerance: TOLERANCE, highQuality: true, mutate: false },
  )
  return { type: s.geometry.type, coordinates: roundCoords(s.geometry.coordinates) }
}

// An interior point of a district: scan a grid over its bounding box.
function interiorPoint(feature) {
  const pts = ringsOf(feature.geometry).flat()
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  for (let n = 2; n <= 64; n *= 2) {
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        const p = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n]
        if (booleanPointInPolygon(p, feature)) return p
      }
    }
  }
  fail(`no interior point found for district ${feature.properties.district}`)
}

const round = (n) => Math.round(n * 1e6) / 1e6
function roundCoords(c) {
  return typeof c[0] === 'number' ? c.map(round) : c.map(roundCoords)
}

let rawVertices = 0
let outVertices = 0
const features = []
for (const f of gj.features) {
  if (!f.id?.startsWith('relation/')) continue
  if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') continue
  const district = districtNumber(f.properties)
  if (district < 1) fail(`unrecognised district name: ${f.properties.name}`)
  rawVertices += ringsOf(f.geometry).reduce((s, r) => s + r.length, 0)
  const geometry = simplified(f.geometry)
  outVertices += ringsOf(geometry).reduce((n, r) => n + r.length, 0)
  features.push({
    type: 'Feature',
    properties: {
      district,
      roman: ROMAN[district],
      name: f.properties.name,
      osmRelation: Number(f.id.slice('relation/'.length)),
    },
    geometry,
  })
}
features.sort((a, b) => a.properties.district - b.properties.district)

if (features.length !== 23) fail(`expected 23 districts, got ${features.length}`)
features.forEach((f, i) => {
  if (f.properties.district !== i + 1) fail(`district numbers not 1..23 at index ${i}`)
  for (const ring of ringsOf(f.geometry)) {
    const a = ring[0]
    const b = ring[ring.length - 1]
    if (ring.length < 4 || a[0] !== b[0] || a[1] !== b[1]) {
      fail(`district ${i + 1} has an invalid or unclosed ring`)
    }
  }
})

// Budapest outline; every district must lie inside it.
const bf = budapestGj.features.find((f) => f.id === `relation/${BUDAPEST_RELATION}`)
if (!bf || (bf.geometry?.type !== 'Polygon' && bf.geometry?.type !== 'MultiPolygon')) {
  fail('Budapest outline missing or not a polygon')
}
const budapest = simplified(bf.geometry)
for (const ring of ringsOf(budapest)) {
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (ring.length < 4 || a[0] !== b[0] || a[1] !== b[1]) fail('Budapest outline has an unclosed ring')
}
const budapestFeature = { type: 'Feature', properties: {}, geometry: budapest }
for (const f of features) {
  const p = interiorPoint(f)
  if (!booleanPointInPolygon(p, budapestFeature)) {
    fail(`district ${f.properties.district} representative point is outside the Budapest outline`)
  }
}

const out = {
  type: 'FeatureCollection',
  source: 'OpenStreetMap contributors (ODbL)',
  license: 'ODbL-1.0',
  generatedOn: new Date().toISOString().slice(0, 10),
  tolerance: TOLERANCE,
  budapest,
  features,
}
const text = JSON.stringify(out)
await writeFile(outFile, text + '\n')
console.log(
  `Wrote ${outFile}: ${features.length} districts, vertices ${rawVertices} -> ${outVertices}, ${(text.length / 1024).toFixed(1)} KB`,
)
