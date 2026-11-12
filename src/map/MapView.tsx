import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'

// MapLibre v6 loads its worker relative to its own module URL, which Vite moves. The
// untouched worker file is served at <base>maplibre-gl-worker.mjs (vite.config.ts).
maplibregl.setWorkerUrl(new URL(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`, window.location.href).href)
import { hu } from '../i18n/hu'
import type { LatLon } from '../authority/types'
import { formatAddress, searchAddress, type AddressHit } from './nominatim'
import type { MapViewProps } from './types'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const BUDAPEST: [number, number] = [19.0402, 47.4979]
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [18.7, 47.25],
  [19.5, 47.75],
]
const CAPITAL_COLOR = '#F0B33A' // keep in step with --c-capital-road
/** Phone: map padding under the floating search box, so the pin is centred below it. */
const PHONE_TOP_PAD = 72
const PIN_SVG =
  '<svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true" focusable="false">' +
  '<path class="ps-pin__body" d="M20 50C20 50 3 31 3 18a17 17 0 1 1 34 0c0 13-17 32-17 32z"/>' +
  '<circle cx="20" cy="18" r="6" fill="#fff"/></svg>'

function createPinElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'ps-pin'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', hu.map.pinLabel)
  el.innerHTML = PIN_SVG
  return el
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; hits: AddressHit[] }

type GeoError = 'denied' | 'unsupported' | null

export function MapView({
  pin,
  onPinChange,
  onAddressPicked,
  layout,
  bottomInset,
  showHint,
  lookupEnabled,
  locateRequest,
}: MapViewProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const cb = useRef({ onPinChange, onAddressPicked })
  const insetRef = useRef(bottomInset)
  // The app remounts the map when phone/PC layout changes, so the first value is enough.
  const initialPhone = useRef(layout === "phone")
  const searchCtl = useRef<AbortController | null>(null)
  const lastLocate = useRef(locateRequest ?? 0)

  const [loadError, setLoadError] = useState(false)
  const [geoError, setGeoError] = useState<GeoError>(null)
  const [locating, setLocating] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })

  const phone = layout === 'phone'

  useEffect(() => {
    cb.current = { onPinChange, onAddressPicked }
    insetRef.current = bottomInset
  })

  // Map creation (once).
  useEffect(() => {
    const container = canvasRef.current
    if (!container) return
    let cancelled = false
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        center: BUDAPEST,
        zoom: 12,
        maxBounds: MAX_BOUNDS,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        locale: {
          'Map.Title': hu.map.label,
          'AttributionControl.ToggleAttribution': hu.map.attributionToggle,
          'Marker.Title': hu.map.pinLabel,
        },
      })
    } catch {
      // WebGL unavailable: show the error card instead of crashing.
      queueMicrotask(() => {
        if (!cancelled) setLoadError(true)
      })
      return () => {
        cancelled = true
      }
    }
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    // On a phone the open attribution bar covers the map above the sheet: start it folded
    // to its (i) button, which still shows the credits on tap (F-MAP-1).
    if (initialPhone.current) {
      map.once('load', () => {
        container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      })
    }
    map.setPadding({ top: initialPhone.current ? PHONE_TOP_PAD : 0, left: 0, right: 0, bottom: insetRef.current })
    mapRef.current = map

    const marker = new maplibregl.Marker({ element: createPinElement(), draggable: true, anchor: 'bottom' })
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      cb.current.onPinChange({ lat: p.lat, lon: p.lng }, 'map')
    })
    markerRef.current = marker

    map.on('click', (e) => {
      const target = e.originalEvent.target
      if (target instanceof Element && target.closest('.ps-pin')) return
      cb.current.onPinChange({ lat: e.lngLat.lat, lon: e.lngLat.lng }, 'map')
    })

    let loaded = false
    map.on('load', () => {
      loaded = true
      void addCapitalRoads(map, () => cancelled)
    })
    map.on('error', () => {
      // Tile errors after the first load are not fatal; only a failed style is.
      if (!loaded && !cancelled) setLoadError(true)
    })

    return () => {
      cancelled = true
      marker.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Pin prop drives the marker.
  const pinLat = pin?.lat
  const pinLon = pin?.lon
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    if (pinLat === undefined || pinLon === undefined) marker.remove()
    else marker.setLngLat([pinLon, pinLat]).addTo(map)
  }, [pinLat, pinLon])

  // Keep the pin clear of the phone bottom sheet.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setPadding({ top: phone ? PHONE_TOP_PAD : 0, left: 0, right: 0, bottom: phone ? bottomInset : 0 })
    if (phone && pinLat !== undefined && pinLon !== undefined) {
      const y = map.project([pinLon, pinLat]).y
      const visibleBottom = map.getContainer().clientHeight - bottomInset
      if (y > visibleBottom - 8 || y < PHONE_TOP_PAD + 40) map.easeTo({ center: [pinLon, pinLat], duration: 300 })
    }
    // Only react to the inset itself; a moved pin is handled by the callers' fly-to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomInset, phone])

  const flyTo = useCallback((ll: LatLon) => {
    mapRef.current?.flyTo({ center: [ll.lon, ll.lat], zoom: 17, essential: true })
  }, [])


  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('unsupported')
      return
    }
    setGeoError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        const ll = { lat: p.coords.latitude, lon: p.coords.longitude }
        cb.current.onPinChange(ll, 'geolocation')
        flyTo(ll)
      },
      () => {
        setLocating(false)
        setGeoError('denied')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }, [flyTo])

  // The start sheet's button: only a change after mount triggers it.
  useEffect(() => {
    const value = locateRequest ?? 0
    if (value !== lastLocate.current) {
      lastLocate.current = value
      locate()
    }
  }, [locateRequest, locate])

  function runSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    searchCtl.current?.abort()
    const ctl = new AbortController()
    searchCtl.current = ctl
    setSearch({ status: 'loading' })
    searchAddress(q, ctl.signal).then(
      (hits) => setSearch({ status: 'done', hits }),
      (err: unknown) => {
        if (ctl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setSearch({ status: 'error' })
      },
    )
  }

  useEffect(() => () => searchCtl.current?.abort(), [])

  function pick(hit: AddressHit) {
    setSearch({ status: 'idle' })
    setQuery('')
    cb.current.onPinChange(hit.ll, 'search')
    cb.current.onAddressPicked?.(hit.label || formatAddress({ display_name: hit.displayName }))
    flyTo(hit.ll)
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchCtl.current?.abort()
      setSearch({ status: 'idle' })
    }
  }

  const geoMessage =
    geoError === 'unsupported' ? hu.map.geoUnsupported : geoError === 'denied' ? hu.map.geoErrorBody : null

  return (
    <div
      className={`ps-map ps-map--${layout}`}
      style={{ '--ps-inset': `${phone ? bottomInset : 0}px` } as React.CSSProperties}
    >
      <div ref={canvasRef} className="ps-map__canvas" role="application" aria-label={hu.map.label} />

      {lookupEnabled && (
        <div className="ps-search" onKeyDown={onSearchKey}>
          <form className="ps-search__form" onSubmit={runSearch} role="search">
            <label className="ps-sr-only" htmlFor="ps-search-input">
              {hu.map.searchLabel}
            </label>
            <input
              id="ps-search-input"
              type="search"
              className="ps-search__input"
              placeholder={hu.map.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
            />
            <button type="submit" className="ps-search__submit" aria-label={hu.map.searchSubmit}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.8 4.8 1.4-1.4-4.8-4.8A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
          <div aria-live="polite">
            {search.status === 'loading' && <p className="ps-search__note">{hu.map.searching}</p>}
            {search.status === 'error' && <p className="ps-search__note">{hu.map.searchError}</p>}
            {search.status === 'done' && search.hits.length === 0 && (
              <p className="ps-search__note">{hu.map.noResults}</p>
            )}
          </div>
          {search.status === 'done' && search.hits.length > 0 && (
            <ul className="ps-search__results" aria-label={hu.map.resultsLabel}>
              {search.hits.map((hit, i) => (
                <li key={`${hit.ll.lat},${hit.ll.lon},${i}`}>
                  <button type="button" className="ps-search__hit" onClick={() => pick(hit)}>
                    <span className="ps-search__hit-label">{hit.label}</span>
                    {hit.displayName && hit.displayName !== hit.label && (
                      <span className="ps-search__hit-sub">{hit.displayName}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!phone && (
        <div className="ps-zoom">
          <button type="button" aria-label={hu.map.zoomIn} onClick={() => mapRef.current?.zoomIn()}>
            +
          </button>
          <button type="button" aria-label={hu.map.zoomOut} onClick={() => mapRef.current?.zoomOut()}>
            −
          </button>
        </div>
      )}

      <button
        type="button"
        className={phone ? 'ps-locate ps-locate--round' : 'ps-locate ps-locate--pc'}
        onClick={locate}
        disabled={locating}
        aria-label={hu.map.locate}
        title={hu.map.locate}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path
            d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.07A7 7 0 0 0 13 5.07V3h-2v2.07A7 7 0 0 0 5.07 11H3v2h2.07A7 7 0 0 0 11 18.93V21h2v-2.07A7 7 0 0 0 18.93 13H21v-2zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
            fill="currentColor"
          />
        </svg>
        {!phone && <span>{locating ? hu.map.locating : hu.map.locate}</span>}
      </button>

      <div className="ps-legend">
        <span className="ps-legend__bar" aria-hidden="true" />
        {hu.map.legendCapital}
      </div>

      {showHint && !loadError && (
        <div className="ps-hint" role="status">
          {phone ? hu.map.tapHint : hu.map.clickHint}
        </div>
      )}

      {locating && (
        <div className="ps-hint ps-hint--status" role="status">
          {hu.map.locating}
        </div>
      )}

      {geoMessage && (
        <div className="ps-card" role="alert">
          <strong>{hu.map.geoErrorTitle}</strong>
          <p>{geoMessage}</p>
          <button type="button" className="ps-card__close" onClick={() => setGeoError(null)}>
            {hu.address.done}
          </button>
        </div>
      )}

      {loadError && (
        <div className="ps-card ps-card--load" role="alert">
          <strong>{hu.map.loadErrorTitle}</strong>
          <p>{hu.map.loadErrorBody}</p>
        </div>
      )}
    </div>
  )
}

async function addCapitalRoads(map: maplibregl.Map, isCancelled: () => boolean) {
  try {
    const raw = (await import('../data/capital-roads.geojson?raw')).default
    if (isCancelled()) return
    const data = JSON.parse(raw) as GeoJSON.FeatureCollection
    if (map.getSource('capital-roads')) return
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
    map.addSource('capital-roads', { type: 'geojson', data })
    map.addLayer(
      {
        id: 'capital-roads-line',
        type: 'line',
        source: 'capital-roads',
        minzoom: 12,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': CAPITAL_COLOR,
          'line-opacity': 0.7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 4, 18, 8],
        },
      },
      firstSymbol,
    )
  } catch {
    // The overlay is an aid only; the base map keeps working without it.
  }
}
