// Builds src/data/capital-roads.geojson: the roads the capital (Fővárosi Önkormányzat)
// manages under Government Decree 432/2012. (XII. 29.), annexes 1 and 2, with geometry
// matched from OpenStreetMap (Overpass, build-time only).
//
// Usage:
//   node scripts/build-capital-roads.mjs --parse-decree [--refresh-decree]
//       Parses the consolidated decree (cached under scripts/.cache/) into
//       scripts/data/decree-432-2012-roads.json. Annex 1 rows are split into one item per
//       road of the chain by the hand-written ANNEX1 table below, which is checked against
//       the fetched text so a changed decree fails loudly.
//   node scripts/build-capital-roads.mjs [--refresh] [--verbose] [--accept-unmatched]
//       Reads the parsed decree JSON, queries Overpass (cached; --refresh re-fetches) and
//       writes the GeoJSON. Exits non-zero, writing nothing, if the decree JSON is malformed,
//       if a motorway way slipped in, or if the unmatched rows differ from the reviewed list
//       scripts/data/capital-roads-expected-unmatched.json (--accept-unmatched rewrites that
//       list; review the diff before committing). The audit trail (unmatched, uncut,
//       ambiguous rows, every alias / old-name / closest-approach / override decision, and
//       the OSM way ids and highway types per row) goes to scripts/data/capital-roads-report.json;
//       --verbose also prints the remarks. DEBUG_ROW=2/361 prints the graph of one row.
//
// How a section "X – Y" is cut: the road's ways (same name, inside the row's district) are
// split into <= 15 m pieces; junction X / Y = nodes shared with ways named X / Y, else road
// nodes within 40 m (60 m for squares and bridges), else the closest approach within 150 m;
// "N. kerület / Budapest közigazgatási határa" = nodes within 40 m of that border. The
// shortest path between the two junctions (small gaps bridged with a penalty) is widened to a
// 45 m corridor so both carriageways are kept, trimmed to at most 10 m past either end, then
// clipped to the district (+25 m; bridges are kept whole). An end placed by closest approach,
// by the road's nearest point to a border, or by an approximate override sets cutApprox.
// A junction "X úti felüljáró" on road X itself is the start of X's own bridge ways.
//
// Gaps (display only, D49): where OSM gives a short stretch of the road another name or none
// (junction, roundabout, square, bridge), the row's pieces are joined over the shortest OSM
// carriageway path of at most 150 m that continues the road in line ("bridges"), and a row end
// that stops short of another capital row is joined to it over at most 25 m ("junctionLinks").
// Both are written as separate `kind: 'link'` features that the resolver ignores
// (GAP_DIAG=<file> also writes the refused bridge candidates).
//
// Rows listed in scripts/data/capital-roads-osm-places.json (squares, parking areas, unnamed
// connector roads) skip the name rules: their reviewed OSM way / relation ids are fetched in a
// second, cached Overpass request and drawn as given (areas as closed outline rings, area: true).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import simplify from '@turf/simplify'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(root, 'scripts', '.cache')
const DECREE_URL = 'https://njt.jog.gov.hu/jogszabaly/2012-432-20-22'
const DECREE_HTML = join(CACHE, 'njt-2012-432-20-22.html')
const DECREE_JSON = join(root, 'scripts', 'data', 'decree-432-2012-roads.json')
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'ParkStop-data-build/0.1'
const DISTRICTS = join(root, 'src', 'data', 'districts.geojson')
const OUT = join(root, 'src', 'data', 'capital-roads.geojson')
const EXPECTED_UNMATCHED = join(root, 'scripts', 'data', 'capital-roads-expected-unmatched.json')
const PLACES = join(root, 'scripts', 'data', 'capital-roads-osm-places.json')
const REPORT = join(root, 'scripts', 'data', 'capital-roads-report.json')
// Annex 2 row totals of the consolidated text parsed here; a different count means the decree
// changed and the parse must be re-checked by a human.
const ANNEX2_NUMBERED_ROWS = 1273
const ANNEX2_LETTERED_ROWS = ['71a', '138a']

const args = new Set(process.argv.slice(2))

function fail(msg) {
  console.error('FAILED: ' + msg)
  process.exit(1)
}

// ---------------------------------------------------------------------------------------
// Part 1: the decree
// ---------------------------------------------------------------------------------------

// Annex 1 lists chains of roads per national road. Each chain element becomes one item.
// A string is a whole road; an object limits it to a section. Every name and junction must
// occur verbatim in the point's text (checked below). Where a "between X and Y" qualifier
// follows a chain, it is applied to the last element only: in points 10, 16 and 17 the chain
// starts elsewhere (city border, Kondorosi út side), so the qualifier cannot cover it all.
const ANNEX1 = {
  1: [{ name: 'Budaörsi út', from: 'városhatár', to: 'Sasadi út' }],
  2: [{ name: 'Váci út', from: 'városhatár', to: 'Róbert Károly körút' }],
  3: ['Szabadföld út', 'Veres Péter út', 'Kerepesi út', 'Rákóczi út', 'Kossuth Lajos utca', 'Szabad sajtó út'],
  4: ['Liszt Ferenc Repülőtérre vezető út'],
  5: ['Ócsai út', 'Grassalkovich út', 'Helsinki út', 'Soroksári út'],
  6: ['6. sz. főút fővárosi bevezető szakasza', 'Szerémi út', 'Rákóczi híd budai felhajtó útja'],
  7: ['Balatoni út'],
  8: [
    { name: '10. sz. főút bevezető szakasza', from: 'ürömi körforgalmú csomópont (körpálya nélkül)', to: 'Kocsis Sándor utca' },
    { name: 'Bécsi út', from: 'Kocsis Sándor utca', to: 'Vörösvári út' },
  ],
  9: ['11. sz. főút fővárosi bevezető szakasza', 'Batthyány utca', 'Rákóczi utca', 'Szentendrei út'],
  10: ['Pesti út', 'Jászberényi út', 'Kőrösi Csoma út', { name: 'Kőbányai út', from: 'Liget tér', to: 'Könyves Kálmán körút' }],
  11: ['Haraszti út'],
  12: [
    'M1–M7 autópálya fővárosi bevezető szakasza',
    { name: 'Budaörsi út', from: 'Sasadi út', to: 'BAH csomópont' },
    { name: 'Hegyalja út', from: 'BAH csomópont', to: 'Erzsébet híd' },
    'Erzsébet híd',
  ],
  13: ['M3 autópálya fővárosi bevezető szakasza'],
  14: ['M5 autópálya fővárosi bevezető szakasza'],
  15: ['Vörösvári út', 'Árpád híd', 'Róbert Károly körút', 'Hungária körút', 'Könyves Kálmán körút', 'Rákóczi híd'],
  16: ['Egér út', 'Andor utca', { name: 'Galvani utca', from: 'Fehérvári út', to: 'Budafoki út' }],
  17: ['Hunyadi János út', { name: 'Budafoki út', from: 'Kondorosi út', to: 'Dombóvári út' }],
  18: [
    { name: 'Dombóvári út', from: 'Budafoki út', to: 'Rákóczi híd' },
    { name: 'Budai alsó rakpart', from: 'Rákóczi híd', to: 'Petőfi híd' },
    'Valdemar és Nina Langlet rakpart', 'Raoul Wallenberg rakpart', 'Friedrich Born rakpart',
    'Sztehlo Gábor rakpart', 'Angelo Rotta rakpart', 'Slachta Margit rakpart',
    'gróf Esterházy János rakpart', 'Mozaik utca',
  ],
  19: [{ name: 'Üllői út', from: 'Határ út', to: 'Könyves Kálmán körút' }],
  20: [{ name: 'M0 autóút újpesti felhajtója', from: 'M0', to: 'Váci út' }],
}

const decodeEntities = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
const cleanText = (html) => decodeEntities(html.replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

async function parseDecree() {
  if (args.has('--refresh-decree') || !existsSync(DECREE_HTML)) {
    const res = await fetch(DECREE_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) fail(`decree HTTP ${res.status}`)
    await mkdir(CACHE, { recursive: true })
    await writeFile(DECREE_HTML, await res.text())
    console.log('Fetched decree, cached')
  }
  const html = await readFile(DECREE_HTML, 'utf8')
  const version = /<div class="hataly">\s*(\d{4})\.(\d{2})\.(\d{2})\.?\s*<\/div>/.exec(html)
  if (!version) fail('in-force date (div.hataly) not found')
  const items = []

  // Annex 1: paragraphs ME1@MP<n>.
  for (const [point, chain] of Object.entries(ANNEX1)) {
    const m = new RegExp(`id="ME1@MP${point}\\."[\\s\\S]*?<p[^>]*>([\\s\\S]*?)</p>`).exec(html)
    if (!m) fail(`annex 1 point ${point} not found`)
    const text = cleanText(m[1])
    if (!text.startsWith(`${point}. `)) fail(`annex 1 point ${point}: unexpected text "${text}"`)
    // Chain elements are separated by " – " (spaced en dash; "M1–M7" has none) or ", valamint".
    const elements = text.split(' – ').length + text.split(', valamint ').length - 1
    if (elements !== chain.length) fail(`annex 1 point ${point}: text has ${elements} chain elements, ANNEX1 table has ${chain.length}`)
    chain.forEach((el, i) => {
      const seg = typeof el === 'string' ? { name: el, from: null, to: null } : el
      for (const part of [seg.name, seg.from, seg.to]) {
        if (part && !text.includes(part)) fail(`annex 1 point ${point}: "${part}" not in text "${text}"`)
      }
      items.push({
        annex: 1,
        row: chain.length > 1 ? `${point}.${i + 1}` : `${point}`,
        text,
        name: seg.name,
        from: seg.from,
        to: seg.to,
        district: null,
      })
    })
  }
  const pointCount = (html.match(/id="ME1@MP\d+\."/g) ?? []).length
  if (pointCount !== Object.keys(ANNEX1).length) fail(`annex 1 has ${pointCount} points, ANNEX1 table has ${Object.keys(ANNEX1).length}`)

  // Annex 2: the only table, columns number | street | section, district header rows.
  const start = html.indexOf('<table', html.indexOf('id="ME2"'))
  const table = html.slice(start, html.indexOf('</table>', start))
  const trs = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => cleanText(c[1])),
  )
  // Street names that themselves contain " – " (e.g. "Határ út – Nagykőrösi út átkötő útja"),
  // so a section limit with that name is not split at its dash.
  const dashedNames = new Set(trs.filter((c) => c.length === 3 && c[1].includes(' – ')).map((c) => c[1]))
  const HEADERS = new Set(['|A|B', '|Utcanév|Szakaszhatár', '||'])
  let district = null
  let lastName = null
  let lastRow = null
  let expected = 1
  const lettered = []
  for (const cells of trs) {
    if (cells.length === 1) {
      if (!/^[IVX]+\. kerület$/.test(cells[0])) fail(`unexpected header row "${cells[0]}"`)
      district = cells[0]
      continue
    }
    if (cells.length === 3 && HEADERS.has(cells.join('|'))) continue
    if (cells.length !== 3 || !/^\d+[a-z]?$/.test(cells[0])) fail(`unexpected annex 2 table row: ${JSON.stringify(cells)}`)
    const row = cells[0]
    const num = Number(row.replace(/[a-z]$/, ''))
    if (/[a-z]$/.test(row)) {
      // Lettered rows (e.g. "71a") were inserted by amendments after the row with that number.
      if (num !== expected - 1) fail(`annex 2 row ${row} does not follow row ${num}`)
      lettered.push(row)
    } else {
      if (num !== expected) fail(`annex 2 row ${row} out of sequence (expected ${expected})`)
      expected++
    }
    let name = cells[1]
    const section = cells[2]
    const text = `${row} | ${name} | ${section}`
    const note = []
    if (name === '' && section === '') {
      items.push({ annex: 2, row, text, name: '', from: null, to: null, district, note: 'empty row in the consolidated text' })
      continue
    }
    if (name === '') {
      // Seen only after plural rows ("… átkötő útjai", "… csatlakozó útjai", "… le- és
      // felhajtó útjai, szervizútjai"): the empty cell continues the street of the row above.
      if (!lastName || items.at(-1)?.district !== district) fail(`annex 2 row ${row}: empty street with nothing to continue`)
      name = lastName
      note.push(`street column empty in the decree; continues row ${lastRow} ("${lastName}")`)
    }
    lastName = name
    lastRow = row
    let sections
    if (section === '') sections = [[null, null]]
    else {
      const parts = section.split(/, valamint /)
      const split = (s) => {
        const p = s.split(/\s*–\s*/).map((x) => x.trim())
        for (let i = 0; i + 1 < p.length; i++) {
          if (dashedNames.has(`${p[i]} – ${p[i + 1]}`)) p.splice(i, 2, `${p[i]} – ${p[i + 1]}`)
        }
        return p
      }
      if (parts.length > 1 && parts.every((p) => p.includes('–'))) sections = parts.map(split)
      else sections = [split(section)]
      sections = sections.map((p) => {
        if (p.length === 1) return [p[0], null]
        if (p.length > 2) note.push(`section passes "${p.slice(1, -1).join(' – ')}"`)
        return [p[0], p.at(-1)]
      })
    }
    sections.forEach(([from, to], i) => {
      const strip = (s) => (s === null ? null : s.replace(/ és$/, ''))
      const item = {
        annex: 2,
        row: sections.length > 1 ? `${row}.${i + 1}` : row,
        text,
        name,
        from: strip(from),
        to: strip(to),
        district,
      }
      if (note.length) item.note = note.join('; ')
      items.push(item)
    })
  }
  if (expected - 1 !== ANNEX2_NUMBERED_ROWS) fail(`annex 2 has ${expected - 1} numbered rows, expected ${ANNEX2_NUMBERED_ROWS}`)
  if (lettered.join() !== ANNEX2_LETTERED_ROWS.join()) fail(`annex 2 lettered rows "${lettered.join()}" differ from "${ANNEX2_LETTERED_ROWS.join()}"`)
  const out = {
    source: DECREE_URL,
    consolidatedVersion: `${version[1]}-${version[2]}-${version[3]}`,
    // The day the cached page was fetched (the cache file's time).
    retrievedOn: statSync(DECREE_HTML).mtime.toISOString().slice(0, 10),
    annex2Rows: { numbered: expected - 1, lettered },
    note:
      'Annex 1 points are split into one item per road of the chain (row "<point>.<n>"). ' +
      'Annex 2 row 144 lists two sections and is split into 144.1 and 144.2; lettered rows (71a, 138a) ' +
      'keep their letter. "from"/"to" are the ' +
      'section limits as written; a section without a dash (e.g. "Fő utca vonala") is kept in "from".',
    items,
  }
  await mkdir(dirname(DECREE_JSON), { recursive: true })
  await writeFile(DECREE_JSON, JSON.stringify(out, null, 1) + '\n')
  console.log(`Wrote ${DECREE_JSON}: ${items.length} items (annex 1: ${items.filter((i) => i.annex === 1).length}, annex 2 rows: ${expected - 1} numbered + ${lettered.length} lettered)`)
}

