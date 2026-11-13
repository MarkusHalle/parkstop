// Pure helper: what a failed getCurrentPosition means for the user (F-MAP-3).
export type GeoFailure = 'denied' | 'unavailable'

/** GeolocationPositionError.code: 1 = permission denied, 2 = unavailable, 3 = timeout. */
export function geoFailureFromCode(code: number): GeoFailure {
  return code === 1 ? 'denied' : 'unavailable'
}
