// Validates the bundled data files in src/data/ (roadmap M1 exit criterion).
// Run: npm run validate:data   — exits non-zero and lists every problem found.
// The checks follow SPEC section 5 and docs/DATA-SOURCES.md: every contact has an official
// source and a verification date, nothing is half-filled, references point to real records.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII',
  'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII']
const TYPES = new Set(['district', 'fori', 'police'])
const CAPITAL_ROADS = new Set(['fori', 'district', 'both', 'unknown'])
const KINDS = new Set(['road', 'bridge', 'square', 'tunnel', 'other'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// Deliberately simple: one @, no spaces, a dot in the domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/[^\s]+$/

function isDate(s, today) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && s <= today
}

function checkAuthorities(data, today, errors) {
  const e = (m) => errors.push(`authorities.json: ${m}`)
  if (!data || !Array.isArray(data.authorities)) return e('missing "authorities" array')
  const ids = new Map()
  for (const [i, a] of data.authorities.entries()) {
    const at = `authorities[${i}]${a && a.id ? ` (${a.id})` : ''}`
    if (!a || typeof a.id !== 'string' || !/^[a-z0-9-]+$/.test(a.id)) { e(`${at}: bad id`); continue }
    if (ids.has(a.id)) e(`${at}: duplicate id`)
    ids.set(a.id, a)
    if (typeof a.name !== 'string' || a.name.trim() === '') e(`${at}: missing name`)
    if (!TYPES.has(a.type)) e(`${at}: type must be district | fori | police`)
    if (!Array.isArray(a.districts) || a.districts.some((d) => !Number.isInteger(d) || d < 1 || d > 23)) {
      e(`${at}: districts must be an array of integers 1–23`)
    }
    if (a.type !== 'fori' && Array.isArray(a.districts) && a.districts.length === 0) e(`${at}: no district`)
    if (typeof a.sourceUrl !== 'string' || !URL_RE.test(a.sourceUrl)) e(`${at}: sourceUrl missing or not a URL`)
    if (!isDate(a.verifiedOn, today)) e(`${at}: verifiedOn must be an ISO date not in the future`)
    if (a.email !== null && (typeof a.email !== 'string' || !EMAIL.test(a.email))) {
      e(`${at}: email must be null or a valid address (got ${JSON.stringify(a.email)})`)
    }
    if (a.phone !== null && (typeof a.phone !== 'string' || !/^(\+?[0-9 ()/-]{6,}|1[0-9]{2})$/.test(a.phone))) {
      e(`${at}: phone must be null or a phone number (got ${JSON.stringify(a.phone)})`)
    }
    if (a.web !== null && (typeof a.web !== 'string' || !URL_RE.test(a.web))) e(`${at}: web must be null or a URL`)
    // A field-level source is needed when the e-mail or phone comes from a different page.
    for (const f of ['email', 'phone']) {
      const src = a.fieldSources && a.fieldSources[f]
      if (src && (!URL_RE.test(src.url ?? '') || !isDate(src.verifiedOn, today))) {
        e(`${at}: fieldSources.${f} needs url and verifiedOn`)
      }
    }
    if (a.email === null && a.phone === null && a.web === null) e(`${at}: no way to contact (email, phone and web all null)`)
  }

  const rules = data.districtRules
  if (!Array.isArray(rules)) return e('missing "districtRules" array')
  const seen = new Set()
  for (const [i, r] of rules.entries()) {
    const at = `districtRules[${i}]${r && r.district ? ` (district ${r.district})` : ''}`
    if (!r || !Number.isInteger(r.district) || r.district < 1 || r.district > 23) { e(`${at}: bad district`); continue }
    if (seen.has(r.district)) e(`${at}: duplicate district`)
    seen.add(r.district)
    if (r.roman !== ROMAN[r.district - 1]) e(`${at}: roman must be ${ROMAN[r.district - 1]}`)
    if (typeof r.ownBody !== 'boolean') e(`${at}: ownBody must be true/false`)
    const primary = ids.get(r.primaryId)
    if (!primary) e(`${at}: primaryId "${r.primaryId}" is not an authority id`)
    else if (r.ownBody && primary.type !== 'district') e(`${at}: ownBody is true but primary is not a district body`)
    else if (!r.ownBody && primary.type !== 'fori') e(`${at}: no own body, so primary must be FÖRI (SPEC 4.2 step 4)`)
    else if (primary.type === 'district' && !primary.districts.includes(r.district)) e(`${at}: primary body does not cover this district`)
    const police = ids.get(r.policeId)
    if (!police || police.type !== 'police') e(`${at}: policeId "${r.policeId}" is not a police record`)
    else if (!police.districts.includes(r.district)) e(`${at}: police record does not cover this district`)
    if (!CAPITAL_ROADS.has(r.capitalRoads)) e(`${at}: capitalRoads must be fori | district | both | unknown`)
    if (typeof r.sourceUrl !== 'string' || !URL_RE.test(r.sourceUrl)) e(`${at}: sourceUrl missing`)
    if (!isDate(r.verifiedOn, today)) e(`${at}: verifiedOn missing or in the future`)
  }
  for (let d = 1; d <= 23; d++) if (!seen.has(d)) e(`districtRules: district ${ROMAN[d - 1]} missing`)
  if (![...ids.values()].some((a) => a.type === 'fori')) e('no FÖRI record')
}

function checkViolations(data, today, errors) {
  const e = (m) => errors.push(`violations.json: ${m}`)
  if (!data || !Array.isArray(data.violations)) return e('missing "violations" array')
  const ids = new Set()
  let other = 0
  for (const [i, v] of data.violations.entries()) {
    const at = `violations[${i}]${v && v.id ? ` (${v.id})` : ''}`
    if (!v || typeof v.id !== 'string' || !/^[a-z0-9-]+$/.test(v.id)) { e(`${at}: bad id`); continue }
    if (ids.has(v.id)) e(`${at}: duplicate id`)
    ids.add(v.id)
    if (typeof v.label !== 'string' || v.label.trim() === '') e(`${at}: missing label`)
    if (v.id === 'egyeb') { other++; continue }
    if (typeof v.sentence !== 'string' || v.sentence.trim() === '') e(`${at}: missing sentence`)
    // Legal reference is all-or-nothing: text, official URL and date together, or none (a gap).
    const hasRef = v.legalRef !== null && v.legalRef !== undefined
    if (hasRef) {
      if (typeof v.legalRef !== 'string' || v.legalRef.trim() === '') e(`${at}: legalRef empty`)
      if (typeof v.legalSourceUrl !== 'string' || !URL_RE.test(v.legalSourceUrl)) e(`${at}: legalRef without legalSourceUrl`)
      if (!isDate(v.verifiedOn, today)) e(`${at}: legalRef without verifiedOn`)
    }
    if (/bírság|büntet/i.test(v.sentence ?? '')) e(`${at}: sentence must not mention a fine (SPEC 7)`)
  }
  if (other !== 1) e('exactly one "egyeb" (free text) entry required')
}

function checkDistricts(geo, errors) {
  const e = (m) => errors.push(`districts.geojson: ${m}`)
  if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) return e('not a FeatureCollection')
  const nums = new Set()
  for (const f of geo.features) {
    const p = f.properties ?? {}
    if (!Number.isInteger(p.district) || p.district < 1 || p.district > 23) { e(`feature with bad district ${p.district}`); continue }
    if (nums.has(p.district)) e(`district ${p.district} twice`)
    nums.add(p.district)
    if (p.roman !== ROMAN[p.district - 1]) e(`district ${p.district}: roman must be ${ROMAN[p.district - 1]}`)
    if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) e(`district ${p.district}: geometry must be Polygon or MultiPolygon`)
    else checkRings(f.geometry, (m) => e(`district ${p.district}: ${m}`))
  }
  if (nums.size !== 23) e(`expected 23 districts, found ${nums.size}`)
  // The city outline tells "outside Budapest" apart from Margit-sziget and the Danube,
  // which lie in Budapest but in no district (Mötv. 22. § (4)).
  const b = geo.budapest
  if (!b || !['Polygon', 'MultiPolygon'].includes(b.type)) e('top-level "budapest" outline missing')
  else checkRings(b, (m) => e(`budapest outline: ${m}`))
}

