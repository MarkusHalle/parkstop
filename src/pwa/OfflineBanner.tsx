// Roadmap 4.1: thin warning bar while the device is offline. Map tiles and address lookup need
// the network; history and drafts do not.
import { useSyncExternalStore } from 'react'
import { hu } from '../i18n/hu'
import { IconWifiOff } from '../app/icons'
import './pwa.css'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  // The status wrapper stays mounted so screen readers announce the bar when it appears.
  return (
    <div role="status">
      {!online && (
        <div className="offline-banner">
          <IconWifiOff />
          <span>{hu.pwa.offline}</span>
        </div>
      )}
    </div>
  )
}