if (args.has('--parse-decree')) {
  await parseDecree()
  process.exit(0)
}

// ---------------------------------------------------------------------------------------
// Part 2: OpenStreetMap
// ---------------------------------------------------------------------------------------

// One request for every highway way in Budapest that has a name or a ref, plus all major
// roads and links (ramps are often unnamed). Junction streets may be any highway type, so
// footways etc. are fetched too and filtered later.
const OVERPASS_CACHE = join(CACHE, 'capital-roads-overpass.json')
const OVERPASS_QUERY = `[out:json][timeout:300];
area["name"="Budapest"]["boundary"="administrative"]["admin_level"="6"]->.b;
(
  way(area.b)["highway"]["name"];
  way(area.b)["highway"]["ref"];
  way(area.b)["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"];
);
out body geom qt;`

async function overpass() {
  if (!args.has('--refresh') && existsSync(OVERPASS_CACHE)) {
    console.log('Using cached Overpass response')
    return JSON.parse(await readFile(OVERPASS_CACHE, 'utf8'))
  }
  const text = await overpassRequest(OVERPASS_QUERY)
  await mkdir(CACHE, { recursive: true })
  await writeFile(OVERPASS_CACHE, text)
  console.log(`Fetched Overpass response (${(text.length / 1e6).toFixed(1)} MB), cached`)
  return JSON.parse(text)
}

/** One Overpass request; backs off while the server is busy (HTTP 429 / 502 / 503 / 504). */
async function overpassRequest(query) {
  let wait = 30
  for (let attempt = 1; attempt <= 7; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    })
    const text = await res.text()
    if (res.ok && text.trimStart().startsWith('{')) {
      const data = JSON.parse(text)
      if (data.remark) fail(`Overpass remark: ${data.remark}`)
      return text
    }
    if (![429, 502, 503, 504].includes(res.status)) fail(`Overpass HTTP ${res.status}: ${text.slice(0, 200)}`)
    console.log(`Overpass busy (HTTP ${res.status}), attempt ${attempt}; retrying in ${wait} s`)
    await new Promise((r) => setTimeout(r, wait * 1000))
    wait *= 2
  }
  fail('Overpass still busy after 7 attempts')
}

// Rows placed by hand on listed OSM elements (scripts/data/capital-roads-osm-places.json):
// squares, parking areas and unnamed connector roads the name rules cannot find. Exactly the
// listed elements are fetched (cached per element list) and drawn; nothing is searched.
const PLACES_CACHE = join(CACHE, 'capital-roads-places-overpass.json')
function placesQuery(rows) {
  const ids = { way: new Set(), relation: new Set() }
  for (const r of Object.values(rows)) {
    for (const el of r.elements) {
      const [type, id] = el.split('/')
      ids[type].add(Number(id))
    }
  }
  const list = (s) => [...s].sort((a, b) => a - b).join(',')
  return `[out:json][timeout:120];
(
  ${ids.way.size ? `way(id:${list(ids.way)});` : ''}
  ${ids.relation.size ? `relation(id:${list(ids.relation)});` : ''}
);
out body geom;`
}
async function overpassPlaces(rows) {
  const query = placesQuery(rows)
  if (!args.has('--refresh') && existsSync(PLACES_CACHE)) {
    const cached = JSON.parse(await readFile(PLACES_CACHE, 'utf8'))
    if (cached.query === query) {
      console.log('Using cached Overpass response for the hand-placed rows')
      return cached.data
    }
  }
  const text = await overpassRequest(query)
  await mkdir(CACHE, { recursive: true })
  await writeFile(PLACES_CACHE, JSON.stringify({ query, data: JSON.parse(text) }))
  console.log('Fetched Overpass response for the hand-placed rows, cached')
  return JSON.parse(text)
}

// ---------------------------------------------------------------------------------------
// Part 3: matching
// ---------------------------------------------------------------------------------------

function validateDecree(d) {
  const errs = []
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!d || typeof d !== 'object') return ['not a JSON object']
  if (typeof d.source !== 'string' || !/^https?:\/\/\S+$/.test(d.source)) errs.push('"source" must be a URL')
  if (!isDate(d.consolidatedVersion)) errs.push('"consolidatedVersion" must be YYYY-MM-DD')
  if (!isDate(d.retrievedOn)) errs.push('"retrievedOn" must be YYYY-MM-DD')
  if (!Array.isArray(d.items) || d.items.length === 0) return [...errs, '"items" must be a non-empty array']
  const seen = new Set()
  d.items.forEach((it, i) => {
    const at = `item ${i}`
    if (it.annex !== 1 && it.annex !== 2) errs.push(`${at}: annex must be 1 or 2`)
    if (typeof it.row !== 'string' || !/^\d+[a-z]?(\.\d+)?$/.test(it.row)) errs.push(`${at}: bad row`)
    if (seen.has(`${it.annex}/${it.row}`)) errs.push(`${at}: duplicate row ${it.annex}/${it.row}`)
    seen.add(`${it.annex}/${it.row}`)
    if (typeof it.text !== 'string' || it.text === '') errs.push(`${at}: text missing`)
    if (typeof it.name !== 'string') errs.push(`${at}: name must be a string`)
    for (const k of ['from', 'to', 'district']) {
      if (it[k] !== null && (typeof it[k] !== 'string' || it[k] === '')) errs.push(`${at}: ${k} must be a string or null`)
    }
    if (it.annex === 2 && !/^[IVX]+\. kerület$/.test(it.district ?? '')) errs.push(`${at}: annex 2 row without district`)
  })
  return errs
}

let decree
try {
  decree = JSON.parse(await readFile(DECREE_JSON, 'utf8'))
} catch (err) {
  fail(`cannot read ${DECREE_JSON}: ${err.message}`)
}
const decreeErrors = validateDecree(decree)
if (decreeErrors.length) fail(`malformed decree JSON:\n  ${decreeErrors.slice(0, 20).join('\n  ')}`)

let places
try {
  places = JSON.parse(await readFile(PLACES, 'utf8'))
} catch (err) {
  fail(`cannot read ${PLACES}: ${err.message}`)
}
{
  const errs = []
  const decreeRows = new Set(decree.items.filter((i) => i.name !== '').map((i) => `${i.annex}/${i.row}`))
  if (!places || typeof places.rows !== 'object') errs.push('"rows" object missing')
  else {
    for (const [row, p] of Object.entries(places.rows)) {
      if (!decreeRows.has(row)) errs.push(`${row}: no such decree row`)
      if (!['square', 'road'].includes(p.kind)) errs.push(`${row}: kind must be "square" or "road"`)
      if ('approx' in p && typeof p.approx !== 'boolean') errs.push(`${row}: approx must be true/false`)
      if (!Array.isArray(p.elements) || !p.elements.length || !p.elements.every((e) => /^(way|relation)\/\d+$/.test(e))) errs.push(`${row}: elements must be "way/<id>" or "relation/<id>"`)
      if (typeof p.why !== 'string' || !p.why || typeof p.decree !== 'string' || !p.decree) errs.push(`${row}: "why" and "decree" are required`)
    }
  }
  if (errs.length) fail(`malformed ${PLACES}:\n  ${errs.join('\n  ')}`)
}

const osm = await overpass()
const placesOsm = await overpassPlaces(places.rows)
if (args.has('--fetch-only')) process.exit(0)

// --- planar geometry (local metres; error well below 1 % inside Budapest) ---------------
const LAT0 = 47.5
const LON0 = 19.05
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const KY = 110574
const proj = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY]
const unproj = ([x, y]) => [x / KX + LON0, y / KY + LAT0]

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
function polyDist(p, pts) {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const d = segDist(p[0], p[1], pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
    if (d < best) best = d
  }
  return best
}
const bboxOf = (pts) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of pts) {
    if (x < b[0]) b[0] = x
    if (y < b[1]) b[1] = y
    if (x > b[2]) b[2] = x
    if (y > b[3]) b[3] = y
  }
  return b
}
const nearBox = (p, b, buf) => p[0] >= b[0] - buf && p[0] <= b[2] + buf && p[1] >= b[1] - buf && p[1] <= b[3] + buf
const boxesMeet = (a, b, buf) => a[0] - buf <= b[2] && b[0] - buf <= a[2] && a[1] - buf <= b[3] && b[1] - buf <= a[3]

// --- districts --------------------------------------------------------------------------
if (!existsSync(DISTRICTS)) fail(`${DISTRICTS} missing (run scripts/build-districts.mjs first)`)
const districtFc = JSON.parse(await readFile(DISTRICTS, 'utf8'))
const districts = new Map() // "I. kerület" -> { polys: [[ring]], segs, bbox }
for (const f of districtFc.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const projected = polys.map((rings) => rings.map((r) => r.map(([lon, lat]) => proj(lon, lat))))
  const segs = []
  for (const rings of projected) for (const r of rings) for (let i = 1; i < r.length; i++) segs.push([r[i - 1], r[i]])
  districts.set(`${f.properties.roman}. kerület`, { polys: projected, segs, bbox: bboxOf(projected.flat(2)) })
}
if (districts.size !== 23) fail(`expected 23 districts, found ${districts.size}`)
// The city outline also covers Margit-sziget, which lies in no district polygon.
if (districtFc.budapest?.type !== 'Polygon' && districtFc.budapest?.type !== 'MultiPolygon') fail('districts.geojson has no "budapest" outline')
const BUDAPEST = (() => {
  const g = districtFc.budapest
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((rings) => rings.map((r) => r.map(([lon, lat]) => proj(lon, lat))))
  const segs = []
  for (const rings of polys) for (const r of rings) for (let i = 1; i < r.length; i++) segs.push([r[i - 1], r[i]])
  return { polys, segs, bbox: bboxOf(polys.flat(2)) }
})()
const BUDA = new Set(['I', 'II', 'III', 'XI', 'XII', 'XXII'].map((r) => `${r}. kerület`))