function checkRings(geom, e) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  for (const poly of polys) {
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) { e('ring with fewer than 4 positions'); continue }
      const [a, b] = [ring[0], ring[ring.length - 1]]
      if (a[0] !== b[0] || a[1] !== b[1]) e('ring not closed')
      if (ring.some(([lon, lat]) => !inBudapestBox(lon, lat))) e('coordinate outside the Budapest bounding box')
    }
  }
}

// Generous box around Budapest; catches swapped lat/lon and stray data.
function inBudapestBox(lon, lat) {
  return lon > 18.8 && lon < 19.4 && lat > 47.3 && lat < 47.65
}

function checkCapitalRoads(geo, errors) {
  const e = (m) => errors.push(`capital-roads.geojson: ${m}`)
  if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) return e('not a FeatureCollection')
  if (typeof geo.source !== 'string' || !URL_RE.test(geo.source)) e('top-level "source" URL missing')
  if (geo.features.length === 0) e('no features')
  for (const [i, f] of geo.features.entries()) {
    const p = f.properties ?? {}
    const at = `feature ${i} (${p.name ?? '?'})`
    if (typeof p.name !== 'string' || p.name === '') e(`${at}: missing name`)
    if (typeof p.partial !== 'boolean') e(`${at}: partial must be true/false`)
    if (typeof p.cutApplied !== 'boolean') e(`${at}: cutApplied must be true/false`)
    if (p.cutApplied && !p.partial) e(`${at}: cutApplied without partial`)
    if (typeof p.cutApprox !== 'boolean') e(`${at}: cutApprox must be true/false`)
    if (p.cutApprox && !p.cutApplied) e(`${at}: cutApprox without cutApplied`)
    if ('osmWays' in p) e(`${at}: osmWays belongs in the audit report, not the shipped file`)
    if (!KINDS.has(p.kind)) e(`${at}: bad kind ${p.kind}`)
    const g = f.geometry
    if (!g || !['LineString', 'MultiLineString'].includes(g.type)) { e(`${at}: geometry must be LineString or MultiLineString`); continue }
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates
    for (const line of lines) {
      if (!Array.isArray(line) || line.length < 2) e(`${at}: line with fewer than 2 positions`)
      else if (line.some(([lon, lat]) => !inBudapestBox(lon, lat))) e(`${at}: coordinate outside Budapest`)
    }
  }
}

