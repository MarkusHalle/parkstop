// Settings store (SPEC 4.6, 4.9 F-PLATE-6). localStorage only, this device only. Never throws.
import { useCallback, useSyncExternalStore } from 'react'
import type { Reporter } from '../mail/types'
import type { PlateReaderChoice, Profile, Settings, ThemeChoice } from './types'

export const APP_VERSION = '0.3'
export const SETTINGS_KEY = 'parkstop.settings.v1'

export function defaultSettings(): Settings {
  return {
    profile: { name: '', address: '', email: '', phone: '' },
    addressLookup: true,
    plateReader: 'ask',
    theme: 'auto',
  }
}

function isChoice(v: unknown): v is PlateReaderChoice {
  return v === 'ask' || v === 'on' || v === 'off'
}

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'auto' || v === 'light' || v === 'dark'
}

function parse(raw: string | null): Settings {
  const d = defaultSettings()
  if (!raw) return d
  try {
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return d
    const o = p as Record<string, unknown>
    if (o.profile && typeof o.profile === 'object') {
      const pr = o.profile as Record<string, unknown>
      for (const k of ['name', 'address', 'email', 'phone'] as const) {
        const v = pr[k]
        if (typeof v === 'string') d.profile[k] = v
      }
    }
    if (typeof o.addressLookup === 'boolean') d.addressLookup = o.addressLookup
    if (isChoice(o.plateReader)) d.plateReader = o.plateReader
    if (isThemeChoice(o.theme)) d.theme = o.theme
  } catch {
    return defaultSettings()
  }
  return d
}

function readRaw(): string | null {
  try {
    return globalThis.localStorage?.getItem(SETTINGS_KEY) ?? null
  } catch {
    return null
  }
}

// Fallback when storage refuses writes, so the UI still reflects what the user typed.
let memory: Settings | null = null
const listeners = new Set<() => void>()
let cache: { raw: string | null; value: Settings } | null = null

function emit() {
  cache = null
  listeners.forEach((l) => l())
}

export function loadSettings(): Settings {
  const raw = readRaw()
  return raw === null && memory ? memory : parse(raw)
}

export function saveSettings(s: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s))
    memory = null
  } catch {
    memory = s
  }
  emit()
}

export function clearSettings(): void {
  memory = null
  try {
    globalThis.localStorage?.removeItem(SETTINGS_KEY)
  } catch {
    // ignore
  }
  emit()
}

function getSnapshot(): Settings {
  const raw = readRaw()
  if (cache && cache.raw === raw) return cache.value
  const value = raw === null && memory ? memory : parse(raw)
  cache = { raw, value }
  return value
}

const SERVER_SNAPSHOT = defaultSettings()
const getServerSnapshot = (): Settings => SERVER_SNAPSHOT

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SETTINGS_KEY) emit()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

/**
 * Live settings shared by every caller. The patch is shallow: a `profile` in the patch
 * replaces the whole profile, so callers pass `{ ...settings.profile, name }`.
 */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribeSettings, getSnapshot, getServerSnapshot)
  const update = useCallback((patch: Partial<Settings>) => {
    saveSettings({ ...getSnapshot(), ...patch })
  }, [])
  return [settings, update]
}

/** Trimmed reporter for the e-mail signature; undefined when every field is empty. */
export function reporterFromProfile(p: Profile): Reporter | undefined {
  const r: Reporter = {}
  const name = p.name.trim()
  const address = p.address.trim()
  const email = p.email.trim()
  const phone = p.phone.trim()
  if (name) r.name = name
  if (address) r.address = address
  if (email) r.email = email
  if (phone) r.phone = phone
  return Object.keys(r).length ? r : undefined
}