function inPoly(p, rings) {
  let inside = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside
    }
  }
  return inside
}
function distToBorder(p, d, cap = Infinity) {
  if (!nearBox(p, d.bbox, cap)) return Infinity
  let best = Infinity
  for (const [a, b] of d.segs) {
    if (Math.abs(a[0] - p[0]) > cap + 2000 && Math.abs(b[0] - p[0]) > cap + 2000) continue
    const dd = segDist(p[0], p[1], a[0], a[1], b[0], b[1])
    if (dd < best) best = dd
  }
  return best
}
function inRegion(p, region, buf) {
  for (const d of region) {
    if (!nearBox(p, d.bbox, buf)) continue
    if (d.polys.some((rings) => inPoly(p, rings))) return true
    if (distToBorder(p, d, buf) <= buf) return true
  }
  return false
}
// Outer city boundary: district border pieces not shared with another district.
const outerSegs = []
for (const [name, d] of districts) {
  for (const [a, b] of d.segs) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const shared = [...districts].some(([n2, d2]) => n2 !== name && distToBorder(mid, d2, 25) <= 25)
    if (!shared) outerSegs.push([a, b])
  }
}
const distToOuter = (p) => {
  let best = Infinity
  for (const [a, b] of outerSegs) best = Math.min(best, segDist(p[0], p[1], a[0], a[1], b[0], b[1]))
  return best
}

// --- OSM ways ---------------------------------------------------------------------------
const norm = (s) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
// Motorways are left out: decree §1 (2) excludes expressway sections inside Budapest, and
// OSM highway=motorway / motorway_link are those sections and their ramps.
const CARRIAGEWAY = /^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|pedestrian)(_link)?$/
const MAJOR = /^(trunk|primary|secondary|tertiary)$/
const isCarriageway = (w) => CARRIAGEWAY.test(w.tags.highway) && w.tags.area !== 'yes'

const ways = []
const wayById = new Map()
const nodeWays = new Map()
const nameIndex = new Map()
const refIndex = new Map()
const oldNameIndex = new Map()
const addTo = (m, k, v) => {
  if (!m.has(k)) m.set(k, [])
  m.get(k).push(v)
}
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.geometry || !e.nodes || e.geometry.length !== e.nodes.length) continue
  const w = { id: e.id, tags: e.tags ?? {}, nodes: e.nodes, pts: e.geometry.map((g) => proj(g.lon, g.lat)) }
  w.bbox = bboxOf(w.pts)
  ways.push(w)
  wayById.set(w.id, w)
  for (const n of w.nodes) addTo(nodeWays, n, w)
  const names = new Set()
  for (const k of ['name', 'alt_name', 'official_name', 'name:hu', 'bridge:name', 'tunnel:name']) {
    for (const v of (w.tags[k] ?? '').split(';')) if (v.trim()) names.add(norm(v))
  }
  for (const n of names) addTo(nameIndex, n, w)
  // Former and local names: used only when the current name finds nothing (see lookup).
  for (const k of ['old_name', 'loc_name']) for (const v of (w.tags[k] ?? '').split(';')) if (v.trim()) addTo(oldNameIndex, norm(v), w)
  for (const r of (w.tags.ref ?? '').split(';')) if (r.trim()) addTo(refIndex, r.trim().replace(/\s+/g, ''), w)
}
console.log(`OSM: ${ways.length} highway ways`)

// Decree names that OpenStreetMap spells differently. Each entry was checked by hand: same
// street, same place, only the spelling differs. Keys are normalised decree names.
// Only spelling differences (út/utca, joined words, abbreviations, a misspelt person's name)
// and one renamed landmark; the row's district and its section junctions still have to match.
const ALIASES = {
  // Airport renamed in 2011; OSM keeps the old road name. Same road: OSM ref=4, and annex 1
  // point 4 names it as the 4. sz. főút.
  'liszt ferenc repülőtérre vezető út': ['Ferihegyi repülőtérre vezető út'],
  'kőrösi csoma út': ['Kőrösi Csoma Sándor út'],
  'jane haning rakpart': ['Jane Haining rakpart'],
  'idősebb antall józsef rakpart': ['Id. Antall József rakpart'],
  'frankel leó utca': ['Frankel Leó út'],
  'zöld lomb utca': ['Zöldlomb utca'],
  'görgey artúr utca': ['Görgey Artúr út'],
  'pongrác út': ['Pongrácz út'],
  'thán károly utca': ['Than Károly utca'],
  'rácz aladár utca': ['Rácz Aladár út'],
  'kis gömb utca': ['Kisgömb utca'],
  'új palotai út': ['Újpalotai út'],
  'nyírpalota utca': ['Nyírpalota út'],
  'vidám vásár utca': ['Vidámvásár utca'],
  'naplás utca': ['Naplás út'],
  'szent imre herceg utca': ['Szent Imre herceg út'],
  'királyhágó utca': ['Királyhágó út'],
  'bartók béla utca': ['Bartók Béla út'],
  'szent lászló út': ['Szent László utca'],
  // OSM spells the bridge "Kvassay híd" (ref 5101, IX.); it crosses the Soroksár Danube arm.
  'kvassay dunaág híd': ['Kvassay híd'],
  // The one main road across Margit-sziget; OSM names it "Schulek Frigyes sétány" (unclassified,
  // ways 220028262, 436026678, …). Matched within the city outline (OVERRIDES 2/709).
  'margit szigeti főútvonal': ['Schulek Frigyes sétány'],
  // The access road of the Savoya Park shopping centre (OSM building=retail "Savoya Park",
  // Hunyadi János út 19, way 102022716): OSM names it "Feltáró út" (unclassified, ways
  // 151597621, 425221264, …), running from Hunyadi János út to Fehérvári út in XI (2026-11-13).
  'savoya park feltáró útja': ['Feltáró út'],
}

// Hand-checked corrections for rows the general rules get wrong (OSM cache of 2026-11-12).
//   ends / from / to: [lat, lon] that replace the junction search for that end (the nearest
//                     road node is used); approx marks an end placed more than ~30 m from a
//                     real junction, which sets cutApprox.
//   dropWays:         OSM way ids removed from the candidates (stray namesakes).
//   ways:             candidates replaced by ways with this name and highway type.
//   region:           'budapest' = the city outline instead of the row's district.
const OVERRIDES = {
  // Section is ~150 m: from the Somlói út junction (shared node at 47.481710,19.045538) east
  // to where Kelenhegyi lépcső reaches the road (~46 m off, at 47.48149,19.04721).
  '2/574': { from: [47.48149, 19.04721], to: [47.48171, 19.04554], approx: true },
  // "Árpád híd buszpályaudvar": OSM node 5569881588 "Budapest, Árpád híd autóbusz-állomás" at
  // 47.531936,19.065658 lies beside the Esztergomi út point below (~210 m east of it).
  '2/688': { from: [47.531898, 19.062887], approx: true },
  // Short piece from the Bakfark Bálint utca junction west toward Csalogány utca, which comes
  // no closer than ~79 m (reviewer-measured ends).
  '2/131': { from: [47.508818, 19.02891], to: [47.508711, 19.028423], approx: true },
  // Plébánia utca does not touch Tatárka utca in OSM; it lies ~250 m south-east of the east
  // end of Tatárka utca (way 705963916, node 75019696), so the section runs east from
  // Vincellér út to that end.
  '2/1231': { from: [47.433729, 19.025242], approx: true },
  // Gubacsi út touches Szabadkai út twice (shared nodes 1018969698 at 47.445634,19.096109 and
  // 280317780 by the east end); Török Flóris utca meets only the east end, so the section
  // runs from the west Gubacsi út junction to the east end.
  '2/461': { from: [47.445634, 19.096109] },
  // A 159 m namesake piece at the city edge (47.49118,19.313405) is not this Pesti út.
  '2/939': { dropWays: [884295268, 923755429] },
  // The Buda-side ramps of Petőfi híd are the "Goldmann György tér" link roads.
  '2/592': { ways: { name: 'Goldmann György tér', highway: /^secondary_link$/ } },
  // Margit-sziget belongs to no district polygon.
  '2/709': { region: 'budapest' },
}
const lookupName = (name) => {
  const out = new Set()
  for (const n of [name, ...(ALIASES[norm(name)] ?? [])]) for (const w of nameIndex.get(norm(n)) ?? []) out.add(w)
  return [...out]
}
const lookupOldName = (name) => oldNameIndex.get(norm(name)) ?? []
// "Szilágyi utcai felüljáró" -> the bridge ways of "Szilágyi utca".
const overpassStreet = (name) => {
  const m = /^(.+) (utcai|úti) felüljáró$/.exec(name)
  return m ? `${m[1]} ${m[2] === 'utcai' ? 'utca' : 'út'}` : null
}
/** Ways for a street name: current name or alias, else former/local name, else overpass. */
function resolveName(name, accept) {
  let ws = lookupName(name).filter(accept)
  if (ws.length) return { ways: ws, via: 'name' }
  ws = lookupOldName(name).filter(accept)
  if (ws.length) return { ways: ws, via: 'old_name' }
  const street = overpassStreet(name)
  if (street) {
    ws = lookupName(street).filter((w) => accept(w) && w.tags.bridge && w.tags.bridge !== 'no')
    if (ws.length) return { ways: ws, via: 'overpass' }
  }
  return { ways: [], via: null }
}
const lookupRefs = (refs) => {
  const out = new Set()
  for (const r of refs) for (const w of refIndex.get(r) ?? []) out.add(w)
  return [...out]
}

// --- row classification ----------------------------------------------------------------
const REF_ROAD = /^(?:(M\d+)(?:[-–](M\d+))? autópálya|(\d+)\. sz\. főút)(?: fővárosi)? bevezető szakasza?$/
function classify(item) {
  const full = item.name
  const notes = []
  let base = full.replace(/\s*\(.*\)\s*$/, '')
  if (base !== full) notes.push(`parenthetical "${full.slice(base.length).trim()}" ignored for matching`)
  let kind = 'road'
  if (/(^| )(híd|felüljáró)$|lánchíd$/.test(base)) kind = 'bridge'
  else if (/(^| )alagút$/i.test(base)) kind = 'tunnel'
  else if (/ (tér|tere|körtér|körönd)$|^Oktogon$/.test(base)) kind = 'square'

  if (/ le- és felhajtó útjai/.test(base) || / budai felhajtó útja$/.test(base) || / újpesti felhajtó(ja)?$/.test(base)) {
    const of = base.replace(/ (le- és felhajtó útjai.*|budai felhajtó útja|újpesti felhajtó(?:ja)?)$/, '')
    if (/szervizútjai$/.test(base)) notes.push('service roads part of the row not matched separately')
    const ref = REF_ROAD.exec(of) ?? /^(M\d+) autóút$/.exec(of)
    return { type: 'ramps', of, refs: ref ? refsOf(ref) : null, buda: / budai /.test(base), kind: 'other', notes }
  }
  if (/parkolója$|buszpályaudvar$|lakótelep útjai$|átkötő útjai?$|csatlakozó útjai$/.test(base)) {
    return { type: 'none', kind: 'other', notes, reason: `"${base}" is not a named road in OpenStreetMap (parking area, bus station or unnamed connector roads)` }
  }
  const andMore = / és (kapcsolódó útjai|szervizútja)$/.exec(base)
  if (andMore) {
    notes.push(`"${andMore[1]}" not matched; only the named road is included`)
    base = base.slice(0, andMore.index)
  }
  const service = /^(.+?)(?:-| )szervizút(?:ja|jai)?$/.exec(base)
  if (service) {
    const ref = REF_ROAD.exec(service[1].replace(/ szakasz$/, ' szakasza'))
    return { type: 'service', of: service[1], refs: ref ? refsOf(ref) : null, kind: 'other', notes }
  }
  const ref = REF_ROAD.exec(base)
  if (ref) return { type: 'ref', refs: refsOf(ref), kind: 'road', notes }
  return { type: 'name', name: base, kind, notes }
}
function refsOf(m) {
  if (m[3]) return [m[3]]
  if (m[1] && m[2]) return [m[1], m[2], `${m[1]}-${m[2]}`]
  return [m[1]]
}

