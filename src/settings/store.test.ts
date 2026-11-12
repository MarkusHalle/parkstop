import { beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_KEY, clearSettings, defaultSettings, loadSettings, reporterFromProfile, saveSettings } from './store'

let data: Record<string, string>
let blocked = false

beforeEach(() => {
  data = {}
  blocked = false
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => {
      if (blocked) throw new Error('blocked')
      return k in data ? data[k] : null
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('blocked')
      data[k] = v
    },
    removeItem: (k: string) => {
      if (blocked) throw new Error('blocked')
      delete data[k]
    },
  } as unknown as Storage
})

describe('settings store', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual({
      profile: { name: '', address: '', email: '', phone: '' }, addressLookup: true, plateReader: 'ask', theme: 'auto',
    })
  })

  it('merges a partial stored value over the defaults', () => {
    data[SETTINGS_KEY] = JSON.stringify({ profile: { name: 'Anna' }, plateReader: 'on' })
    const s = loadSettings()
    expect(s.profile).toEqual({ name: 'Anna', address: '', email: '', phone: '' })
    expect(s.plateReader).toBe('on')
    expect(s.addressLookup).toBe(true)
  })

  it('ignores invalid values', () => {
    data[SETTINGS_KEY] = JSON.stringify({ plateReader: 'maybe', addressLookup: 'x', profile: { name: 5 } })
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('parses the theme and rejects unknown values', () => {
    data[SETTINGS_KEY] = JSON.stringify({ theme: 'dark' })
    expect(loadSettings().theme).toBe('dark')
    data[SETTINGS_KEY] = JSON.stringify({ theme: 'sepia' })
    expect(loadSettings().theme).toBe('auto')
  })

  it('tolerates corrupt JSON', () => {
    data[SETTINGS_KEY] = '{not json'
    expect(loadSettings()).toEqual(defaultSettings())
    data[SETTINGS_KEY] = 'null'
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('never throws when storage is blocked', () => {
    blocked = true
    expect(loadSettings()).toEqual(defaultSettings())
    expect(() => saveSettings(defaultSettings())).not.toThrow()
    expect(() => clearSettings()).not.toThrow()
  })

  it('saves and clears', () => {
    const s = defaultSettings()
    s.addressLookup = false
    saveSettings(s)
    expect(loadSettings().addressLookup).toBe(false)
    clearSettings()
    expect(loadSettings().addressLookup).toBe(true)
  })
})

describe('reporterFromProfile', () => {
  it('is undefined when all fields are empty or blank', () => {
    expect(reporterFromProfile({ name: '', address: ' ', email: '\t', phone: '' })).toBeUndefined()
  })
  it('trims values and omits empty ones', () => {
    expect(reporterFromProfile({ name: '  Anna ', address: '', email: ' a@b.hu ', phone: ' ' }))
      .toEqual({ name: 'Anna', email: 'a@b.hu' })
  })
})
