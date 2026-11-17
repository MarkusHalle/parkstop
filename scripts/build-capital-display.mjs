// Builds src/data/capital-roads-display.json: how the map draws the capital-road band from
// zoom 14 up (roadmap 6.17, D55). Display only; the resolver keeps reading capital-roads.geojson.
//
// Usage:
//   node scripts/build-capital-display.mjs           writes the file from the current tiles
//   node scripts/build-capital-display.mjs --check   data check: exits non-zero when the
//       shipped file no longer fits the current tiles (a recoloured feature is gone or no
//       longer lies wholly on a capital road, e.g. a way split or merged in OSM since)
//
// Our own band line never sat exactly on OpenFreeMap's roads. So where a base-map road feature
// lies wholly on the capital roads, the map recolours that feature itself (by feature id), and
// only the rest stays our own line ("ends": section ends cut inside a road, links, roads the
// tiles merge with non-capital ways). OpenFreeMap merges consecutive OSM ways into one feature
// at z14 and keeps one way's id, so a feature id is not a way: each feature is checked by its
// geometry, in every z14 tile it appears in (the map overzooms z14 tiles above 14).
//
// Tiles come from tiles.openfreemap.org, the map's own host (SPEC 10): the z14 tiles the
// capital roads touch plus one ring around them, cached per tile version under
// scripts/.cache/tiles/, four requests at a time.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROADS = join(root, 'src', 'data', 'capital-roads.geojson')
const OUT = join(root, 'src', 'data', 'capital-roads-display.json')
const TILEJSON = 'https://tiles.openfreemap.org/planet'
const USER_AGENT = 'ParkStop-data-build/0.1'
const Z = 14
/** A base-map feature counts as capital when every point of it is this close to a capital road. */
const NEAR = 4 // m: our lines are simplified by ≤ 1.7 m, z14 tile coordinates step 0.6 m
const SAMPLE = 3 // m between checked points along a feature
const PIECE = 4 // m: fallback pieces are decided at this length
const END_NEAR = 3 // m: a stretch of another base-map feature this close to a capital road is drawn
const MIN_RUN = 6 // m: shorter stretches are crossing streets touching the road, not road
const SEAM = 3 // m past the tile edge, so the pieces of neighbouring tiles meet
// Base-map classes that are carriageways. Rail, ferries, piers, paths (a sidewalk mapped beside
// a narrow street lies within a few metres of it) and motorways (never capital roads, decree
// §1 (2)) are not recoloured.
const ROAD_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track', 'busway', 'raceway'])