// --- graph per row ----------------------------------------------------------------------
const STEP = 15 // densify to <= 15 m so cuts and clipping work on fine pieces
function buildGraph(wayList, keep) {
  const segs = []
  for (const w of wayList) {
    let idx = 0
    for (let i = 1; i < w.pts.length; i++) {
      const [ax, ay] = w.pts[i - 1]
      const [bx, by] = w.pts[i]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP))
      for (let k = 0; k < n; k++) {
        const p = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]
        const q = [ax + ((bx - ax) * (k + 1)) / n, ay + ((by - ay) * (k + 1)) / n]
        const a = k === 0 ? `n${w.nodes[i - 1]}` : `w${w.id}_${i}_${k}`
        const b = k === n - 1 ? `n${w.nodes[i]}` : `w${w.id}_${i}_${k + 1}`
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
        if (keep(mid)) segs.push({ a, b, p, q, mid, len: Math.hypot(q[0] - p[0], q[1] - p[1]), way: w.id, idx })
        idx++
      }
    }
  }
  const pos = new Map()
  const adj = new Map()
  for (const s of segs) {
    pos.set(s.a, s.p)
    pos.set(s.b, s.q)
    addTo(adj, s.a, { to: s.b, w: s.len })
    addTo(adj, s.b, { to: s.a, w: s.len })
  }
  return { segs, pos, adj }
}

// Links dead ends to nearby nodes so a road interrupted by a differently named square,
// roundabout or bridge stays connected (penalised, so real roads are preferred).
function addGapEdges(g, maxGap = 40) {
  const cell = (p) => `${Math.floor(p[0] / maxGap)},${Math.floor(p[1] / maxGap)}`
  const grid = new Map()
  for (const [k, p] of g.pos) addTo(grid, cell(p), k)
  for (const [k, p] of g.pos) {
    if ((g.adj.get(k) ?? []).length !== 1) continue
    const [cx, cy] = cell(p).split(',').map(Number)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const k2 of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (k2 === k || g.adj.get(k).some((e) => e.to === k2)) continue
          const d = Math.hypot(g.pos.get(k2)[0] - p[0], g.pos.get(k2)[1] - p[1])
          if (d <= maxGap) {
            addTo(g.adj, k, { to: k2, w: d * 2 + 10 })
            addTo(g.adj, k2, { to: k, w: d * 2 + 10 })
          }
        }
  }
}

// Bridges components that are still separate (a named road interrupted by a stretch under
// another name or a pedestrian piece) with one penalised edge between their closest nodes.
function bridgeComponents(g, maxGap = 250) {
  const comp = new Map()
  const comps = []
  for (const start of g.pos.keys()) {
    if (comp.has(start)) continue
    const id = comps.length
    const members = []
    const stack = [start]
    comp.set(start, id)
    while (stack.length) {
      const k = stack.pop()
      members.push(k)
      for (const e of g.adj.get(k) ?? []) {
        if (comp.has(e.to)) continue
        comp.set(e.to, id)
        stack.push(e.to)
      }
    }
    comps.push(members)
  }
  for (let i = 0; i < comps.length; i++)
    for (let j = i + 1; j < comps.length; j++) {
      let best = [Infinity]
      for (const a of comps[i]) {
        const pa = g.pos.get(a)
        for (const b of comps[j]) {
          const pb = g.pos.get(b)
          if (Math.abs(pa[0] - pb[0]) > maxGap || Math.abs(pa[1] - pb[1]) > maxGap) continue
          const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
          if (d < best[0]) best = [d, a, b]
        }
      }
      if (best[0] <= maxGap) {
        addTo(g.adj, best[1], { to: best[2], w: best[0] * 3 + 50 })
        addTo(g.adj, best[2], { to: best[1], w: best[0] * 3 + 50 })
      }
    }
}

function dijkstra(g, sources, targets) {
  const dist = new Map()
  const prev = new Map()
  const heap = []
  const push = (k, d) => {
    heap.push([d, k])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  for (const s of sources) {
    dist.set(s, 0)
    push(s, 0)
  }
  while (heap.length) {
    const [d, k] = pop()
    if (d > dist.get(k)) continue
    if (targets.has(k)) {
      const path = [k]
      while (prev.has(path.at(-1))) path.push(prev.get(path.at(-1)))
      return path.reverse()
    }
    for (const e of g.adj.get(k) ?? []) {
      const nd = d + e.w
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd)
        prev.set(e.to, k)
        push(e.to, nd)
      }
    }
  }
  return null
}

// Connected clusters of ways (shared nodes or ends within 60 m).
function clusters(wayList) {
  const parent = new Map(wayList.map((w) => [w.id, w.id]))
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)))
  const union = (a, b) => parent.set(find(a), find(b))
  for (let i = 0; i < wayList.length; i++)
    for (let j = i + 1; j < wayList.length; j++) {
      const a = wayList[i]
      const b = wayList[j]
      if (!boxesMeet(a.bbox, b.bbox, 60)) continue
      if (a.nodes.some((n) => b.nodes.includes(n))) union(a.id, b.id)
      else if ([a.pts[0], a.pts.at(-1)].some((p) => polyDist(p, b.pts) < 60) || [b.pts[0], b.pts.at(-1)].some((p) => polyDist(p, a.pts) < 60)) union(a.id, b.id)
    }
  const groups = new Map()
  for (const w of wayList) addTo(groups, find(w.id), w)
  return [...groups.values()]
}

// --- junctions --------------------------------------------------------------------------
function junctionNodes(text, g, ctx) {
  let t = text.replace(/ és$/, '').replace(/ \(?körpálya nélkül\)?$/, '').trim()
  const border = /^([IVX]+)\. kerület közigazgatási határa$/.exec(t)
  if (border || /^(városhatár|Budapest közigazgatási határa)$/.test(t)) {
    const label = border ? `${border[1]}. district border` : 'city border'
    const d = border ? districts.get(`${border[1]}. kerület`) : null
    const dist = (p) => (d ? distToBorder(p, d, 1500) : distToOuter(p))
    const inside = [...g.pos].filter(([, p]) => inRegion(p, ctx.region, 25)).map(([k, p]) => [k, dist(p)])
    let nodes = new Set(inside.filter(([, x]) => x <= 40).map(([k]) => k))
    if (nodes.size) return { nodes }
    // The named road stops short of the border inside this district (its name changes or
    // it turns into another district first): take its end nearest to the border.
    const min = Math.min(...inside.map(([, x]) => x))
    if (min > 1500) return { error: `road does not come within 1.5 km of the ${label}` }
    nodes = new Set(inside.filter(([, x]) => x <= min + 20).map(([k]) => k))
    return { nodes, approx: true, variant: `${label} end taken where the road comes closest to it (${Math.round(min)} m)` }
  }
  if (/\d+\.( sz\.)?$/.test(t) && !/^\d+\. (sor|utca)$/.test(t)) return { error: `house number "${t}" (no address data used)` }
  t = t.replace(/,? valamint .*$/, '').replace(/ vonala$/, '').replace(/(-| )szervizút(ja)?$/, '')
  const names = [t.replace(/\s*\(.*\)$/, '')]
  const paren = /\((.*)\)$/.exec(t)
  if (paren && !/szervizútja/.test(paren[1])) names.push(paren[1])
  const gb = bboxOf([...g.pos.values()])
  // A road matched by its ref may contain its own junction under another name (e.g. a named
  // roundabout); a road matched by name may not.
  const accept = (w) => boxesMeet(w.bbox, gb, 300) && (!ctx.byName || !ctx.wayIds.has(w.id))
  let jw = []
  let variant = null
  const ref = REF_ROAD.exec(t) ?? /^(M\d+)$/.exec(t) ?? /^(\d+)\. sz\. főút$/.exec(t)
  if (ref) jw = lookupRefs(ref[3] || ref[2] ? refsOf(ref) : [ref[1]]).filter(accept)
  else {
    for (const n of names) {
      for (const v of junctionVariants(n)) {
        jw = resolveName(v, accept).ways
        if (jw.length) {
          if (v !== n) variant = `junction "${n}" matched as "${v}"`
          break
        }
      }
      if (jw.length) break
    }
  }
  if (!jw.length) {
    // "Csömöri úti felüljáró" on Csömöri út itself: the road's own flyover, i.e. its own
    // bridge ways, which the rule above leaves out because they carry the road's name.
    const street = overpassStreet(t)
    if (street && ctx.name && norm(street) === norm(ctx.name)) {
      const own = new Set([...ctx.wayIds].map((id) => wayById.get(id)).filter((w) => w.tags.bridge && w.tags.bridge !== 'no').flatMap((w) => w.nodes.map((n) => `n${n}`)))
      const nodes = new Set([...g.pos.keys()].filter((k) => own.has(k)))
      if (nodes.size) return { nodes, variant: `junction "${t}" taken as the road's own bridge ways` }
    }
    return { error: `junction "${t}" not found in OpenStreetMap near the road` }
  }
  const jNodes = new Set(jw.flatMap((w) => w.nodes.map((n) => `n${n}`)))
  let nodes = new Set([...g.pos.keys()].filter((k) => jNodes.has(k)))
  let approx = false
  if (!nodes.size) {
    // No shared node: dual carriageways, squares and bridges often meet a street through
    // short unnamed links, so accept road nodes close to the junction street instead.
    const tol = / (tér|tere|körtér|híd|felüljáró)$/.test(t) ? 60 : 40
    const dist = new Map()
    for (const [k, p] of g.pos) {
      let d = Infinity
      for (const w of jw) if (nearBox(p, w.bbox, 150)) d = Math.min(d, polyDist(p, w.pts))
      if (d <= 150) dist.set(k, d)
    }
    // Only the road nodes nearest the junction street, so the section starts at the junction
    // and not up to `tol` metres inside it.
    const near = [...dist].filter(([, d]) => d <= tol)
    const nearMin = Math.min(...near.map(([, d]) => d))
    nodes = new Set(near.filter(([, d]) => d <= nearMin + 5).map(([k]) => k))
    if (!nodes.size && dist.size) {
      approx = true
      // Interchanges: the two roads meet only through ramps. Use the closest approach.
      const min = Math.min(...dist.values())
      nodes = new Set([...dist].filter(([, d]) => d <= min + 10).map(([k]) => k))
      variant = [variant, `junction "${t}" taken at its closest approach (${Math.round(min)} m, no direct connection)`].filter(Boolean).join('; ')
    }
  }
  return nodes.size ? { nodes, variant, approx } : { error: `junction "${t}" does not come within 150 m of the road` }
}

// Short forms the decree uses for squares that carry a longer official name.
const JUNCTION_ALIASES = {
  'deák tér': 'Deák Ferenc tér',
  'moszkva tér': 'Széll Kálmán tér', // renamed in 2011; the decree still uses the old name here
  'kossuth tér': 'Kossuth Lajos tér',
  'nagyfuvaros utca': 'Nagy Fuvaros utca', // the decree itself writes "Nagy fuvaros utca" in row 394
  'bah csomópont': 'BAH-csomóponti felüljáró', // the flyover of the BAH junction (OSM name)
  // The roundabout on road 10 at Üröm (OSM: "Ürömi úti körforgalom", ref 10). The decree
  // excludes the ring itself ("körpálya nélkül"); the cut ends within ~45 m of it.
  'ürömi körforgalmú csomópont': 'Ürömi úti körforgalom',
}
/** Spelling variants tried, in order, for a junction street (never for the road itself). */
function junctionVariants(name) {
  const out = [name]
  if (JUNCTION_ALIASES[norm(name)]) out.push(JUNCTION_ALIASES[norm(name)])
  const words = name.split(' ')
  // "Nagy fuvaros utca" -> "Nagyfuvaros utca"
  for (let i = 0; i + 2 < words.length; i++) {
    if (/^[a-záéíóöőúüű]/.test(words[i + 1])) out.push([...words.slice(0, i), words[i] + words[i + 1], ...words.slice(i + 2)].join(' '))
  }
  // "Tövishát" -> "Tövishát utca"
  if (words.length === 1) out.push(`${name} utca`, `${name} út`)
  // út <-> utca
  for (const v of [...out]) {
    if (/ utca$/.test(v)) out.push(v.replace(/ utca$/, ' út'))
    else if (/ út$/.test(v)) out.push(v.replace(/ út$/, ' utca'))
  }
  return out
}

