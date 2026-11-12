// Public API of the authority module (SPEC 4.2).
export * from './types'
export {
  createResolver,
  isStale,
  BORDER_M,
  ROAD_EDGE_M,
  ROAD_SNAP_M,
  ROAD_TIE_M,
  STALE_MONTHS,
  type AuthoritiesData,
  type DistrictActsOn,
  type DistrictProps,
  type DistrictRule,
  type DistrictsData,
  type NoDistrictArea,
  type Resolver,
  type ResolverData,
  type RoadProps,
  type RoadsData,
} from './resolver'
export { loadResolver } from './load'
