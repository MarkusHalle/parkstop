// The capital-road band from zoom 14 up, drawn with the base map's own road layers (roadmap
// 6.17, D55). Our own band line never sat exactly on OpenFreeMap's roads, so each road fill
// layer of the base style is copied twice in the band colour, right above the original:
//  - on the base map's own features whose id is in `tileIds` (they lie wholly on capital roads);
//  - on the `ends` lines of capital-roads-display.json (the rest of the band, cut from base-map
//    geometry and carrying its class / ramp / brunnel), so they get the same widths.
// Casings keep the base colour, so a capital road reads as the road itself turned blue. Below
// zoom 14 the base map draws z12/z13 tiles, whose features are merged differently; there the
// own band line is kept (MapView). Pure: no MapLibre instance, only style JSON.
import type { FilterSpecification, LayerSpecification, LineLayerSpecification } from 'maplibre-gl'

/** From this zoom the band is the base map's own roads (the z14 tiles were checked). */
export const BASE_BAND_MINZOOM = 14
export const CAPITAL_ENDS_SOURCE = 'capital-ends'

export interface CapitalDisplay {
  tileIds: number[]
  ends: GeoJSON.FeatureCollection
}

/** Road fill layers of the base style: transportation lines that are not casings, rail, paths… */
export function isRoadFill(l: LayerSpecification): l is LineLayerSpecification {
  return (
    l.type === 'line' &&
    'source-layer' in l &&
    l['source-layer'] === 'transportation' &&
    !/casing|rail|transit|hatching|path|pier|dashline|ferry|aerialway|subtle/.test(l.id)
  )
}

export interface PlannedLayer {
  layer: LineLayerSpecification
  /** Insert before this layer (the one after the copied base layer), or on top when undefined. */
  before: string | undefined
}

/**
 * The band layers to add for a base style: two copies of each road fill layer (base features by
 * id, own end pieces), each placed directly above its original so bridges, tunnels and
 * crossings keep the base map's order.
 */
export function planBaseBand(layers: LayerSpecification[], tileIds: number[], color: string): PlannedLayer[] {
  const out: PlannedLayer[] = []
  const hasIds = tileIds.length > 0 // an empty match list is not a valid expression
  layers.forEach((l, i) => {
    if (!isRoadFill(l)) return
    const before = layers[i + 1]?.id
    if (l.maxzoom !== undefined && l.maxzoom <= BASE_BAND_MINZOOM) return
    const minzoom = Math.max(BASE_BAND_MINZOOM, l.minzoom ?? 0)
    const paint = {
      ...l.paint,
      'line-color': color,
      'line-opacity': 1,
    } as NonNullable<LineLayerSpecification['paint']>
    delete paint['line-dasharray']
    delete paint['line-pattern']
    delete paint['line-gradient']
    const common = { type: 'line' as const, minzoom, ...(l.maxzoom !== undefined ? { maxzoom: l.maxzoom } : {}), layout: l.layout, paint }
    const byId: FilterSpecification = ['match', ['id'], tileIds, true, false]
    if (hasIds) {
      out.push({
        layer: {
          ...common,
          id: `capital-base-${l.id}`,
          source: l.source,
          'source-layer': 'transportation',
          // The base filters are expressions, so `all` of them and the id match is one too.
          filter: l.filter ? (['all', l.filter, byId] as unknown as FilterSpecification) : byId,
        },
        before,
      })
    }
    out.push({
      layer: {
        ...common,
        id: `capital-end-${l.id}`,
        source: CAPITAL_ENDS_SOURCE,
        ...(l.filter ? { filter: l.filter } : {}),
      },
      before,
    })
  })
  return out
}