// Pieces of the road within `width` of the section path (so the second carriageway is kept),
// but none lying more than `slack` metres beyond either end of the path: decree §7 (2) adds
// only the end junction itself to the section.
function corridor(g, pathPts, width, slack = 10) {
  const pb = bboxOf(pathPts)
  const pointAt = (from, metres) => {
    const pts = from === 0 ? pathPts : [...pathPts].reverse()
    let run = 0
    for (let i = 1; i < pts.length; i++) {
      run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (run >= metres) return pts[i]
    }
    return pts.at(-1)
  }
  const ends = [
    { p: pathPts[0], q: pointAt(0, 20) },
    { p: pathPts.at(-1), q: pointAt(1, 20) },
  ].map(({ p, q }) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    return { p, ux: (p[0] - q[0]) / len, uy: (p[1] - q[1]) / len } // unit vector pointing outward
  })
  return g.segs.filter((s) => {
    if (!nearBox(s.mid, pb, width) || polyDist(s.mid, pathPts) > width) return false
    for (const e of ends) {
      const beyond = (s.mid[0] - e.p[0]) * e.ux + (s.mid[1] - e.p[1]) * e.uy
      if (beyond > slack && Math.hypot(s.mid[0] - e.p[0], s.mid[1] - e.p[1]) < width + slack + 5) return false
    }
    return true
  })
}

// --- one row ----------------------------------------------------------------------------
function regionFor(item, cls) {
  if (OVERRIDES[`${item.annex}/${item.row}`]?.region === 'budapest') return [BUDAPEST]
  if (item.annex === 2) return [districts.get(item.district)]
  if (cls.buda) return [...BUDA].map((n) => districts.get(n))
  if (/ újpesti /.test(item.name)) return [districts.get('IV. kerület')] // Újpest is district IV
  return [...districts.values()]
}

function candidatesFor(item, cls, region, notes) {
  const inReg = (w) => w.pts.some((p) => inRegion(p, region, 30))
  const ov = OVERRIDES[`${item.annex}/${item.row}`]
  if (ov?.ways) {
    notes.push(`hand-checked override: ways named "${ov.ways.name}" (${ov.ways.highway.source})`)
    return lookupName(ov.ways.name).filter((w) => ov.ways.highway.test(w.tags.highway) && inReg(w))
  }
  const ways = candidatesByRule(item, cls, region, notes, inReg)
  if (ov?.dropWays) {
    notes.push(`hand-checked override: dropped stray ways ${ov.dropWays.join(', ')}`)
    return ways.filter((w) => !ov.dropWays.includes(w.id))
  }
  return ways
}

function candidatesByRule(item, cls, region, notes, inReg) {
  if (cls.type === 'name' && cls.kind === 'bridge') {
    // A bridge is kept whole: every same-name piece connected to a piece in this district.
    const all = resolveName(cls.name, (w) => isCarriageway(w) && w.pts.some((p) => inRegion(p, [BUDAPEST], 30)))
    const groups = clusters(all.ways).filter((grp) => grp.some(inReg))
    if (all.via === 'overpass') notes.push(`matched as the bridge ways of ${overpassStreet(cls.name)}`)
    return groups.flat()
  }
  if (cls.type === 'name') {
    let r = resolveName(cls.name, (w) => isCarriageway(w) && inReg(w))
    // A few official streets exist in OSM only as highway=service with the exact name
    // (e.g. a square's ring road); accept those when nothing else carries the name.
    if (!r.ways.length) {
      r = resolveName(cls.name, (w) => w.tags.highway === 'service' && w.tags.area !== 'yes' && inReg(w))
      if (r.ways.length) notes.push('matched highway=service ways with this exact name (no other carriageway has it)')
    }
    if (r.via === 'old_name') notes.push(`matched by OSM old_name/loc_name (current name: ${[...new Set(r.ways.map((w) => w.tags.name ?? '(none)'))].join(', ')})`)
    if (r.via === 'overpass') notes.push(`matched as the bridge ways of ${overpassStreet(cls.name)}`)
    const exact = new Set(nameIndex.get(norm(cls.name)) ?? [])
    if (r.via === 'name' && r.ways.some((w) => !exact.has(w))) notes.push(`matched via spelling alias ${ALIASES[norm(cls.name)].join(', ')}`)
    return r.ways
  }
  if (cls.type === 'ref') return lookupRefs(cls.refs).filter((w) => MAJOR.test(w.tags.highway) && inReg(w))
  if (cls.type === 'service') {
    const named = [`${cls.of} szervizút`, `${cls.of}-szervizút`, `${cls.of} szervizútja`].flatMap(lookupName).filter(inReg)
    if (named.length) return named
    const main = cls.refs ? lookupRefs(cls.refs) : lookupName(cls.of)
    // Service roads carry the main road's name (or ref) but a lower class than the main
    // carriageway, or highway=service.
    return main.filter((w) => inReg(w) && (w.tags.highway === 'service' || /^(residential|unclassified|living_street)$/.test(w.tags.highway)) && w.tags.area !== 'yes')
  }
  if (cls.type === 'ramps') {
    const seeds = (cls.refs ? lookupRefs(cls.refs) : lookupName(cls.of)).filter((w) => isCarriageway(w) && !/_link$/.test(w.tags.highway))
    if (!seeds.length) return []
    // Walk from the bridge / motorway over link roads and unnamed carriageways (ramps),
    // plus ways named like the bridge but not tagged as the bridge itself, up to 600 m.
    const seedIds = new Set(seeds.map((w) => w.id))
    const isRamp = (w) =>
      isCarriageway(w) &&
      !seedIds.has(w.id) &&
      (/_link$/.test(w.tags.highway) || !w.tags.name || (!cls.refs && norm(w.tags.name) === norm(cls.of) && !w.tags.bridge))
    const found = new Map()
    let frontier = seeds.map((w) => ({ w, dist: 0 }))
    while (frontier.length) {
      const next = []
      for (const { w, dist } of frontier) {
        for (const n of w.nodes) {
          for (const w2 of nodeWays.get(n) ?? []) {
            if (found.has(w2.id) || !isRamp(w2)) continue
            let len = 0
            for (let i = 1; i < w2.pts.length; i++) len += Math.hypot(w2.pts[i][0] - w2.pts[i - 1][0], w2.pts[i][1] - w2.pts[i - 1][1])
            if (dist + len > 600 && dist > 0) continue
            found.set(w2.id, w2)
            next.push({ w: w2, dist: dist + len })
          }
        }
      }
      frontier = next
    }
    return [...found.values()].filter(inReg)
  }
  return []
}

const results = []
const unmatched = []
const cutFailed = []
const ambiguous = []
const remarks = []
const byRow = new Map()
const placedItems = []

for (const item of decree.items) {
  if (item.name === '') continue // empty row in the consolidated text
  const label = `${item.annex}/${item.row}`
  if (places.rows[label]) {
    placedItems.push(item)
    continue
  }
  const cls = classify(item)
  if (cls.type === 'none') {
    for (const n of cls.notes) remarks.push({ row: label, name: item.name, note: n })
    unmatched.push({ annex: item.annex, row: item.row, name: item.name, reason: cls.reason })
    continue
  }
  const region = regionFor(item, cls)
  const cands = candidatesFor(item, cls, region, cls.notes)
  for (const n of cls.notes) remarks.push({ row: label, name: item.name, note: n })
  if (!cands.length) {
    unmatched.push({ annex: item.annex, row: item.row, name: item.name, reason: `no OpenStreetMap carriageway found for "${cls.name ?? cls.of}"${item.district ? ` in ${item.district}` : ''}` })
    continue
  }
  byRow.set(label, { item, cls, region, cands })
}

// Annex 1 chains name roads without districts. A name such as "Kossuth Lajos utca" exists in
// many districts, so keep only the clusters that touch a neighbouring element of the chain.
for (let pass = 0; pass < 2; pass++) {
  for (const [label, r] of byRow) {
    if (r.item.annex !== 1 || !r.item.row.includes('.')) continue
    const groups = clusters(r.cands)
    if (groups.length < 2) continue
    const [point, idx] = r.item.row.split('.').map(Number)
    const neighbours = [byRow.get(`1/${point}.${idx - 1}`), byRow.get(`1/${point}.${idx + 1}`)].filter(Boolean)
    const touches = (grp, nb) =>
      nb.cands.some((w2) => grp.some((w) => boxesMeet(w.bbox, w2.bbox, 150) && (w.nodes.some((n) => w2.nodes.includes(n)) || w.pts.some((p) => polyDist(p, w2.pts) <= 150))))
    // Prefer clusters that touch both neighbours (a middle element of the chain), else either.
    let touching = groups.filter((grp) => neighbours.every((nb) => touches(grp, nb)))
    if (!touching.length) touching = groups.filter((grp) => neighbours.some((nb) => touches(grp, nb)))
    // A road interrupted by a short gap is still one road: also keep clusters within 500 m of
    // a kept one. Only distant namesakes are dropped.
    for (let grew = true; grew; ) {
      grew = false
      for (const grp of groups) {
        if (touching.includes(grp)) continue
        const near = touching.some((k) => k.some((w) => grp.some((w2) => boxesMeet(w.bbox, w2.bbox, 500) && w2.pts.some((p) => polyDist(p, w.pts) <= 500))))
        if (near) {
          touching.push(grp)
          grew = true
        }
      }
    }
    if (touching.length && touching.length < groups.length) {
      r.cands = touching.flat()
      if (pass === 0) remarks.push({ row: label, name: r.item.name, note: `kept ${touching.length} of ${groups.length} same-name clusters that touch the next road of the chain` })
    }
  }
}

