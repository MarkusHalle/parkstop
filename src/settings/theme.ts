// Appearance: resolves the Light / Dark / Automatic choice (SPEC 4.6, 9) to a concrete theme,
// writes it to <html data-theme>, and tells React (the map) when it changes.
import { useSyncExternalStore } from 'react'
import { loadSettings, subscribeSettings } from './store'
import type { ThemeChoice } from './types'

export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Pure: 'auto' follows the device, an explicit choice wins. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  return systemDark ? 'dark' : 'light'
}

function systemDark(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(DARK_QUERY).matches
  } catch {
    return false
  }
}

export function currentTheme(): ResolvedTheme {
  return resolveTheme(loadSettings().theme, systemDark())
}

const listeners = new Set<() => void>()

/** Sets data-theme and the browser chrome colour; notifies hook subscribers. */
export function applyTheme(): ResolvedTheme {
  const t = currentTheme()
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    if (root.dataset.theme !== t) root.dataset.theme = t
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      const bg = getComputedStyle(root).getPropertyValue('--c-bg').trim()
      if (bg) meta.setAttribute('content', bg)
    }
  }
  listeners.forEach((l) => l())
  return t
}

let started = false
// Held at module level: an unreferenced MediaQueryList may be collected with its listener.
let darkQuery: MediaQueryList | undefined

/** Call once, synchronously, before the first render. Follows setting and OS changes. */
export function initTheme(): void {
  applyTheme()
  if (started || typeof window === 'undefined') return
  started = true
  try {
    darkQuery = window.matchMedia?.(DARK_QUERY)
    darkQuery?.addEventListener('change', applyTheme)
  } catch {
    // no matchMedia: the theme stays what it was
  }
  // Same-tab saves and other-tab storage events both reach the store's listeners.
  subscribeSettings(applyTheme)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light')
}
