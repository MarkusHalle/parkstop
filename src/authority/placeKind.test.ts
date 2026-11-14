import { describe, expect, it } from 'vitest'
import { placeKind } from './placeKind'

describe('placeKind', () => {
  it.each([
    ['Pannónia utca 14.', 'utca'],
    ['Andrássy út 2.', 'út'],
    ['Múzeum körút', 'körút'],
    ['Kossuth Lajos tér 1.', 'tér'],
    ['Hősök tere', 'tér'],
    ['Oktogon', 'tér'],
    ['Liszt Ferenc köz', 'köz'],
    ['Duna-parti sétány', 'sétány'],
    ['Pesti alsó rakpart', 'rakpart'],
    ['Margit híd', 'híd'],
    ['Margit-sziget', 'sziget'],
    ['Városligeti fasor 12/b', 'fasor'],
    ['Árpád fejedelem útja', 'út'],
    ['Váci út-szervizút', 'szervizút'],
    ['Kossuth Lajos utca szakasza', 'utca'],
    ['Budapest, XIII. kerület, Pannónia utca', 'utca'],
    ['Pannónia utca 14., 1136 Budapest', 'utca'],
    ['Pannónia u. 14.', 'utca'],
    ['Szent István krt. 3', 'körút'],
  ])('%s → %s', (text, kind) => {
    expect(placeKind(text)).toBe(kind)
  })

  it('reads an abbreviation only with its dot', () => {
    expect(placeKind('Pannónia köz 14/u')).toBe('köz')
  })

  it('returns null when no kind word appears', () => {
    expect(placeKind('Városliget')).toBeNull()
    expect(placeKind('Budapest')).toBeNull()
    expect(placeKind('')).toBeNull()
    expect(placeKind(null)).toBeNull()
  })

  it('does not match a kind inside a longer word', () => {
    expect(placeKind('Kertész')).toBeNull()
    expect(placeKind('Sorház')).toBeNull()
  })
})
