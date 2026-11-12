// Roadmap 4.1: update toast. The service worker never swaps silently (registerType 'prompt');
// the user chooses when to reload.
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { hu } from '../i18n/hu'
import { IconRefresh } from '../app/icons'
import { toastBottom } from './layout'
import './pwa.css'

export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    // An installed app may stay open for days: look for a new version hourly and whenever
    // it comes back to the foreground.
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { if (navigator.onLine) void reg.update().catch(() => {}) }
      window.setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    },
  })
  const [bottom, setBottom] = useState(toastBottom(null))

  // On the phone the toast rides above the bottom sheet or the page's button bar.
  useEffect(() => {
    if (!needRefresh) return
    const measure = () => {
      const sheet = document.querySelector('.sheet, .page-footer')
      setBottom(toastBottom(sheet ? sheet.getBoundingClientRect().height : null))
    }
    measure()
    const id = window.setInterval(measure, 400)
    return () => window.clearInterval(id)
  }, [needRefresh])

  if (!needRefresh) return null
  return (
    <div className="update-toast" role="status" style={{ bottom }}>
      <IconRefresh size={20} />
      <span className="update-text">{hu.pwa.updateAvailable}</span>
      <button type="button" className="btn btn-primary btn-small" onClick={() => void updateServiceWorker(true)}>{hu.pwa.update}</button>
      <button type="button" className="icon-btn update-close" aria-label={hu.pwa.later} onClick={() => setNeedRefresh(false)}>×</button>
    </div>
  )
}
