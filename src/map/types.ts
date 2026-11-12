// Contract of the map module (SPEC 4.1, D6, roadmap 2.2).
import type { LatLon } from '../authority/types'

export type PinSource = 'map' | 'search' | 'geolocation'

export interface MapViewProps {
  /** Current pin, or null before the user has placed one. */
  pin: LatLon | null
  /** Tap/click places the pin, drag moves it, a search result or "Saját helyzetem" sets it. */
  onPinChange: (pin: LatLon, source: PinSource) => void
  /** The user picked a search result: its address label (Hungarian, short form). */
  onAddressPicked?: (address: string) => void
  /** 'phone' (map full screen behind a bottom sheet) or 'pc' (map right of the side panel). */
  layout: 'phone' | 'pc'
  /** Height in px covered by the phone bottom sheet; overlays and fly-to keep clear of it. */
  bottomInset: number
  /** Show the "tap/click the map" hint bubble (no pin yet). */
  showHint: boolean
  /** Address search through Nominatim allowed (Settings switch later; default true). */
  lookupEnabled: boolean
  /** Increment to ask the map to request geolocation (the start sheet's "Saját helyzetem"). */
  locateRequest?: number
  /** The "Előzmények" button of the map-failed empty state. */
  onOpenHistory?: () => void
}

export interface AddressState {
  address: string | null
  status: 'idle' | 'loading' | 'done' | 'error'
}
