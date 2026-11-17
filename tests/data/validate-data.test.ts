import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error -- plain ESM script without type declarations
import { validateData } from '../../scripts/validate-data.mjs'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII',
  'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII']
const TODAY = '2026-11-12'
const SRC = 'https://example.hu/kapcsolat'

const square = [[[19.0, 47.5], [19.01, 47.5], [19.01, 47.51], [19.0, 47.5]]]

function validFixture() {
  const districts = ROMAN.map((_, i) => i + 1)
  const authorities = [
    { id: 'fori', name: 'FÖRI', type: 'fori', districts: [], email: 'a@b.hu', phone: null, web: SRC, sourceUrl: SRC, verifiedOn: TODAY },
    ...districts.map((d) => ({ id: `d${d}`, name: `${ROMAN[d - 1]}. ker. felügyelet`, type: 'district', districts: [d], email: null, phone: '+36 1 123 4567', web: null, sourceUrl: SRC, verifiedOn: TODAY })),
    ...districts.map((d) => ({ id: `p${d}`, name: `${ROMAN[d - 1]}. ker. rendőrkapitányság`, type: 'police', districts: [d], email: null, phone: '107', web: SRC, sourceUrl: SRC, verifiedOn: TODAY })),
  ]
  const districtRules = districts.map((d) => ({
    district: d, roman: ROMAN[d - 1], ownBody: true, primaryId: `d${d}`, policeId: `p${d}`,
    capitalRoads: 'fori', sourceUrl: SRC, verifiedOn: TODAY,
  }))
  const noDistrictAreas: Record<string, unknown>[] = [
    { id: 'island', name: 'Sziget', primaryId: 'fori', policeId: null, sourceUrl: SRC, verifiedOn: TODAY },
  ]
  const violations = [
    { id: 'jarda', label: 'Járdán', sentence: 'A jármű a járdán várakozott.', legalRef: 'KRESZ 40. §', legalSourceUrl: SRC, verifiedOn: TODAY },
    { id: 'egyeb', label: 'Egyéb' },
  ]
  const districtsGeo = {
    type: 'FeatureCollection',
    budapest: { type: 'Polygon', coordinates: square },
    features: districts.map((d) => ({ type: 'Feature', properties: { district: d, roman: ROMAN[d - 1] }, geometry: { type: 'Polygon', coordinates: square } })),
  }
  const roads = {
    type: 'FeatureCollection', source: SRC,
    features: [{ type: 'Feature', properties: { name: 'Andrássy út', partial: false, cutApplied: false, cutApprox: false, kind: 'road' }, geometry: { type: 'LineString', coordinates: [[19.06, 47.50], [19.07, 47.51]] } }],
  }
  const display = {
    tiles: '20261101_080013_pt', zoom: 14, tileIds: [12, 22],
    ends: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { class: 'primary' }, geometry: { type: 'MultiLineString', coordinates: [[[19.06, 47.50], [19.07, 47.51]]] } }] },
  }
  return { authorities: { authorities, districtRules, noDistrictAreas }, violations: { violations }, districtsGeo, roads, display }
}

function run(f: ReturnType<typeof validFixture>): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'parkstop-data-'))
  writeFileSync(join(dir, 'authorities.json'), JSON.stringify(f.authorities))
  writeFileSync(join(dir, 'violations.json'), JSON.stringify(f.violations))
  writeFileSync(join(dir, 'districts.geojson'), JSON.stringify(f.districtsGeo))
  writeFileSync(join(dir, 'capital-roads.geojson'), JSON.stringify(f.roads))
  writeFileSync(join(dir, 'capital-roads-display.json'), JSON.stringify(f.display))
  return validateData(dir, TODAY)
}

