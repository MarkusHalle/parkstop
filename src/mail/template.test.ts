import { describe, expect, it } from 'vitest'
import { buildMail } from './template'
import type { MailInput } from './types'

const JARDA =
  'A jármű a járdán várakozott ott, ahol ezt jelzőtábla vagy útburkolati jel nem engedte meg, illetve úgy, hogy a gyalogosok számára nem maradt 1,5 méter szabad hely.'

const base: MailInput = {
  template: 'A',
  recipient: { name: 'Teszt Közterület-felügyelet', email: 'kozterulet@example.hu' },
  plate: 'ABC-123',
  address: 'Pannónia utca 14.',
  districtRoman: 'XIII',
  lat: 47.5188,
  lon: 19.0517,
  observedAt: new Date(2026, 10, 11, 8, 42),
  violation: { kind: 'listed', sentence: JARDA, legalRef: 'KRESZ 40. § (8)' },
  photoCount: 2,
}

const CLOSING_A =
  'A helyszínen készített 2 fényképet mellékelem. Kérem az ügy kivizsgálását és a szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.'

describe('buildMail, template A', () => {
  it('full draft with every optional line', () => {
    const d = buildMail({
      ...base,
      vehicle: 'szürke Opel Astra',
      note: 'Babakocsival nem lehet elférni a járdán.',
      reporter: { name: 'Teszt Elek', address: '1135 Budapest, Árvíz tér 7.', email: 'teszt.elek@example.com', phone: '+36 30 000 0000' },
    })
    expect(d.to).toBe('kozterulet@example.hu')
    expect(d.subject).toBe('Szabálytalan parkolás bejelentése – ABC-123 – Pannónia utca 14.')
    expect(d.body).toBe(
      [
        'Tisztelt Teszt Közterület-felügyelet!',
        '',
        '2026. november 11-én 08:42-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:',
        '',
        'Helyszín: Pannónia utca 14. (XIII. kerület), GPS: 47.518800, 19.051700',
        '',
        'Rendszám: ABC-123',
        '',
        'Jármű: szürke Opel Astra',
        '',
        'Szabálytalanság: A jármű a járdán várakozott ott, ahol ezt jelzőtábla vagy útburkolati jel nem engedte meg, illetve úgy, hogy a gyalogosok számára nem maradt 1,5 méter szabad hely (KRESZ 40. § (8)).',
        '',
        'Megjegyzés: Babakocsival nem lehet elférni a járdán.',
        '',
        CLOSING_A,
        '',
        'Tisztelettel:',
        'Teszt Elek',
        '1135 Budapest, Árvíz tér 7.',
        'teszt.elek@example.com, +36 30 000 0000',
      ].join('\n'),
    )
  })

  it('no optional lines, no reporter, "Egyéb" style null reference', () => {
    const d = buildMail({
      ...base,
      vehicle: '   ',
      note: '',
      violation: { kind: 'listed', sentence: 'Egyéb szabálytalanság.', legalRef: null },
      photoCount: 1,
    })
    expect(d.body).toBe(
      [
        'Tisztelt Teszt Közterület-felügyelet!',
        '',
        '2026. november 11-én 08:42-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:',
        '',
        'Helyszín: Pannónia utca 14. (XIII. kerület), GPS: 47.518800, 19.051700',
        '',
        'Rendszám: ABC-123',
        '',
        'Szabálytalanság: Egyéb szabálytalanság.',
        '',
        'A helyszínen készített 1 fényképet mellékelem. Kérem az ügy kivizsgálását és a szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.',
        '',
        'Tisztelettel:',
      ].join('\n'),
    )
  })

  it('custom violation text is trimmed and has no reference; multi-line note keeps its lines', () => {
    const d = buildMail({
      ...base,
      violation: { kind: 'custom', text: '  A jármű a kapubejáró előtt állt.  ' },
      note: 'Első sor.\r\nMásodik sor.\n\nNegyedik sor.',
      reporter: { name: 'Teszt Elek', phone: '+36 30 000 0000' },
    })
    expect(d.body).toBe(
      [
        'Tisztelt Teszt Közterület-felügyelet!',
        '',
        '2026. november 11-én 08:42-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:',
        '',
        'Helyszín: Pannónia utca 14. (XIII. kerület), GPS: 47.518800, 19.051700',
        '',
        'Rendszám: ABC-123',
        '',
        'Szabálytalanság: A jármű a kapubejáró előtt állt.',
        '',
        'Megjegyzés: Első sor.',
        'Második sor.',
        '',
        'Negyedik sor.',
        '',
        CLOSING_A,
        '',
        'Tisztelettel:',
        'Teszt Elek',
        '+36 30 000 0000',
      ].join('\n'),
    )
  })

  it('Margit-sziget: no district parenthetical; recipient without e-mail', () => {
    const d = buildMail({
      ...base,
      recipient: { name: 'Teszt Hatóság', email: null },
      address: 'Margit-sziget',
      districtRoman: null,
      lat: 47.52645,
      lon: 19.0478,
      reporter: { address: '1135 Budapest, Árvíz tér 7.', email: 'teszt.elek@example.com' },
    })
    expect(d.to).toBe('')
    expect(d.subject).toBe('Szabálytalan parkolás bejelentése – ABC-123 – Margit-sziget')
    const lines = d.body.split('\n')
    expect(lines[0]).toBe('Tisztelt Teszt Hatóság!')
    expect(lines[4]).toBe('Helyszín: Margit-sziget, GPS: 47.526450, 19.047800')
    expect(lines.slice(-3)).toEqual(['Tisztelettel:', '1135 Budapest, Árvíz tér 7.', 'teszt.elek@example.com'])
  })
})

describe('buildMail, template B', () => {
  it('full draft', () => {
    const d = buildMail({
      ...base,
      template: 'B',
      recipient: { name: 'Teszt Rendőrkapitányság', email: 'rk@example.hu' },
      observedAt: new Date(2026, 1, 3, 17, 5),
      vehicle: 'piros Suzuki Swift',
      photoCount: 3,
      reporter: { name: 'Teszt Elek', address: '1135 Budapest, Árvíz tér 7.', email: 'teszt.elek@example.com', phone: '+36 30 000 0000' },
    })
    expect(d.to).toBe('rk@example.hu')
    expect(d.subject).toBe('Szabálysértési feljelentés – ABC-123 – Pannónia utca 14.')
    expect(d.body).toBe(
      [
        'Tisztelt Teszt Rendőrkapitányság!',
        '',
        'Szabálysértési feljelentést teszek ismeretlen elkövető ellen. 2026. február 3-án 17:05-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:',
        '',
        'Helyszín: Pannónia utca 14. (XIII. kerület), GPS: 47.518800, 19.051700',
        '',
        'Rendszám: ABC-123',
        '',
        'Jármű: piros Suzuki Swift',
        '',
        'Szabálytalanság: A jármű a járdán várakozott ott, ahol ezt jelzőtábla vagy útburkolati jel nem engedte meg, illetve úgy, hogy a gyalogosok számára nem maradt 1,5 méter szabad hely (KRESZ 40. § (8)).',
        '',
        'A helyszínen készített 3 fényképet bizonyítékként mellékelem. Kérem az ügy kivizsgálását és a szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.',
        '',
        'Tisztelettel:',
        'Teszt Elek',
        '1135 Budapest, Árvíz tér 7.',
        'teszt.elek@example.com, +36 30 000 0000',
      ].join('\n'),
    )
  })
})