// --- minimal Mapbox Vector Tile reader ---------------------------------------------------
function* fields(buf, start, end) {
  let i = start
  const varint = () => {
    let v = 0
    let shift = 0
    for (;;) {
      const b = buf[i++]
      v += (b & 0x7f) * 2 ** shift
      if (b < 0x80) return v
      shift += 7
    }
  }
  while (i < end) {
    const key = varint()
    const tag = Math.floor(key / 8)
    const type = key % 8
    if (type === 0) yield { tag, value: varint() }
    else if (type === 2) {
      const len = varint()
      yield { tag, start: i, end: i + len }
      i += len
    } else if (type === 1) yield { tag, start: (i += 8) - 8, end: i }
    else if (type === 5) yield { tag, start: (i += 4) - 4, end: i }
    else throw new Error(`unsupported wire type ${type}`)
  }
}
/** Packed varints are not tagged; read them one by one. */
function varints(buf, start, end) {
  const out = []
  let i = start
  while (i < end) {
    let v = 0
    let shift = 0
    for (;;) {
      const b = buf[i++]
      v += (b & 0x7f) * 2 ** shift
      if (b < 0x80) break
      shift += 7
    }
    out.push(v)
  }
  return out
}
const zigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2)
function value(buf, f) {
  for (const v of fields(buf, f.start, f.end)) {
    if (v.tag === 1) return new TextDecoder().decode(buf.subarray(v.start, v.end))
    if (v.tag === 2) return new DataView(buf.buffer, buf.byteOffset + v.start, 4).getFloat32(0, true)
    if (v.tag === 3) return new DataView(buf.buffer, buf.byteOffset + v.start, 8).getFloat64(0, true)
    if (v.tag === 4 || v.tag === 5) return v.value
    if (v.tag === 6) return zigzag(v.value)
    if (v.tag === 7) return Boolean(v.value)
  }
  return null
}
/** Line features of one layer: { id, props, parts: [[x, y] tile coordinates][], extent }. */
export function readLines(buf, layerName) {
  for (const layer of fields(buf, 0, buf.length)) {
    if (layer.tag !== 3) continue
    let name = null
    let extent = 4096
    const feats = []
    const keys = []
    const vals = []
    for (const f of fields(buf, layer.start, layer.end)) {
      if (f.tag === 1) name = new TextDecoder().decode(buf.subarray(f.start, f.end))
      else if (f.tag === 2) feats.push(f)
      else if (f.tag === 3) keys.push(new TextDecoder().decode(buf.subarray(f.start, f.end)))
      else if (f.tag === 4) vals.push(f)
      else if (f.tag === 5) extent = f.value
    }
    if (name !== layerName) continue
    const out = []
    for (const feat of feats) {
      let id = null
      let type = 0
      let tags = []
      let geom = []
      for (const f of fields(buf, feat.start, feat.end)) {
        if (f.tag === 1) id = f.value
        else if (f.tag === 2) tags = varints(buf, f.start, f.end)
        else if (f.tag === 3) type = f.value
        else if (f.tag === 4) geom = varints(buf, f.start, f.end)
      }
      if (type !== 2 || id === null) continue
      const props = {}
      for (let i = 0; i < tags.length; i += 2) props[keys[tags[i]]] = value(buf, vals[tags[i + 1]])
      const parts = []
      let x = 0
      let y = 0
      for (let i = 0; i < geom.length; ) {
        const cmd = geom[i] & 7
        const count = geom[i] >> 3
        i++
        if (cmd === 7) continue
        for (let k = 0; k < count; k++) {
          x += zigzag(geom[i++])
          y += zigzag(geom[i++])
          if (cmd === 1) parts.push([[x, y]])
          else parts.at(-1).push([x, y])
        }
      }
      out.push({ id, props, parts, extent })
    }
    return out
  }
  return []
}

// --- local metric projection and a segment grid --------------------------------------------
const LAT0 = 47.5
const LON0 = 19.05
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const KY = 110574
const proj = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY]
const unproj = ([x, y]) => [Math.round((x / KX + LON0) * 1e6) / 1e6, Math.round((y / KY + LAT0) * 1e6) / 1e6]
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
class SegGrid {
  constructor(cell = 20) {
    this.cell = cell
    this.map = new Map()
  }
  add(a, b, data) {
    const c = this.cell
    for (let gx = Math.floor((Math.min(a[0], b[0]) - NEAR) / c); gx <= Math.floor((Math.max(a[0], b[0]) + NEAR) / c); gx++)
      for (let gy = Math.floor((Math.min(a[1], b[1]) - NEAR) / c); gy <= Math.floor((Math.max(a[1], b[1]) + NEAR) / c); gy++) {
        const k = `${gx},${gy}`
        if (!this.map.has(k)) this.map.set(k, [])
        this.map.get(k).push({ a, b, data })
      }
  }
  /** The closest segment within `max` metres of p, or null. */
  nearest(p, max = NEAR) {
    let best = null
    let bestD = max
    for (const s of this.map.get(`${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`) ?? []) {
      const d = segDist(p[0], p[1], s.a[0], s.a[1], s.b[0], s.b[1])
      if (d <= bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }
}
/** Points every `step` metres along a polyline (both ends included). */
function samples(line, step) {
  const out = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step))
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
  }
  return out
}

const lengthM = (l) => {
  let m = 0
  for (let i = 1; i < l.length; i++) m += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1])
  return m
}
/** Douglas–Peucker in metres. */
function simplify(line, tol) {
  if (line.length < 3) return line
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack = [[0, line.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    let best = -1
    let bestD = tol
    for (let k = i + 1; k < j; k++) {
      const d = segDist(line[k][0], line[k][1], line[i][0], line[i][1], line[j][0], line[j][1])
      if (d > bestD) {
        bestD = d
        best = k
      }
    }
    if (best >= 0) {
      keep[best] = 1
      stack.push([i, best], [best, j])
    }
  }
  return line.filter((_, k) => keep[k])
}

// --- tiles ---------------------------------------------------------------------------------
const tileOf = ([lon, lat]) => {
  const n = 2 ** Z
  const r = (lat * Math.PI) / 180
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)]
}
const tileToLonLat = (tx, ty, px, py, extent) => {
  const n = 2 ** Z
  const x = (tx + px / extent) / n
  const y = (ty + py / extent) / n
  return [x * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI]
}