/** Runs every check. Returns the list of problems (empty = valid). */
export function validateData(dataDir, today = new Date().toISOString().slice(0, 10)) {
  const errors = []
  const parsed = {}
  const load = (name, check) => {
    const file = join(dataDir, name)
    if (!existsSync(file)) return errors.push(`${name}: file missing`)
    try { parsed[name] = JSON.parse(readFileSync(file, 'utf8')) } catch (err) { return errors.push(`${name}: invalid JSON (${err.message})`) }
    check(parsed[name])
  }
  load('authorities.json', (d) => checkAuthorities(d, today, errors))
  load('violations.json', (d) => checkViolations(d, today, errors))
  load('districts.geojson', (d) => checkDistricts(d, errors))
  load('capital-roads.geojson', (d) => checkCapitalRoads(d, errors))
  checkCrossRefs(parsed['authorities.json'], parsed['capital-roads.geojson'], errors)
  return errors
}

// districtActsOn entries name decree rows; each must exist as a capital-road feature,
// otherwise the resolver could never apply the district override.
function checkCrossRefs(auth, roads, errors) {
  if (!auth || !Array.isArray(auth.districtRules) || !roads || !Array.isArray(roads.features)) return
  const have = new Set(roads.features.map((f) => `${f.properties?.annex}/${f.properties?.row}`))
  for (const r of auth.districtRules) {
    if (r.capitalRoads === 'both' && (!Array.isArray(r.districtActsOn) || r.districtActsOn.length === 0)) {
      errors.push(`authorities.json: district ${r.district} has capitalRoads "both" but no districtActsOn list`)
    }
    for (const a of r.districtActsOn ?? []) {
      if (!['full', 'narrower'].includes(a.scope)) errors.push(`authorities.json: district ${r.district} row ${a.row}: scope must be full | narrower`)
      if (!have.has(`${a.annex}/${a.row}`)) errors.push(`authorities.json: district ${r.district} districtActsOn row ${a.annex}/${a.row} is not a capital-road feature`)
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
  const errors = validateData(dir)
  if (errors.length > 0) {
    console.error(`validate:data FAILED — ${errors.length} problem(s):`)
    for (const m of errors) console.error(`  - ${m}`)
    process.exit(1)
  }
  console.log('validate:data OK — authorities, violations, districts and capital roads are valid.')
}
