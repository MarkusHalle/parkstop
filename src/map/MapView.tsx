import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'

// MapLibre v6 loads its worker relative to its own module URL, which Vite moves. The
// untouched worker file is served at <base>maplibre-gl-worker.mjs (vite.config.ts).
maplibregl.setWorkerUrl(new URL(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`, window.location.href).href)
import { hu } from '../i18n/hu'
import { currentTheme, useResolvedTheme, type ResolvedTheme } from '../settings/theme'
import type { LatLon } from '../authority/types'
import { IconMapOff, IconSearchOff } from '../app/icons'
import { formatAddress, searchAddress, type AddressHit } from './nominatim'
import type { MapViewProps } from './types'
import { geoFailureFromCode } from './geolocation'
import { nudgeOffset, withAttribution } from './pin'

// Same host for both (SPEC 10). Light: liberty; dark: dark (owner's choice over fiord).
const STYLE_URLS: Record<ResolvedTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}
const BUDAPEST: [number, number] = [19.0402, 47.4979]
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [18.7, 47.25],
  [19.5, 47.75],
]
const CAPITAL_COLOR = '#F0B33A' // keep in step with --c-capital-road
// Capital roads: a see-through band drawn on top of the base style's roads (owner, option A),
// so the road stays visible under it and the street names above it.
const CAPITAL_PAINT: Record<ResolvedTheme, { color: string; opacity: number; width: number }> = {
  light: { color: CAPITAL_COLOR, opacity: 0.55, width: 1 },
  dark: { color: '#FFC233', opacity: 0.6, width: 1 },
}
/** Phone: map padding under the floating search box, so the pin is centred below it. */
const PHONE_TOP_PAD = 72
const PIN_SVG =
  '<svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true" focusable="false">' +
  '<path class="ps-pin__body" d="M20 50C20 50 3 31 3 18a17 17 0 1 1 34 0c0 13-17 32-17 32z"/>' +
  '<circle cx="20" cy="18" r="6" fill="#fff"/></svg>'

function createPinElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'ps-pin'
  el.setAttribute('role', 'button')
  el.tabIndex = 0
  el.setAttribute('aria-label', hu.map.pinLabel)
  el.innerHTML = PIN_SVG
  return el
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; hits: AddressHit[] }

type GeoError = 'denied' | 'unavailable' | 'unsupported' | null
/** 'network': style or tiles failed to load. 'webgl': the map cannot be created at all. */
type LoadError = 'network' | 'webgl' | null

export function MapView({
  pin,
  onPinChange,
  onAddressPicked,
  layout,
  bottomInset,
  showHint,
  lookupEnabled,
  locateRequest,
  onOpenHistory,
}: MapViewProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const cb = useRef({ onPinChange, onAddressPicked })
  const insetRef = useRef(bottomInset)
  // The app remounts the map when phone/PC layout changes, so the first value is enough.
  const initialPhone = useRef(layout === "phone")
  const searchCtl = useRef<AbortController | null>(null)
  // Set by pick(): the next pin placement moves focus to the pin (the result button is gone).
  const focusPin = useRef(false)
  const lastLocate = useRef(locateRequest ?? 0)
  const theme = useResolvedTheme()
  // The style the map currently shows (or is loading), so a theme change only swaps once.
  const styleTheme = useRef<ResolvedTheme>(currentTheme())

  const [loadError, setLoadError] = useState<LoadError>(null)
  // Bumped by "Újra" (and when the browser comes back online): creates the map again.
  const [attempt, setAttempt] = useState(0)
  const [geoError, setGeoError] = useState<GeoError>(null)
  const [locating, setLocating] = useState(false)
  const [turned, setTurned] = useState(false)
  const needleRef = useRef<HTMLSpanElement>(null)
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
        style: STYLE_URLS[styleTheme.current],
        center: BUDAPEST,
        zoom: 12,
        maxBounds: MAX_BOUNDS,
        attributionControl: false,
        // Rotate and tilt like Google Maps: two-finger twist rotates and a two-finger slide
        // up or down tilts on the phone; right-drag or Ctrl+drag on the PC.
        dragRotate: true,
        pitchWithRotate: true,
        touchPitch: true,
        maxPitch: 60,
        transformStyle: (_prev, next) => withAttribution(next, hu.map.attribution),
        locale: {
          'Map.Title': hu.map.labelKeyboard,
          'AttributionControl.ToggleAttribution': hu.map.attributionToggle,
          'Marker.Title': hu.map.pinLabel,
        },
      })
    } catch {
      // WebGL unavailable: show the empty state instead of crashing.
      queueMicrotask(() => {
        if (!cancelled) setLoadError('webgl')
      })
      return () => {
        cancelled = true
      }
    }
    // The compass shows only while the map is rotated or tilted; its needle follows the bearing.
    const syncCompass = () => {
      const bearing = map.getBearing()
      if (needleRef.current) needleRef.current.style.transform = `rotate(${-bearing}deg)`
      setTurned(Math.abs(bearing) > 0.5 || map.getPitch() > 0.5)
    }
    map.on('rotate', syncCompass)
    map.on('pitch', syncCompass)
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    // The credits start open on every screen and fold to the (i) button on the first map drag
    // (MapLibre's compact default), as F-MAP-1 and the OSMF attribution guidelines ask (D47).
    map.setPadding({ top: initialPhone.current ? PHONE_TOP_PAD : 0, left: 0, right: 0, bottom: insetRef.current })
    mapRef.current = map

    const pinEl = createPinElement()
    const marker = new maplibregl.Marker({ element: pinEl, draggable: true, anchor: 'bottom' })
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      cb.current.onPinChange({ lat: p.lat, lon: p.lng }, 'map')
    })
    markerRef.current = marker

    // Keyboard: arrows nudge the focused pin; the new place is reported once, on key up or
    // blur, so key repeat does not restart the lookup on every step.
    let nudged = false
    const commitNudge = () => {
      if (!nudged) return
      nudged = false
      const p = marker.getLngLat()
      cb.current.onPinChange({ lat: p.lat, lon: p.lng }, 'map')
    }
    pinEl.addEventListener('keydown', (e) => {
      const off = nudgeOffset(e.key, e.shiftKey)
      if (!off) return
      e.preventDefault()
      e.stopPropagation() // MapLibre's own keyboard handler would pan the map
      const pt = map.project(marker.getLngLat())
      marker.setLngLat(map.unproject([pt.x + off.dx, pt.y + off.dy]))
      nudged = true
    })
    pinEl.addEventListener('keyup', (e) => { if (nudgeOffset(e.key, false)) commitNudge() })
    pinEl.addEventListener('blur', commitNudge)

    // Enter or Space on the focused map drops the pin at the map centre.
    const canvasContainer = map.getCanvasContainer()
    canvasContainer.addEventListener('keydown', (e) => {
      if (e.target !== canvasContainer || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      const c = map.getCenter()
      cb.current.onPinChange({ lat: c.lat, lon: c.lng }, 'map')
    })

    map.on('click', (e) => {
      const target = e.originalEvent.target
      if (target instanceof Element && target.closest('.ps-pin')) return
      cb.current.onPinChange({ lat: e.lngLat.lat, lon: e.lngLat.lng }, 'map')
    })

    let loaded = false
    map.on('load', () => {
      loaded = true
      // An early tile or sprite error is not final if the map then loads.
      if (!cancelled) setLoadError(null)
    })
    // A style swap (theme change) drops every source and layer we added, so the capital
    // roads are re-added after each 'style.load', the first one included. The pin is a DOM
    // marker and is not part of the style.
    map.on('style.load', () => {
      void addCapitalRoads(map, styleTheme.current, () => cancelled)
    })
    map.on('error', () => {
      // Tile errors after the first load are not fatal; only a failed style is.
      if (!loaded && !cancelled) setLoadError('network')
    })

    return () => {
      cancelled = true
      marker.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [attempt])

  // Offline when the page opened: try again by itself once the network is back.
  useEffect(() => {
    if (loadError !== 'network') return
    const retry = () => {
      setLoadError(null)
      setAttempt((n) => n + 1)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [loadError])

  // Theme drives the base style.
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleTheme.current === theme) return
    const apply = () => {
      styleTheme.current = theme
      // diff: false so MapLibre rebuilds the style and fires 'style.load' reliably.
      map.setStyle(STYLE_URLS[theme], { diff: false })
    }
    // Offline the new style cannot load and the working one would be dropped: keep the
    // current map and switch once the network is back.
    if (navigator.onLine) { apply(); return }
    window.addEventListener('online', apply, { once: true })
    return () => window.removeEventListener('online', apply)
  }, [theme])

  // Pin prop drives the marker.
  const pinLat = pin?.lat
  const pinLon = pin?.lon
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    if (pinLat === undefined || pinLon === undefined) marker.remove()
    else {
      marker.setLngLat([pinLon, pinLat]).addTo(map)
      if (focusPin.current) {
        focusPin.current = false
        marker.getElement().focus({ preventScroll: true })
      }
      // A pin set from outside (a report reopened from the history) may be off-screen.
      if (!map.getBounds().contains([pinLon, pinLat])) map.jumpTo({ center: [pinLon, pinLat], zoom: Math.max(map.getZoom(), 16) })
    }
    // `attempt`: a rebuilt map ("Újra", back online) gets a new marker that must be placed too.
  }, [pinLat, pinLon, attempt])

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
    // Not "essential": MapLibre then jumps instead of flying when the user prefers reduced motion.
    mapRef.current?.flyTo({ center: [ll.lon, ll.lat], zoom: 17 })
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
      (err) => {
        setLocating(false)
        setGeoError(geoFailureFromCode(err.code))
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
    focusPin.current = true
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

  const retryMap = () => {
    setLoadError(null)
    setAttempt((n) => n + 1)
  }

  const geoMessage =
    geoError === 'unsupported'
      ? hu.map.geoUnsupported
      : geoError === 'denied'
        ? hu.map.geoErrorBody
        : geoError === 'unavailable'
          ? hu.map.geoUnavailableBody
          : null
  // Without WebGL the search and locate button still work; only the canvas is missing.
  const noWebgl = loadError === 'webgl'
  const controlsUsable = !loadError || noWebgl

  return (
    <div
      className={`ps-map ps-map--${layout}`}
      style={{ '--ps-inset': `${phone ? bottomInset : 0}px` } as React.CSSProperties}
    >
      <div ref={canvasRef} className="ps-map__canvas" role="application" aria-label={hu.map.label} />

      {controlsUsable && (
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
              disabled={!lookupEnabled}
              autoComplete="off"
              enterKeyHint="search"
            />
            <button type="submit" className="ps-search__submit" aria-label={hu.map.searchSubmit} disabled={!lookupEnabled}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.8 4.8 1.4-1.4-4.8-4.8A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
          <div aria-live="polite">
            {lookupEnabled && search.status === 'loading' && <p className="ps-search__note">{hu.map.searching}</p>}
            {lookupEnabled && search.status === 'done' && search.hits.length === 0 && (
              <p className="ps-search__note">{hu.map.noResults}</p>
            )}
            {lookupEnabled && search.status === 'done' && search.hits.length > 0 && (
              <p className="ps-sr-only">{hu.map.resultsCount(search.hits.length)}</p>
            )}
            {(!lookupEnabled || search.status === 'error') && (
              <div className="ps-search__note ps-search__note--off">
                <IconSearchOff />
                <p>
                  <strong>{hu.map.searchUnavailableTitle}</strong>
                  <span>{hu.map.searchUnavailableBody}</span>
                </p>
              </div>
            )}
          </div>
          {lookupEnabled && search.status === 'done' && search.hits.length > 0 && (
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

      {controlsUsable && (
        <div className="ps-ctrls">
          {!phone && !loadError && (
            <div className="ps-ctrl-group">
              <button type="button" aria-label={hu.map.zoomIn} title={hu.map.zoomIn} onClick={() => mapRef.current?.zoomIn()}>
                +
              </button>
              <button type="button" aria-label={hu.map.zoomOut} title={hu.map.zoomOut} onClick={() => mapRef.current?.zoomOut()}>
                −
              </button>
            </div>
          )}
          {phone && turned && !loadError && (
            <CompassButton needleRef={needleRef} onReset={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0 })} />
          )}
          <div className="ps-ctrl-group">
            <button
              type="button"
              className="ps-locate"
              onClick={locate}
              disabled={locating}
              aria-label={hu.map.locate}
              title={hu.map.locate}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.07A7 7 0 0 0 13 5.07V3h-2v2.07A7 7 0 0 0 5.07 11H3v2h2.07A7 7 0 0 0 11 18.93V21h2v-2.07A7 7 0 0 0 18.93 13H21v-2zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
          {!phone && turned && !loadError && (
            <CompassButton needleRef={needleRef} onReset={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0 })} />
          )}
        </div>
      )}

      {!loadError && (
        <div className="ps-legend">
          <span className="ps-legend__bar" aria-hidden="true" />
          {hu.map.legendCapital}
        </div>
      )}

      {showHint && !loadError && !locating && (
        <div className="ps-hint" role="status">
          {phone ? hu.map.tapHint : hu.map.clickHint}
        </div>
      )}

      {locating && (
        <div className="ps-hint" role="status">
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
        <div className={`ps-empty${noWebgl ? ' ps-empty--below' : ''}`} role="alert">
          <div className="ps-empty__card">
            <span className="ps-empty__icon">
              <IconMapOff />
            </span>
            <p className="ps-empty__title">{noWebgl ? hu.map.webglErrorTitle : hu.map.loadErrorTitle}</p>
            <p className="ps-empty__body">{noWebgl ? hu.map.webglErrorBody : hu.map.loadErrorBody}</p>
            <div className="ps-empty__actions">
              {onOpenHistory && (
                <button type="button" className="ps-empty__btn ps-empty__btn--secondary" onClick={onOpenHistory}>
                  {hu.map.loadErrorHistory}
                </button>
              )}
              {!noWebgl && (
                <button type="button" className="ps-empty__btn ps-empty__btn--primary" onClick={retryMap}>
                  {hu.map.loadErrorRetry}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CompassButton({ needleRef, onReset }: { needleRef: React.RefObject<HTMLSpanElement | null>; onReset: () => void }) {
  return (
    <div className="ps-ctrl-group">
      <button type="button" className="ps-compass" onClick={onReset} aria-label={hu.map.resetNorth} title={hu.map.resetNorth}>
        <span ref={needleRef} className="ps-compass__needle" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M12 3l4 9h-8z" className="ps-compass__north" />
            <path d="M12 21l-4-9h8z" className="ps-compass__south" />
          </svg>
        </span>
      </button>
    </div>
  )
}

async function addCapitalRoads(map: maplibregl.Map, theme: ResolvedTheme, isCancelled: () => boolean) {
  try {
    const raw = (await import('../data/capital-roads.geojson?raw')).default
    if (isCancelled()) return
    const data = JSON.parse(raw) as GeoJSON.FeatureCollection
    if (map.getSource('capital-roads')) return
    const paint = CAPITAL_PAINT[theme]
    // Above every road and bridge line of the base style, below the labels that follow them.
    // (Inserting before the first symbol put it under the roads: on OpenFreeMap's dark style
    // the water names come before all roads, and on liberty bridges draw after the arrows.)
    const layers = map.getStyle().layers
    let lastRoad = -1
    layers.forEach((l, i) => {
      if (l.type === 'line' && 'source-layer' in l && l['source-layer'] === 'transportation') lastRoad = i
    })
    const before = layers.slice(lastRoad + 1).find((l) => l.type === 'symbol')?.id
    map.addSource('capital-roads', { type: 'geojson', data })
    map.addLayer(
      {
        id: 'capital-roads-line',
        type: 'line',
        source: 'capital-roads',
        minzoom: 12,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': paint.color,
          // Zoomed out, most visible roads are capital-managed: keep the band thin and faint there.
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 15, paint.opacity],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5 * paint.width, 15, 5 * paint.width, 18, 14 * paint.width],
        },
      },
      before,
    )
  } catch {
    // The overlay is an aid only; the base map keeps working without it.
  }
}