async function main() {
  const check = process.argv.includes('--check')
  const roads = JSON.parse(await readFile(ROADS, 'utf8'))
  // Everything the band draws as a line: rows, display-only links, hand-placed roads. Squares
  // and areas keep their own fill.
  const coverLines = []
  for (const f of roads.features) {
    if (f.properties.area) continue
    const g = f.geometry
    for (const l of g.type === 'LineString' ? [g.coordinates] : g.coordinates) coverLines.push(l.map(proj))
  }
  const cover = new SegGrid()
  for (const l of coverLines) for (let i = 1; i < l.length; i++) cover.add(l[i - 1], l[i])

  const tiles = new Set()
  for (const f of roads.features) {
    const g = f.geometry
    for (const c of g.type === 'LineString' ? g.coordinates : g.coordinates.flat()) {
      const [x, y] = tileOf(c)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.add(`${x + dx}/${y + dy}`)
    }
  }
  const tj = await (await fetch(TILEJSON, { headers: { 'User-Agent': USER_AGENT } })).json()
  const template = tj.tiles[0]
  const version = /planet\/([^/]+)\//.exec(template)?.[1] ?? 'unknown'
  const cache = join(root, 'scripts', '.cache', 'tiles', version)
  await mkdir(cache, { recursive: true })

  // Per feature id: is it wholly on capital roads in every tile it appears in?
  const verdict = new Map()
  const apps = [] // every appearance of a road feature in a tile, sampled
  const roadParts = new SegGrid() // every base-map road, to give fallback pieces a class
  const queue = [...tiles]
  let fetched = 0
  const worker = async () => {
    while (queue.length) {
      const [tx, ty] = queue.pop().split('/').map(Number)
      const file = join(cache, `${Z}-${tx}-${ty}.pbf`)
      let buf
      if (existsSync(file)) buf = new Uint8Array(await readFile(file))
      else {
        const url = template.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty)
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
        buf = new Uint8Array(await res.arrayBuffer())
        await writeFile(file, buf)
        fetched++
      }
      for (const feat of readLines(buf, 'transportation')) {
        if (!ROAD_CLASSES.has(feat.props.class)) continue
        const e = feat.extent
        const unit = (40075016.7 * Math.cos((LAT0 * Math.PI) / 180)) / 2 ** Z / e // m per tile unit
        // The part inside the tile (plus a 3 m seam): the rest of the buffer belongs to the
        // neighbouring tile, which carries the same feature.
        const m = SEAM / unit
        const inTile = ([x, y]) => x >= -m && y >= -m && x <= e + m && y <= e + m
        const parts = []
        let all = true
        for (const p of feat.parts) {
          // A part that leaves the tile and comes back is two parts here.
          let cur = []
          for (const pt of samples(p, SAMPLE / unit)) {
            if (!inTile(pt)) {
              if (cur.length) parts.push(cur)
              cur = []
              continue
            }
            const q = proj(tileToLonLat(tx, ty, pt[0], pt[1], e))
            const near = cover.nearest(q)
            if (!near) all = false
            cur.push({ q, near: Boolean(near) && cover.nearest(q, END_NEAR) !== null })
          }
          if (cur.length) parts.push(cur)
          const full = p.map(([x, y]) => proj(tileToLonLat(tx, ty, x, y, e)))
          for (let i = 1; i < full.length; i++) roadParts.add(full[i - 1], full[i], feat.props)
        }
        if (!parts.length) continue
        verdict.set(feat.id, (verdict.get(feat.id) ?? true) && all)
        apps.push({ id: feat.id, props: feat.props, parts })
      }
    }
  }
  await Promise.all([1, 2, 3, 4].map(worker))
  const tileIds = [...verdict].filter(([, ok]) => ok).map(([id]) => id).sort((a, b) => a - b)
  const safe = new Set(tileIds)

  if (check) {
    const shipped = JSON.parse(await readFile(OUT, 'utf8'))
    const gone = shipped.tileIds.filter((id) => !verdict.has(id))
    const notCapital = shipped.tileIds.filter((id) => verdict.get(id) === false)
    console.log(`Tiles ${version} (file built on ${shipped.tiles}): ${tiles.size} z${Z} tiles (${fetched} fetched); ${shipped.tileIds.length} recoloured features, ${gone.length} gone from the tiles, ${notCapital.length} no longer wholly on capital roads.`)
    if (gone.length || notCapital.length) {
      console.error(`check FAILED: gone ${gone.slice(0, 20).join(', ')}${gone.length > 20 ? ' …' : ''}; not capital ${notCapital.slice(0, 20).join(', ')}${notCapital.length > 20 ? ' …' : ''}`)
      console.error('Rebuild with: npm run build:capital-display')
      process.exit(1)
    }
    return
  }

  const byStyle = new Map()
  const addLine = (props, line) => {
    const style = { class: props.class, ...(props.ramp === 1 ? { ramp: 1 } : {}), ...(props.brunnel ? { brunnel: props.brunnel } : {}) }
    const key = JSON.stringify(style)
    if (!byStyle.has(key)) byStyle.set(key, [])
    byStyle.get(key).push(simplify(line, 0.3).map(unproj))
  }
  const drawn = new SegGrid()
  const addDrawn = (pts) => {
    for (let i = 1; i < pts.length; i++) drawn.add(pts[i - 1], pts[i])
  }
  for (const a of apps) if (safe.has(a.id)) for (const p of a.parts) addDrawn(p.map((s) => s.q))
  // Own line, 1: the stretches of other base-map features that lie on a capital road (a
  // section end inside a road the tiles merged, a link across a junction), cut from the
  // feature's own geometry so they sit on the base road like the recoloured features.
  let fromTiles = 0
  for (const a of apps) {
    if (safe.has(a.id)) continue
    for (const p of a.parts) {
      let run = []
      const flush = () => {
        const line = run.map((s) => s.q)
        const len = lengthM(line)
        if (len >= MIN_RUN) {
          addLine(a.props, line)
          addDrawn(line)
          fromTiles += len
        }
        run = []
      }
      for (const s of p) {
        if (s.near) run.push(s)
        else flush()
      }
      flush()
    }
  }
  // Own line, 2: what no base-map feature covers (roads missing from the tiles), from our own
  // geometry, styled as the nearest base-map road.
  let fallback = 0
  let total = 0
  for (const l of coverLines) {
    const pts = samples(l, PIECE)
    let run = []
    let runProps = null
    const flush = () => {
      if (run.length >= 2) {
        addLine(runProps, run)
        fallback += lengthM(run)
      }
      run = []
    }
    for (let i = 1; i < pts.length; i++) {
      const mid = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2]
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (drawn.nearest(mid, END_NEAR)) {
        flush()
        continue
      }
      const props = roadParts.nearest(mid, 10)?.data ?? { class: 'minor' }
      if (run.length && JSON.stringify(props) !== JSON.stringify(runProps)) flush()
      if (!run.length) {
        run = [pts[i - 1]]
        runProps = props
      }
      run.push(pts[i])
    }
    flush()
  }
  const ends = {
    type: 'FeatureCollection',
    features: [...byStyle].map(([key, lines]) => ({
      type: 'Feature',
      properties: JSON.parse(key),
      geometry: { type: 'MultiLineString', coordinates: lines.map((l) => l.filter((c, i) => i === 0 || c[0] !== l[i - 1][0] || c[1] !== l[i - 1][1])).filter((l) => l.length >= 2) },
    })),
  }
  await writeFile(
    OUT,
    JSON.stringify({
      generatedOn: new Date().toISOString().slice(0, 10),
      tiles: version,
      zoom: Z,
      osmSource: 'OpenStreetMap contributors (ODbL)',
      // OpenFreeMap `transportation` feature ids drawn in the band colour.
      tileIds,
      // The band's own line where no base-map feature lies wholly on a capital road, with the
      // base map's class / ramp / brunnel so the same layer rules draw it.
      ends,
    }) + '\n',
  )
  const safeM = apps.filter((a) => safe.has(a.id)).reduce((s, a) => s + a.parts.reduce((t, p) => t + lengthM(p.map((x) => x.q)), 0), 0)
  const km = (m) => (m / 1000).toFixed(1)
  console.log(`Tiles ${version}: ${tiles.size} z${Z} tiles (${fetched} fetched).`)
  console.log(`Band ${km(total)} km of capital lines. Drawn: ${tileIds.length} recoloured base-map features ${km(safeM)} km; own line cut from base-map features ${km(fromTiles)} km; own line from our geometry ${km(fallback)} km (${(100 * fallback / total).toFixed(1)} %).`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
