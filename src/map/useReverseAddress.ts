import { useEffect, useState } from 'react'
import type { LatLon } from '../authority/types'
import { reverseLookup } from './nominatim'
import type { AddressState } from './types'

const REST_MS = 1000
const CACHE_MAX = 50
const cache = new Map<string, string | null>()

function keyOf(ll: LatLon): string {
  return `${ll.lat.toFixed(5)},${ll.lon.toFixed(5)}`
}

function remember(key: string, value: string | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, value)
}

interface Settled {
  key: string
  address: string | null
  status: 'done' | 'error'
}

/**
 * Street address of the pin, looked up once the pin has rested for 1 s (SPEC 4.1 F-MAP-4).
 * `skipFor` is a pin whose address is already known (picked from a search result).
 */
export function useReverseAddress(
  pin: LatLon | null,
  enabled: boolean,
  skipFor?: LatLon | null,
): AddressState {
  const [settled, setSettled] = useState<Settled | null>(null)

  const key = pin ? keyOf(pin) : null
  const skipped = pin !== null && skipFor != null && keyOf(skipFor) === key
  const target = enabled && key !== null && !skipped ? key : null
  const cached = target !== null && cache.has(target)

  const lat = pin?.lat
  const lon = pin?.lon
  useEffect(() => {
    if (target === null || cached || lat === undefined || lon === undefined) return
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      reverseLookup({ lat, lon }, ctl.signal).then(
        (address) => {
          remember(target, address)
          setSettled({ key: target, address, status: 'done' })
        },
        (err: unknown) => {
          if (ctl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
          setSettled({ key: target, address: null, status: 'error' })
        },
      )
    }, REST_MS)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [target, cached, lat, lon])

  if (target === null) return { address: null, status: 'idle' }
  if (cached) return { address: cache.get(target) ?? null, status: 'done' }
  if (settled && settled.key === target) return { address: settled.address, status: settled.status }
  return { address: null, status: 'loading' }
}
