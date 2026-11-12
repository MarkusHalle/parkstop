// Loads the bundled authority data and builds the resolver (roadmap 2.3). The geometry is
// dynamic-imported so the large roads file lands in its own same-origin chunk, out of the
// main bundle; authorities.json is small and the result card needs it anyway, so it is a
// static import. No fetch to any other host (D26).

import authorities from '../data/authorities.json'
import { createResolver, type AuthoritiesData, type DistrictsData, type Resolver, type RoadsData } from './resolver'

let pending: Promise<Resolver> | null = null

export function loadResolver(): Promise<Resolver> {
  pending ??= (async () => {
    // Vite does not import .geojson as JSON, so read it as text and parse.
    const [roadsRaw, districtsRaw] = await Promise.all([
      import('../data/capital-roads.geojson?raw'),
      import('../data/districts.geojson?raw'),
    ])
    return createResolver({
      roads: JSON.parse(roadsRaw.default) as RoadsData,
      districts: JSON.parse(districtsRaw.default) as DistrictsData,
      authorities: authorities as unknown as AuthoritiesData,
    })
  })()
  // A failed load may be retried on the next call.
  pending.catch(() => {
    pending = null
  })
  return pending
}
