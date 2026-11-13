// Display of capital-managed squares and areas (`area: true` features in capital-roads.geojson).
// They are stored as the OSM outlines of the area: its outer edge plus the outlines of flower
// beds, fountains and buildings inside it. Drawn as road bands, those inner shapes looked like
// roads on a pedestrian square (owner, Blaha Lujza tér). For the map each area becomes one
// polygon from its largest closed ring; the resolver keeps using the original rings. Pure.

type Position = GeoJSON.Position

function isClosed(ring: Position[]): boolean {
  if (ring.length < 4) return false
  const a = ring[0]
  const b = ring[ring.length - 1]
  return a[0] === b[0] && a[1] === b[1]
}

/** Absolute shoelace area in degree² (only compared between rings of one feature). */
export function ringArea(ring: Position[]): number {
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return Math.abs(s / 2)
}

function linesOf(g: GeoJSON.Geometry): Position[][] {
  if (g.type === 'LineString') return [g.coordinates]
  if (g.type === 'MultiLineString') return g.coordinates
  return []
}

/** One polygon per area feature: its largest closed ring, inner shapes dropped. */
export function areaPolygons(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const out: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  for (const f of fc.features) {
    if (f.properties?.area !== true) continue
    const rings = linesOf(f.geometry).filter(isClosed)
    if (rings.length === 0) continue
    const outer = rings.reduce((best, r) => (ringArea(r) > ringArea(best) ? r : best))
    out.push({ type: 'Feature', properties: { ...f.properties }, geometry: { type: 'Polygon', coordinates: [outer] } })
  }
  return { type: 'FeatureCollection', features: out }
}