for (const [label, { item, cls, region, cands }] of byRow) {
  // The graph reaches 150 m beyond the district so junctions on or just past its border
  // are found; the result is clipped to the district (+25 m) at the end. Bridges are not
  // clipped to one district: a bridge listed in any district is kept whole.
  const clipRegion = cls.kind === 'bridge' ? [BUDAPEST] : region
  const inside = (s) => inRegion(s.mid, clipRegion, 25)
  const g = buildGraph(cands, (mid) => inRegion(mid, clipRegion, 150))
  if (!g.segs.some(inside)) {
    unmatched.push({ annex: item.annex, row: item.row, name: item.name, reason: 'matching ways lie outside the district' })
    continue
  }
  const ctx = { wayIds: new Set(cands.map((w) => w.id)), region, byName: cls.type !== 'ref', name: cls.name ?? cls.of ?? null }
  const ov = OVERRIDES[label] ?? {}
  // "X – X" (a loop leaving and rejoining the same road) is the whole road.
  const loop = item.from !== null && item.from === item.to
  if (loop) remarks.push({ row: label, name: item.name, note: 'section starts and ends on the same road: whole road, partial: false' })
  const partial = (item.from !== null || item.to !== null) && !loop
  let selected = g.segs
  let cutApplied = false
  let cutApprox = false
  if (partial) {
    let why = null
    const byPoint = (ll) => {
      const p = proj(ll[1], ll[0])
      const d = [...g.pos].map(([k, q]) => [k, Math.hypot(q[0] - p[0], q[1] - p[1])])
      const min = Math.min(...d.map(([, x]) => x))
      return min > 60 ? { error: 'override point is not on the road' } : { nodes: new Set(d.filter(([, x]) => x <= min + 3).map(([k]) => k)), approx: ov.approx }
    }
    const fromSpec = ov.from ?? null
    const toSpec = ov.to ?? null
    if (fromSpec || toSpec) remarks.push({ row: label, name: item.name, note: 'hand-checked override of section end(s): ' + JSON.stringify({ from: fromSpec, to: toSpec }) })
    if (item.from !== null && item.to !== null) {
      let ja = fromSpec ? byPoint(fromSpec) : junctionNodes(item.from, g, ctx)
      let jb = toSpec ? byPoint(toSpec) : junctionNodes(item.to, g, ctx)
      if (ja.error || jb.error) why = [ja.error, jb.error].filter(Boolean).join('; ')
      else {
        for (const j of [ja, jb]) if (j.variant) remarks.push({ row: label, name: item.name, note: j.variant })
        // A node found for both ends (a junction street that also runs past the other end)
        // belongs to neither end when each end has other nodes.
        const aOnly = new Set([...ja.nodes].filter((k) => !jb.nodes.has(k)))
        const bOnly = new Set([...jb.nodes].filter((k) => !ja.nodes.has(k)))
        if (aOnly.size && bOnly.size && (aOnly.size < ja.nodes.size || bOnly.size < jb.nodes.size)) {
          ja = { ...ja, nodes: aOnly }
          jb = { ...jb, nodes: bOnly }
        }
        addGapEdges(g, 80)
        bridgeComponents(g)
        const path = dijkstra(g, ja.nodes, jb.nodes)
        if (process.env.DEBUG_ROW === label) debugRow(g, cands, ja, jb, path)
        if (!path) why = 'the two junctions are not connected along the road'
        else {
          const pts = path.map((k) => g.pos.get(k))
          let len = 0
          for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
          if (len < 15) why = 'the two junctions coincide on the road'
          else {
            selected = corridor(g, pts, 45)
            cutApplied = true
            cutApprox = Boolean(ja.approx || jb.approx)
          }
        }
      }
    } else if (cls.kind === 'square' && /vonala$/.test(item.from ?? '')) {
      // "X utca vonala": the part of the square on the line of street X.
      const j = junctionNodes(item.from, g, ctx)
      const line = item.from.replace(/ vonala$/, '')
      const jw = lookupName(line).filter((w) => boxesMeet(w.bbox, bboxOf([...g.pos.values()]), 200) && !ctx.wayIds.has(w.id))
      const near = g.segs.filter((s) => jw.some((w) => nearBox(s.mid, w.bbox, 30) && polyDist(s.mid, w.pts) <= 30))
      if (j.error && !near.length) why = j.error
      else if (!near.length) why = `no part of the square lies on the line of ${line}`
      else {
        selected = near
        cutApplied = true
      }
    } else {
      why = `section given as "${item.from ?? item.to}" only`
    }
    if (why) cutFailed.push({ row: label, name: item.name, section: sectionOf(item), reason: why })
  }
  selected = selected.filter(inside)
  if (!cutApplied && (cls.type === 'name' || cls.type === 'ref')) {
    const groups = clusters([...new Set(selected.map((s) => s.way))].map((id) => wayById.get(id)))
    const far = groups.length > 1 && groups.some((a, i) => groups.some((b, j) => j > i && !a.some((w) => b.some((w2) => boxesMeet(w.bbox, w2.bbox, 300)))))
    if (far) ambiguous.push({ row: label, name: item.name, clusters: groups.length })
  }
  results.push({ item, cls, selected, partial, cutApplied, cutApprox, clipRegion, cands })
}

// --- gap bridging -----------------------------------------------------------------------
// The name rules leave a road in pieces wherever OpenStreetMap gives a short stretch of it
// another name or none: the junction area, a roundabout, a slip lane, a short bridge. Two
// pieces of one row are joined by the shortest OSM path between a loose end of one piece and
// the other piece when all of this holds (D49):
//   - the path is at most BRIDGE_MAX m long and runs only over carriageways (BRIDGE_CLASS; no
//     motorway, service, footway, pedestrian or track);
//   - it heads on from the end: the end's outward direction and the straight line to the
//     other piece differ by at most BRIDGE_ANGLE degrees, and the same holds at the other
//     piece's end (so the two carriageways of a dual road are never joined sideways);
//   - it is no detour: length <= 1.5 x the straight distance + 20 m, and it keeps within
//     max(20 m, half the straight distance) of that straight line (a parallel street or a
//     cross street fails this);
//   - it crosses other streets but does not follow them: at most BRIDGE_STREET_MAX m of it run
//     on named ways other than roundabouts, bridges and squares (a road interrupted by a
//     square or a roundabout is bridged across it; a same-name side road is not taken);
//   - it stays inside the row's district (+25 m), like the rest of the row.
// Only pieces already selected are joined, so a partial row never grows past its section
// ends. Rows of squares, ramps and service roads are left as they are (their pieces are
// separate by nature).
// Every bridge is DISPLAY ONLY: it is written as its own feature with the row's annex, row and
// name and `kind: 'link'`, which the resolver skips (like tunnels). The map draws it; who is
// responsible for a pin is decided by the rows' own geometry alone.
const BRIDGE_MAX = 150
const BRIDGE_ANGLE = 45
const BRIDGE_STREET_MAX = 25
const BRIDGE_CLASS = /^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|road)(_link)?$/
const GRID = 500
const wayGrid = new Map()
for (const w of ways) {
  if (!BRIDGE_CLASS.test(w.tags.highway) || w.tags.area === 'yes') continue
  for (let gx = Math.floor(w.bbox[0] / GRID); gx <= Math.floor(w.bbox[2] / GRID); gx++)
    for (let gy = Math.floor(w.bbox[1] / GRID); gy <= Math.floor(w.bbox[3] / GRID); gy++) addTo(wayGrid, `${gx},${gy}`, w)
}
function waysNear(b, buf) {
  const out = new Set()
  for (let gx = Math.floor((b[0] - buf) / GRID); gx <= Math.floor((b[2] + buf) / GRID); gx++)
    for (let gy = Math.floor((b[1] - buf) / GRID); gy <= Math.floor((b[3] + buf) / GRID); gy++)
      for (const w of wayGrid.get(`${gx},${gy}`) ?? []) if (boxesMeet(w.bbox, b, buf)) out.add(w)
  return [...out]
}
const bridges = []
const gapDiag = []
const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Splits selected pieces into connected parts (shared nodes, or ends within 3 m). */
function partsOf(segs) {
  const parent = new Map()
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => parent.set(find(a), find(b))
  const pos = new Map()
  const sadj = new Map()
  for (const s of segs) {
    for (const [k, p] of [[s.a, s.p], [s.b, s.q]]) {
      if (!parent.has(k)) parent.set(k, k)
      pos.set(k, p)
    }
    addTo(sadj, s.a, s.b)
    addTo(sadj, s.b, s.a)
    union(s.a, s.b)
  }
  const cell = new Map()
  for (const [k, p] of pos) addTo(cell, `${Math.floor(p[0] / 3)},${Math.floor(p[1] / 3)}`, k)
  for (const [k, p] of pos) {
    const cx = Math.floor(p[0] / 3)
    const cy = Math.floor(p[1] / 3)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const k2 of cell.get(`${cx + dx},${cy + dy}`) ?? []) {
          const q = pos.get(k2)
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= 3) union(k, k2)
        }
  }
  return { pos, sadj, find }
}

/** Unit vector from node k into the piece through neighbour n, over its first ~20 m. */
function inwardAt(k, n, sadj, pos) {
  let prev = k
  let cur = n
  let run = Math.hypot(pos.get(n)[0] - pos.get(k)[0], pos.get(n)[1] - pos.get(k)[1])
  while (run < 20) {
    const next = sadj.get(cur).filter((x) => x !== prev)
    if (next.length !== 1 || next[0] === k) break
    run += Math.hypot(pos.get(next[0])[0] - pos.get(cur)[0], pos.get(next[0])[1] - pos.get(cur)[1])
    prev = cur
    cur = next[0]
  }
  const p = pos.get(k)
  const q = pos.get(cur)
  const len = Math.hypot(q[0] - p[0], q[1] - p[1])
  return len < 3 ? null : [(q[0] - p[0]) / len, (q[1] - p[1]) / len]
}

function bridgeGaps(r) {
  const label = `${r.item.annex}/${r.item.row}`
  if (!(r.cls.type === 'name' || r.cls.type === 'ref') || r.cls.kind === 'square' || r.selected.length < 2) return
  const { pos, sadj, find } = partsOf(r.selected)
  if (new Set([...pos.keys()].map(find)).size < 2) return
  const ends = [...pos.keys()].filter((k) => sadj.get(k).length === 1)
  const g = buildGraph([...new Set([...waysNear(bboxOf([...pos.values()]), BRIDGE_MAX + 50), ...r.cands])], () => true)
  const segByEdge = new Map(g.segs.map((s) => [edgeKey(s.a, s.b), s]))
  const taken = new Set(r.selected.map((s) => edgeKey(s.a, s.b)))
  const cosMax = Math.cos((BRIDGE_ANGLE * Math.PI) / 180)
  const found = []
  for (const e of ends) {
    if (!g.pos.has(e)) continue
    // Shortest paths from this end, not along the row's own pieces, stopping at the first
    // selected node reached.
    const dist = new Map([[e, 0]])
    const prev = new Map()
    const heap = [[0, e]]
    const hits = []
    while (heap.length) {
      let bi = 0
      for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i
      const [d, k] = heap[bi]
      heap[bi] = heap.at(-1)
      heap.pop()
      if (d > dist.get(k)) continue
      if (k !== e && pos.has(k)) {
        if (find(k) !== find(e)) hits.push(k)
        continue
      }
      for (const ed of g.adj.get(k) ?? []) {
        if (taken.has(edgeKey(k, ed.to))) continue
        const nd = d + ed.w
        if (nd > BRIDGE_MAX || nd >= (dist.get(ed.to) ?? Infinity)) continue
        dist.set(ed.to, nd)
        prev.set(ed.to, k)
        heap.push([nd, ed.to])
      }
    }
    const ie = inwardAt(e, sadj.get(e)[0], sadj, pos)
    for (const f of hits) {
      const path = [f]
      while (path.at(-1) !== e) path.push(prev.get(path.at(-1)))
      const segs = []
      for (let i = 1; i < path.length; i++) segs.push(segByEdge.get(edgeKey(path[i - 1], path[i])))
      const L = dist.get(f)
      const pe = pos.get(e)
      const pf = pos.get(f)
      const d = Math.hypot(pf[0] - pe[0], pf[1] - pe[1])
      const u = d > 0 ? [(pf[0] - pe[0]) / d, (pf[1] - pe[1]) / d] : [0, 0]
      const why = []
      if (L > 1.5 * d + 20) why.push('detour')
      // The piece must end here and the other piece must start there, both in line with the
      // gap: at f every branch of the other piece leads on (a fork into two carriageways is
      // fine; the side of a passing road is not).
      if (ie && -(ie[0] * u[0] + ie[1] * u[1]) < cosMax) why.push('turns off at the end')
      if (!sadj.get(f).every((n) => {
        const v = inwardAt(f, n, sadj, pos)
        return !v || v[0] * u[0] + v[1] * u[1] >= cosMax
      })) why.push('does not lead on at the other piece')
      const dev = Math.max(...path.map((k) => segDist(g.pos.get(k)[0], g.pos.get(k)[1], pe[0], pe[1], pf[0], pf[1])))
      if (dev > Math.max(20, d / 2)) why.push('leaves the straight line')
      if (!segs.every((s) => inRegion(s.mid, r.clipRegion, 25))) why.push('outside the district')
      // A street of its own (or a same-name side road the cut left out) may only be crossed,
      // not followed: at most BRIDGE_STREET_MAX m of the path may run on a named way that is
      // not a roundabout, a bridge or a square.
      let street = 0
      for (const s of segs) {
        const t = wayById.get(s.way).tags
        if (t.name && !/^(roundabout|circular)$/.test(t.junction ?? '') && !(t.bridge && t.bridge !== 'no') && !/ (tér|tere|körtér|körönd)$/.test(t.name)) street += s.len
      }
      if (street > BRIDGE_STREET_MAX) why.push(`follows a street for ${Math.round(street)} m`)
      found.push({ e, f, L, d, dev, segs, why })
    }
  }
  // Each loose end takes its shortest valid bridge (so both carriageways of a dual road are
  // joined across a junction, not only the first); the same path found from both of its ends
  // is added once.
  found.sort((a, b) => a.L - b.L)
  const done = new Set()
  const seen = new Set()
  const added = []
  for (const c of found) {
    const id = c.segs.map((s) => edgeKey(s.a, s.b)).sort().join()
    if (done.has(c.e) || seen.has(id)) continue
    const wayIds = [...new Set(c.segs.map((s) => s.way))]
    const wayTags = wayIds.map((id) => wayById.get(id).tags)
    const diag = {
      row: label,
      name: r.item.name,
      metres: Math.round(c.L),
      straight: Math.round(c.d),
      at: unproj(pos.get(c.e)).map((v) => +v.toFixed(6)).reverse(),
      ways: wayTags.map((t) => `${t.highway}${t.junction ? '/' + t.junction : ''}${t.bridge && t.bridge !== 'no' ? '/bridge' : ''}:${t.name ?? '-'}`),
      cause: gapCause(wayTags, r),
      why: c.why,
    }
    gapDiag.push(diag)
    if (c.why.length) continue
    seen.add(id)
    done.add(c.e)
    if (sadj.get(c.f).length === 1) done.add(c.f)
    added.push(...c.segs)
    bridges.push({ row: label, metres: Math.round(c.L), cause: diag.cause, at: diag.at, ways: wayIds.sort((a, b) => a - b) })
  }
  // Display only (D49): drawn as a separate `kind: 'link'` feature, never part of the row's
  // own geometry, so the resolver's answer does not change.
  if (added.length) r.links = [...(r.links ?? []), ...new Set(added)]
}

