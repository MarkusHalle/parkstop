import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatAddress, resetNominatimQueue, reverseLookup, searchAddress } from './nominatim'

describe('formatAddress', () => {
  it('road + numeric house number gets a full stop', () => {
    expect(
      formatAddress({ address: { road: 'Pannónia utca', house_number: '14', suburb: 'Újlipótváros' } }),
    ).toBe('Pannónia utca 14.')
  })
  it('keeps non-numeric house numbers as they are', () => {
    expect(formatAddress({ address: { road: 'Váci út', house_number: '12/A' } })).toBe('Váci út 12/A')
    expect(formatAddress({ address: { road: 'Váci út', house_number: '14-16' } })).toBe('Váci út 14-16')
  })
  it('road alone', () => {
    expect(formatAddress({ address: { road: 'Andrássy út' } })).toBe('Andrássy út')
  })
  it('falls back to pedestrian / square fields', () => {
    expect(formatAddress({ address: { pedestrian: 'Váci utca' } })).toBe('Váci utca')
    expect(formatAddress({ address: { square: 'Blaha Lujza tér', house_number: '1' } })).toBe(
      'Blaha Lujza tér 1.',
    )
  })
  it('falls back to name, then to the first part of display_name', () => {
    expect(formatAddress({ name: 'Margitsziget', address: {} })).toBe('Margitsziget')
    expect(formatAddress({ display_name: 'Duna, Budapest, Magyarország' })).toBe('Duna')
    expect(formatAddress({})).toBe('')
  })
})

describe('request queue', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    resetNominatimQueue()
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sends at most one request per second', async () => {
    const times: number[] = []
    fetchMock.mockImplementation(async () => {
      times.push(Date.now())
      return { ok: true, json: async () => [] }
    })
    const start = Date.now()
    const p = [searchAddress('a'), searchAddress('b'), reverseLookup({ lat: 47.5, lon: 19.04 })]
    await vi.advanceTimersByTimeAsync(3000)
    await Promise.all(p)
    expect(times).toHaveLength(3)
    expect(times[0] - start).toBe(0)
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000)
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(1000)
  })

  it('skips aborted requests without calling fetch', async () => {
    const first = searchAddress('a')
    const ctl = new AbortController()
    const second = searchAddress('b', ctl.signal)
    const third = searchAddress('c')
    const secondResult = second.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(10)
    ctl.abort()
    await vi.advanceTimersByTimeAsync(3000)
    await first
    await third
    expect(await secondResult).toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('builds the documented query and maps results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: '47.5',
          lon: '19.05',
          display_name: 'Pannónia utca 14., Budapest',
          address: { road: 'Pannónia utca', house_number: '14' },
        },
      ],
    })
    const hits = await searchAddress('Pannónia utca 14')
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin).toBe('https://nominatim.openstreetmap.org')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('bounded')).toBe('1')
    expect(url.searchParams.get('countrycodes')).toBe('hu')
    expect(url.searchParams.get('email')).toBeNull()
    expect(hits[0]).toMatchObject({ ll: { lat: 47.5, lon: 19.05 }, label: 'Pannónia utca 14.' })
  })

  it('reverse returns null for "Unable to geocode"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: 'Unable to geocode' }) })
    expect(await reverseLookup({ lat: 47.5, lon: 19.04 })).toBeNull()
  })
})
