// Nominatim client (SPEC 4.1 F-MAP-4, 10; D6). Public instance, no key, no personal data.
// Policy: at most 1 request per second leaves the app, so every call goes through one queue.
import type { LatLon } from '../authority/types'

const BASE = 'https://nominatim.openstreetmap.org'
const MIN_GAP_MS = 1000

export interface NominatimAddress {
  road?: string
  house_number?: string
  pedestrian?: string
  square?: string
  footway?: string
  path?: string
  cycleway?: string
  [key: string]: string | undefined
}

export interface NominatimResult {
  lat?: string
  lon?: string
  name?: string
  display_name?: string
  address?: NominatimAddress
}

export interface AddressHit {
  ll: LatLon
  /** Short Hungarian form, e.g. "Pannónia utca 14." */
  label: string
  /** Full Nominatim display name, shown as a secondary line. */
  displayName: string
}

/** "Pannónia utca 14." from a Nominatim result; see the fallbacks below. */
export function formatAddress(result: NominatimResult): string {
  const a = result.address ?? {}
  const road =
    a.road ?? a.pedestrian ?? a.square ?? a.footway ?? a.path ?? a.cycleway ?? undefined
  const number = a.house_number?.trim()
  if (road) {
    if (!number) return road
    return `${road} ${/^\d+$/.test(number) ? `${number}.` : number}`
  }
  if (result.name?.trim()) return result.name.trim()
  const first = result.display_name?.split(',')[0]?.trim()
  return first ?? ''
}

// ---- 1 request / second queue ----

let tail: Promise<unknown> = Promise.resolve()
let lastSent = -Infinity

function abortError(): Error {
  return new DOMException('Aborted', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function enqueue<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const job = tail.then(async () => {
    if (signal?.aborted) throw abortError()
    const wait = lastSent + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait, signal)
    if (signal?.aborted) throw abortError()
    lastSent = Date.now()
    return run()
  })
  tail = job.catch(() => undefined)
  return job
}

/** Test helper: forget the last request time. */
export function resetNominatimQueue(): void {
  tail = Promise.resolve()
  lastSent = -Infinity
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  return res.json()
}

function toHit(r: NominatimResult): AddressHit | null {
  const lat = Number(r.lat)
  const lon = Number(r.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const displayName = r.display_name ?? ''
  return { ll: { lat, lon }, label: formatAddress(r) || displayName, displayName }
}

/** Free-text address search inside Budapest. Throws on network/HTTP errors and on abort. */
export function searchAddress(query: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    'accept-language': 'hu',
    addressdetails: '1',
    countrycodes: 'hu',
    viewbox: '18.92,47.62,19.34,47.34',
    bounded: '1',
    limit: '5',
  })
  return enqueue(async () => {
    const data = await getJson(`${BASE}/search?${params}`, signal)
    if (!Array.isArray(data)) return []
    return (data as NominatimResult[]).map(toHit).filter((h): h is AddressHit => h !== null)
  }, signal)
}

/** Street address of a point, short Hungarian form, or null when Nominatim knows none. */
export function reverseLookup(ll: LatLon, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(ll.lat),
    lon: String(ll.lon),
    format: 'jsonv2',
    'accept-language': 'hu',
    addressdetails: '1',
    zoom: '18',
  })
  return enqueue(async () => {
    const data = (await getJson(`${BASE}/reverse?${params}`, signal)) as
      | (NominatimResult & { error?: string })
      | null
    if (!data || data.error) return null
    return formatAddress(data) || null
  }, signal)
}