/** Why OpenStreetMap leaves this stretch out of the row's ways (for the audit report). */
function gapCause(tags, r) {
  const own = new Set(r.cands.map((w) => w.tags.name).filter(Boolean))
  if (tags.some((t) => /_link$/.test(t.highway))) return 'link road'
  if (tags.some((t) => /^(roundabout|circular)$/.test(t.junction ?? ''))) return 'roundabout'
  if (tags.some((t) => t.bridge && t.bridge !== 'no' && !own.has(t.name))) return 'bridge under another name'
  if (tags.every((t) => own.has(t.name))) return 'own name, cut away'
  if (tags.some((t) => !t.name)) return 'unnamed piece'
  return 'piece under another name'
}

for (const r of results) bridgeGaps(r)

// --- junction links between rows (display only) ---------------------------------------
// A row whose section ends at a junction often stops a few metres short of the next capital
// road (district clip, offset junction nodes, an unlisted roundabout). A loose end that
// touches no other row is joined to the nearest other capital row ahead over an OSM
// carriageway path of at most JUNCTION_LINK_MAX m, with the bridge rules for direction and
// detour (the other road may be met from the side: that is what a junction is). Written as a
// `kind: 'link'` feature of the row the end belongs to; never used for responsibility.
const JUNCTION_LINK_MAX = 25
const junctionLinks = []
{
  const rowsAt = new Map() // node key -> row labels whose own geometry uses it
  const allPts = new Map() // 3 m cell -> [point, label]
  const taken = new Set()
  for (const r of results) {
    const label = `${r.item.annex}/${r.item.row}`
    for (const s of [...r.selected, ...(r.links ?? [])]) {
      taken.add(edgeKey(s.a, s.b))
      for (const [k, p] of [[s.a, s.p], [s.b, s.q]]) {
        if (!rowsAt.has(k)) rowsAt.set(k, new Set())
        rowsAt.get(k).add(label)
        addTo(allPts, `${Math.floor(p[0] / 3)},${Math.floor(p[1] / 3)}`, [p, label])
      }
    }
  }
  const touchesOther = (p, label) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const [q, l] of allPts.get(`${Math.floor(p[0] / 3) + dx},${Math.floor(p[1] / 3) + dy}`) ?? []) {
          if (l !== label && Math.hypot(q[0] - p[0], q[1] - p[1]) <= 3) return true
        }
    return false
  }
  const cosMax = Math.cos((BRIDGE_ANGLE * Math.PI) / 180)
  const seen = new Set()
  for (const r of results) {
    if (!r.selected.length) continue
    const label = `${r.item.annex}/${r.item.row}`
    const { pos, sadj } = partsOf([...r.selected, ...(r.links ?? [])])
    for (const [e, pe] of pos) {
      if (sadj.get(e).length !== 1 || touchesOther(pe, label)) continue
      const ie = inwardAt(e, sadj.get(e)[0], sadj, pos)
      if (!ie) continue
      const g = buildGraph(waysNear([pe[0], pe[1], pe[0], pe[1]], JUNCTION_LINK_MAX + 20), () => true)
      if (!g.pos.has(e)) continue
      const segByEdge = new Map(g.segs.map((s) => [edgeKey(s.a, s.b), s]))
      const dist = new Map([[e, 0]])
      const prev = new Map()
      const heap = [[0, e]]
      let hit = null
      while (heap.length && !hit) {
        let bi = 0
        for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i
        const [d, k] = heap[bi]
        heap[bi] = heap.at(-1)
        heap.pop()
        if (d > dist.get(k)) continue
        if (k !== e && rowsAt.has(k)) {
          // Another row ends the search; the row's own geometry is not crossed.
          if (!rowsAt.get(k).has(label)) hit = k
          continue
        }
        for (const ed of g.adj.get(k) ?? []) {
          if (taken.has(edgeKey(k, ed.to))) continue
          const nd = d + ed.w
          if (nd > JUNCTION_LINK_MAX || nd >= (dist.get(ed.to) ?? Infinity)) continue
          dist.set(ed.to, nd)
          prev.set(ed.to, k)
          heap.push([nd, ed.to])
        }
      }
      if (!hit) continue
      const path = [hit]
      while (path.at(-1) !== e) path.push(prev.get(path.at(-1)))
      const segs = []
      for (let i = 1; i < path.length; i++) segs.push(segByEdge.get(edgeKey(path[i - 1], path[i])))
      const pf = g.pos.get(hit)
      const d = Math.hypot(pf[0] - pe[0], pf[1] - pe[1])
      const L = dist.get(hit)
      if (d < 1 || L > 1.5 * d + 20) continue
      const u = [(pf[0] - pe[0]) / d, (pf[1] - pe[1]) / d]
      if (-(ie[0] * u[0] + ie[1] * u[1]) < cosMax) continue // must head on from the end
      if (Math.max(...path.map((k) => segDist(g.pos.get(k)[0], g.pos.get(k)[1], pe[0], pe[1], pf[0], pf[1]))) > Math.max(20, d / 2)) continue
      const id = segs.map((s) => edgeKey(s.a, s.b)).sort().join()
      if (seen.has(id)) continue
      seen.add(id)
      r.links = [...(r.links ?? []), ...segs]
      junctionLinks.push({
        row: label,
        to: [...rowsAt.get(hit)].sort().join(', '),
        metres: Math.round(L),
        at: unproj(pe).map((v) => +v.toFixed(6)).reverse(),
        ways: [...new Set(segs.map((s) => s.way))].sort((a, b) => a - b),
      })
    }
  }
}
// GAP_DIAG=<file> writes every bridge candidate, kept or refused with the reason (for review).
if (process.env.GAP_DIAG) await writeFile(process.env.GAP_DIAG, JSON.stringify(gapDiag, null, 1))

function debugRow(g, cands, ja, jb, path) {
  const ll = (k) => unproj(g.pos.get(k)).map((v) => v.toFixed(5)).reverse().join(',')
  console.log('candidate ways:', cands.map((w) => `${w.id}:${w.tags.highway}:${w.tags.name}`).join(' '))
  console.log('clusters:', clusters(cands).map((c) => c.length).join(','))
  console.log('from nodes:', [...ja.nodes].slice(0, 8).map(ll).join(' '), ja.nodes.size)
  console.log('to nodes:', [...jb.nodes].slice(0, 8).map(ll).join(' '), jb.nodes.size)
  console.log('path:', path ? `${path.length} nodes ${ll(path[0])} -> ${ll(path.at(-1))}` : 'none')
}

function sectionOf(item) {
  if (item.from !== null && item.to !== null) return `${item.from} – ${item.to}`
  return item.from ?? item.to ?? null
}

// --- output -----------------------------------------------------------------------------
const TOLERANCE = 0.000015 // degrees, about 1.1–1.7 m
const round = (n) => Math.round(n * 1e6) / 1e6
function linesOf(selected) {
  const byWay = new Map()
  for (const s of selected) addTo(byWay, s.way, s)
  const lines = []
  for (const segs of byWay.values()) {
    segs.sort((a, b) => a.idx - b.idx)
    let cur = null
    for (const s of segs) {
      if (cur && cur.last === s.idx - 1) {
        cur.pts.push(s.q)
        cur.last = s.idx
      } else {
        cur = { pts: [s.p, s.q], last: s.idx }
        lines.push(cur)
      }
    }
  }
  return joinLines(lines.map((l) => l.pts)).map((pts) => {
    const coords = pts.map(unproj)
    const simple = coords.length > 2 ? simplify({ type: 'LineString', coordinates: coords }, { tolerance: TOLERANCE, highQuality: true }).coordinates : coords
    const out = []
    for (const c of simple.map((xy) => xy.map(round))) if (!out.length || out.at(-1)[0] !== c[0] || out.at(-1)[1] !== c[1]) out.push(c)
    return out
  }).filter((l) => l.length >= 2)
}

