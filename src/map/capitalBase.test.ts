import { describe, expect, it } from 'vitest'
import type { LayerSpecification } from 'maplibre-gl'
import { BASE_BAND_MINZOOM, CAPITAL_ENDS_SOURCE, isRoadFill, planBaseBand } from './capitalBase'

const filter = ['==', ['get', 'class'], 'primary']
const layers = [
  { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: {} },
  { id: 'road_trunk_primary_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter, paint: { 'line-color': '#e9ac77' } },
  { id: 'road_trunk_primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter, layout: { 'line-join': 'round' }, paint: { 'line-color': '#fea', 'line-width': 4 } },
  { id: 'road_major_rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#bbb' } },
  { id: 'tunnel_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 15, paint: { 'line-color': '#fff', 'line-dasharray': [1, 1] } },
  { id: 'highway_minor_low', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', maxzoom: 11, paint: { 'line-color': '#2a2a2a' } },
  { id: 'road_label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', layout: {} },
] as unknown as LayerSpecification[]

describe('planBaseBand', () => {
  const plan = planBaseBand(layers, [12, 22], '#0EA6CE')

  it('copies only road fill layers, never casings, rail or low-zoom layers', () => {
    expect(layers.filter(isRoadFill).map((l) => l.id)).toEqual(['road_trunk_primary', 'tunnel_minor', 'highway_minor_low'])
    expect(plan.map((p) => p.layer.id)).toEqual([
      'capital-base-road_trunk_primary',
      'capital-end-road_trunk_primary',
      'capital-base-tunnel_minor',
      'capital-end-tunnel_minor',
    ])
  })

  it('places each copy directly above its original, in the band colour, from zoom 14', () => {
    const [base, end] = plan
    expect(base.before).toBe('road_major_rail')
    expect(base.layer.paint?.['line-color']).toBe('#0EA6CE')
    expect(base.layer.paint?.['line-width']).toBe(4)
    expect(base.layer.minzoom).toBe(BASE_BAND_MINZOOM)
    expect(base.layer.filter).toEqual(['all', filter, ['match', ['id'], [12, 22], true, false]])
    expect(end.layer.source).toBe(CAPITAL_ENDS_SOURCE)
    expect(end.layer.filter).toEqual(filter)
    expect('source-layer' in end.layer).toBe(false)
    expect(plan[2].layer.minzoom).toBe(15)
    expect(plan[2].layer.paint && 'line-dasharray' in plan[2].layer.paint).toBe(false)
  })

  it('leaves out layout when the original has none (MapLibre rejects layout: undefined)', () => {
    const tunnel = plan.filter((p) => p.layer.id.endsWith('tunnel_minor'))
    expect(tunnel).toHaveLength(2)
    for (const p of tunnel) expect('layout' in p.layer).toBe(false)
    const primary = plan.find((p) => p.layer.id === 'capital-base-road_trunk_primary')
    expect(primary?.layer.layout).toEqual({ 'line-join': 'round' })
  })

  it('draws only the own end pieces when no feature id is known', () => {
    expect(planBaseBand(layers, [], '#0EA6CE').map((p) => p.layer.id)).toEqual(['capital-end-road_trunk_primary', 'capital-end-tunnel_minor'])
  })
})