describe('validate-data', () => {
  it('accepts a complete, well-formed data set', () => {
    expect(run(validFixture())).toEqual([])
  })

  it('rejects unsorted tile ids and a non-carriageway end piece in the band display (D55)', () => {
    const f = validFixture()
    f.display.tileIds = [22, 12]
    f.display.ends.features[0].properties.class = 'rail'
    const out = run(f).join('\n')
    expect(out).toMatch(/tileIds must be positive integers, sorted/)
    expect(out).toMatch(/class rail is not a carriageway class/)
  })

  it('rejects a record without a source URL', () => {
    const f = validFixture()
    delete (f.authorities.authorities[1] as Partial<(typeof f.authorities.authorities)[number]>).sourceUrl
    expect(run(f).join('\n')).toMatch(/sourceUrl missing/)
  })

  it('rejects a verification date in the future', () => {
    const f = validFixture()
    f.authorities.authorities[0].verifiedOn = '2030-01-01'
    expect(run(f).join('\n')).toMatch(/verifiedOn/)
  })

  it('rejects a malformed e-mail address', () => {
    const f = validFixture()
    f.authorities.authorities[0].email = 'not an address'
    expect(run(f).join('\n')).toMatch(/email must be null or a valid address/)
  })

  it('requires FÖRI as primary when a district has no own body', () => {
    const f = validFixture()
    f.authorities.districtRules[4].ownBody = false
    expect(run(f).join('\n')).toMatch(/primary must be FÖRI/)
  })

  it('reports a missing district', () => {
    const f = validFixture()
    f.authorities.districtRules.pop()
    expect(run(f).join('\n')).toMatch(/district XXIII missing/)
  })

  it('rejects a legal reference without its source', () => {
    const f = validFixture()
    ;(f.violations.violations[0] as { legalSourceUrl?: string }).legalSourceUrl = undefined
    expect(run(f).join('\n')).toMatch(/legalRef without legalSourceUrl/)
  })

  it('rejects an offence sentence that mentions a fine', () => {
    const f = validFixture()
    ;(f.violations.violations[0] as { sentence: string }).sentence = 'Kérem a bírság kiszabását.'
    expect(run(f).join('\n')).toMatch(/must not mention a fine/)
  })

  it('rejects a district override that points to a missing capital road', () => {
    const f = validFixture()
    Object.assign(f.authorities.districtRules[5], {
      capitalRoads: 'both',
      districtActsOn: [{ annex: 2, row: '999', text: 'Nincs ilyen utca', scope: 'full' }],
    })
    expect(run(f).join('\n')).toMatch(/row 2\/999 is not a capital-road feature/)
  })

  it('accepts a display-only link of an existing row, rejects one without its row (D49)', () => {
    const f = validFixture()
    const own = f.roads.features[0] as { properties: Record<string, unknown>; geometry: unknown }
    own.properties = { ...own.properties, annex: 2, row: '1' }
    const link = (row: string) => ({ type: 'Feature', properties: { ...own.properties, row, kind: 'link' }, geometry: own.geometry })
    f.roads.features.push(link('1') as (typeof f.roads.features)[number])
    expect(run(f)).toEqual([])
    f.roads.features.push(link('2') as (typeof f.roads.features)[number])
    expect(run(f).join('\n')).toMatch(/link without its row's own feature/)
  })

  it('rejects swapped coordinates in the district file', () => {
    const f = validFixture()
    f.districtsGeo.features[0].geometry.coordinates = [[[47.5, 19.0], [47.5, 19.01], [47.51, 19.01], [47.5, 19.0]]]
    expect(run(f).join('\n')).toMatch(/outside the Budapest bounding box/)
  })

  it('rejects a no-district area with a bad police id', () => {
    const f = validFixture()
    f.authorities.noDistrictAreas[0].policeId = 'p99'
    expect(run(f).join('\n')).toMatch(/policeId "p99" must be null or a police record/)
  })

  it('rejects a no-district area whose police id is not a police record', () => {
    const f = validFixture()
    f.authorities.noDistrictAreas[0].policeId = 'd13'
    expect(run(f).join('\n')).toMatch(/must be null or a police record/)
  })

  it('accepts a no-district area with a real police record', () => {
    const f = validFixture()
    f.authorities.noDistrictAreas[0].policeId = 'p13'
    expect(run(f)).toEqual([])
  })

  it('rejects a no-district area whose primary is not FÖRI', () => {
    const f = validFixture()
    f.authorities.noDistrictAreas[0].primaryId = 'd13'
    expect(run(f).join('\n')).toMatch(/is not a FÖRI record/)
  })

  it('rejects a missing noDistrictAreas array', () => {
    const f = validFixture()
    delete (f.authorities as { noDistrictAreas?: unknown }).noDistrictAreas
    expect(run(f).join('\n')).toMatch(/noDistrictAreas must be an array with exactly one entry/)
  })

  it('rejects a no-district area with a future verification date', () => {
    const f = validFixture()
    f.authorities.noDistrictAreas[0].verifiedOn = '2031-01-01'
    expect(run(f).join('\n')).toMatch(/noDistrictAreas\[0\].*verifiedOn/)
  })
})