// Joins polylines that share an end point (consecutive OSM ways) so each road is drawn
// with fewer, longer lines. Direction does not matter for these lines.
function joinLines(lines) {
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`
  const ends = new Map()
  lines.forEach((l, i) => {
    addTo(ends, key(l[0]), i)
    addTo(ends, key(l.at(-1)), i)
  })
  const used = new Set()
  const out = []
  const takeAt = (p, self) => (ends.get(key(p)) ?? []).find((j) => j !== self && !used.has(j))
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    let line = lines[i].slice()
    for (const atEnd of [true, false]) {
      for (;;) {
        const p = atEnd ? line.at(-1) : line[0]
        const j = takeAt(p, i)
        if (j === undefined) break
        used.add(j)
        let next = lines[j]
        if (atEnd) {
          if (key(next[0]) !== key(p)) next = next.slice().reverse()
          line = line.concat(next.slice(1))
        } else {
          if (key(next.at(-1)) !== key(p)) next = next.slice().reverse()
          line = next.slice(0, -1).concat(line)
        }
      }
    }
    out.push(line)
  }
  return out
}

const features = []
const wayIdsByRow = {}
const highwaysByRow = {}
const duplicates = []
const seenGeometry = new Map()
const lengthOf = (lines) => {
  let m = 0
  for (const l of lines) for (let i = 1; i < l.length; i++) m += Math.hypot((l[i][0] - l[i - 1][0]) * KX, (l[i][1] - l[i - 1][1]) * KY)
  return m
}
for (const { item, cls, selected, partial, cutApplied, cutApprox } of results) {
  const label = `${item.annex}/${item.row}`
  const lines = linesOf(selected)
  if (!lines.length) {
    unmatched.push({ annex: item.annex, row: item.row, name: item.name, reason: 'geometry empty after cutting' })
    continue
  }
  const metres = lengthOf(lines)
  if (metres < 20) {
    unmatched.push({ annex: item.annex, row: item.row, name: item.name, reason: `only a ${Math.round(metres)} m fragment matched` })
    continue
  }
  const geometry = lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines }
  const key = JSON.stringify(geometry)
  if (seenGeometry.has(key) && /continues row/.test(item.note ?? '')) {
    // Continuation rows of one plural row ("… útjai") can match the same ways; keep the
    // geometry once, on the first of them. Other rows with equal geometry stay separate.
    const first = seenGeometry.get(key)
    duplicates.push({ row: label, sameAs: first })
    unmatched.push({ annex: item.annex, row: item.row, name: item.name, reason: `same geometry as row ${first}, kept there once` })
    continue
  }
  if (!seenGeometry.has(key)) seenGeometry.set(key, label)
  wayIdsByRow[label] = [...new Set(selected.map((s) => s.way))].sort((a, b) => a - b)
  highwaysByRow[label] = [...new Set(wayIdsByRow[label].map((id) => wayById.get(id).tags.highway))].sort()
  features.push({
    type: 'Feature',
    properties: {
      name: item.name,
      annex: item.annex,
      row: item.row,
      partial,
      cutApplied,
      cutApprox,
      section: sectionOf(item),
      kind: cls.kind,
    },
    geometry,
  })
}

// Display-only links (gap bridges and junction links, D49): one `kind: 'link'` feature per row,
// after the row's own feature. Same properties as the row so the map and the audit can name it.
const linkFeatures = []
for (const r of results) {
  if (!r.links?.length) continue
  const parent = features.find((f) => f.properties.annex === r.item.annex && f.properties.row === r.item.row)
  if (!parent) continue
  const lines = linesOf(r.links)
  if (!lines.length) continue
  linkFeatures.push({
    type: 'Feature',
    properties: { ...parent.properties, kind: 'link' },
    geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines },
  })
}

// --- hand-placed rows (capital-roads-osm-places.json) -----------------------------------
// A square or area is written as its closed outline rings (outer and inner) with
// `area: true`; the resolver treats it as a polygon (pin inside, or within a few metres of the
// outline) instead of snapping 15 m around it. Roads are the listed ways as drawn.
const placeEls = new Map(placesOsm.elements.map((e) => [`${e.type}/${e.id}`, e]))
const placeProblems = []
const placeWays = {}
const isClosed = (g) => g.length >= 4 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon
for (const item of placedItems) {
  const label = `${item.annex}/${item.row}`
  const p = places.rows[label]
  const lines = []
  const rings = []
  const wayIds = []
  const highways = new Set()
  const addWay = (id, tags, geometry) => {
    wayIds.push(id)
    // The audit report lists highway types per row; an area without one (a parking lot) is
    // listed by its defining tag, e.g. "(amenity=parking)".
    if (tags?.highway) highways.add(tags.highway)
    else if (tags?.amenity) highways.add(`(amenity=${tags.amenity})`)
    else placeProblems.push(`${label}: way ${id} has neither highway nor amenity tag`)
    if (/^motorway/.test(tags?.highway ?? '')) placeProblems.push(`${label}: way ${id} is a motorway`)
    const pts = geometry.map((g) => proj(g.lon, g.lat))
    if (p.kind === 'square') {
      if (!isClosed(geometry)) placeProblems.push(`${label}: way ${id} is not a closed area`)
      rings.push(pts)
    } else lines.push(pts)
  }
  for (const ref of p.elements) {
    const el = placeEls.get(ref)
    if (!el) {
      placeProblems.push(`${label}: ${ref} not returned by Overpass (deleted?)`)
      continue
    }
    if (el.type === 'way') addWay(el.id, el.tags, el.geometry)
    else {
      if (p.kind !== 'square' || el.tags?.type !== 'multipolygon') placeProblems.push(`${label}: ${ref} must be a multipolygon of a square`)
      for (const m of el.members ?? []) {
        if (m.type !== 'way' || !m.geometry || !['outer', 'inner'].includes(m.role)) placeProblems.push(`${label}: ${ref} member ${m.type}/${m.ref} (${m.role}) not usable`)
        else addWay(m.ref, el.tags, m.geometry) // member ways carry the relation's tags
      }
    }
  }
  const region = [districts.get(item.district)]
  const outside = [...lines, ...rings].flat().filter((pt) => !inRegion(pt, region, 40))
  if (outside.length) placeProblems.push(`${label}: ${outside.length} points lie more than 40 m outside ${item.district}`)
  const partial = item.from !== null || item.to !== null
  if (p.approx && p.kind === 'road' && !partial) placeProblems.push(`${label}: approx needs a section (partial row)`)
  const all = [...lines, ...rings]
  const coords = all.map((l) => {
    const out = []
    for (const c of l.map(unproj).map((xy) => xy.map(round))) if (!out.length || out.at(-1)[0] !== c[0] || out.at(-1)[1] !== c[1]) out.push(c)
    return out
  }).filter((l) => l.length >= 2)
  if (p.kind === 'square' && coords.some((l) => l.length < 4 || l[0][0] !== l.at(-1)[0] || l[0][1] !== l.at(-1)[1])) placeProblems.push(`${label}: an outline ring is not closed after rounding`)
  wayIdsByRow[label] = [...new Set(wayIds)].sort((a, b) => a - b)
  highwaysByRow[label] = [...highways].sort()
  placeWays[label] = { kind: p.kind, approx: Boolean(p.approx), elements: p.elements }
  remarks.push({ row: label, name: item.name, note: `hand-placed on OSM ${p.elements.join(', ')} (capital-roads-osm-places.json)` })
  features.push({
    type: 'Feature',
    properties: {
      name: item.name,
      annex: item.annex,
      row: item.row,
      partial,
      cutApplied: partial,
      cutApprox: partial && Boolean(p.approx),
      section: sectionOf(item),
      kind: p.kind,
      ...(p.kind === 'square' ? { area: true } : {}),
    },
    geometry: coords.length === 1 ? { type: 'LineString', coordinates: coords[0] } : { type: 'MultiLineString', coordinates: coords },
  })
}

// Ways each row covers whole (audit, roadmap 6.17): the map recolours base-map features by
// id where a feature lies wholly on the capital roads (scripts/build-capital-display.mjs, D55).
/** Densified pieces of a whole way, as buildGraph cuts it. */
const piecesOf = (w) => {
  let n = 0
  for (let i = 1; i < w.pts.length; i++) n += Math.max(1, Math.ceil(Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]) / STEP))
  return n
}
const coveredWhole = (segs) => {
  const idx = new Map()
  for (const s of segs) if (s.way !== undefined) addTo(idx, s.way, s.idx)
  return [...idx].filter(([id, list]) => new Set(list).size === piecesOf(wayById.get(id))).map(([id]) => id).sort((a, b) => a - b)
}
const shown = new Set(features.map((f) => `${f.properties.annex}/${f.properties.row}`))
const wholeWaysByRow = {}
for (const r of results) if (shown.has(`${r.item.annex}/${r.item.row}`)) wholeWaysByRow[`${r.item.annex}/${r.item.row}`] = coveredWhole(r.selected)
for (const [label, p] of Object.entries(placeWays)) if (p.kind !== 'square') wholeWaysByRow[label] = wayIdsByRow[label]

// Row order: annex, number, letter ("71a" after 71), sub-row ("144.2").
const rowKey = (annex, row) => {
  const m = /^(\d+)([a-z]?)(?:\.(\d+))?$/.exec(row)
  return [annex, Number(m[1]), m[2] ? m[2].charCodeAt(0) : 0, Number(m[3] ?? 0)]
}
const byRowKey = (a, b) => {
  const [x, y] = [rowKey(a.annex, a.row), rowKey(b.annex, b.row)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
features.sort((a, b) => byRowKey(a.properties, b.properties))
unmatched.sort(byRowKey)

// --- checks (nothing is written unless all pass) ---------------------------------------
const total = decree.items.filter((i) => i.name !== '').length
const problems = [...placeProblems]
const accounted = [...features.map((f) => `${f.properties.annex}/${f.properties.row}`), ...unmatched.map((u) => `${u.annex}/${u.row}`)]
if (accounted.length !== total || new Set(accounted).size !== total) problems.push(`rows accounted ${accounted.length} (unique ${new Set(accounted).size}) != decree rows ${total}`)
const motorway = Object.entries(wayIdsByRow).filter(([row, ids]) => !placeWays[row] && ids.some((id) => /^motorway/.test(wayById.get(id).tags.highway)))
if (motorway.length) problems.push(`motorway ways in rows ${motorway.map(([r]) => r).join(', ')}`)
// The unmatched rows must be exactly the committed, reviewed list. After a decree or OSM
// change, review the difference and rerun with --accept-unmatched to update the list.
const unmatchedKeys = unmatched.map((u) => `${u.annex}/${u.row}`)
if (args.has('--accept-unmatched')) {
  await writeFile(EXPECTED_UNMATCHED, JSON.stringify(unmatched.map((u) => ({ row: `${u.annex}/${u.row}`, name: u.name, reason: u.reason })), null, 1) + '\n')
  console.log(`Wrote ${EXPECTED_UNMATCHED} (${unmatched.length} rows) — review it before committing`)
}
if (!existsSync(EXPECTED_UNMATCHED)) problems.push(`${EXPECTED_UNMATCHED} missing (run with --accept-unmatched once and review it)`)
else {
  const expectedKeys = JSON.parse(await readFile(EXPECTED_UNMATCHED, 'utf8')).map((u) => u.row)
  const extra = unmatchedKeys.filter((k) => !expectedKeys.includes(k))
  const gone = expectedKeys.filter((k) => !unmatchedKeys.includes(k))
  if (extra.length) problems.push(`newly unmatched rows: ${extra.join(', ')}`)
  if (gone.length) problems.push(`rows no longer unmatched: ${gone.join(', ')}`)
}

// --- summary ----------------------------------------------------------------------------
const matched = features.length
const cut = features.filter((f) => f.properties.cutApplied).length
const approx = features.filter((f) => f.properties.cutApprox).length
const partialUncut = features.filter((f) => f.properties.partial && !f.properties.cutApplied).length
console.log('')
console.log('Unmatched rows:')
console.table(unmatched.map((u) => ({ row: `${u.annex}/${u.row}`, name: u.name, reason: u.reason })))
console.log('Partial rows whose section could not be cut (whole road kept, cutApplied: false):')
console.table(cutFailed)
console.log('Uncut rows whose name matches several separate road pieces (kept all):')
console.table(ambiguous)
if (args.has('--verbose')) {
  console.log('Remarks:')
  console.table(remarks)
}
console.log(
  `Rows: ${total} (empty rows skipped: ${decree.items.length - total}); matched ${matched}: whole ${matched - cut - partialUncut}, ` +
    `partial cut ${cut} (of which approximate ${approx}), partial uncut ${partialUncut}; unmatched ${unmatched.length}`,
)
console.log(`Display-only links: ${bridges.length} gap bridges in ${new Set(bridges.map((b) => b.row)).size} rows, ${bridges.reduce((s, b) => s + b.metres, 0)} m (longest ${Math.max(0, ...bridges.map((b) => b.metres))} m); ${junctionLinks.length} junction links, ${junctionLinks.reduce((s, b) => s + b.metres, 0)} m`)
if (problems.length) fail(`checks failed, nothing written:\n  ${problems.join('\n  ')}`)

const out = {
  type: 'FeatureCollection',
  source: decree.source,
  consolidatedVersion: decree.consolidatedVersion,
  osmSource: 'OpenStreetMap contributors (ODbL)',
  generatedOn: new Date().toISOString().slice(0, 10),
  unmatched,
  // Each row's display-only link feature follows the row's own feature (stable sort).
  features: [...features, ...linkFeatures].sort((a, b) => byRowKey(a.properties, b.properties)),
}
const text = JSON.stringify(out)
await writeFile(OUT, text + '\n')
// Audit trail for reviewers (committed): every decision the rules or overrides made.
await writeFile(
  REPORT,
  JSON.stringify(
    {
      generatedOn: out.generatedOn,
      osmBase: osm.osm3s?.timestamp_osm_base ?? null,
      placesOsmBase: placesOsm.osm3s?.timestamp_osm_base ?? null,
      unmatched,
      cutFailed,
      ambiguous,
      duplicates,
      bridges,
      junctionLinks,
      places: placeWays,
      remarks,
      highways: highwaysByRow,
      osmWays: wayIdsByRow,
      // Ways each row covers whole (drawn from base-map features when the map shows them).
      wholeWays: wholeWaysByRow,
    },
    null,
    1,
  ).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.replace(/\s*\n\s*/g, ' ')}]`) + '\n', // one line per array
)
console.log(`Wrote ${OUT}: ${(text.length / 1024).toFixed(0)} KB; audit report ${REPORT}`)
