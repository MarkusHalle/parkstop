// Settings page (SPEC 4.6, 4.9 F-PLATE-6). The page header is drawn by the app shell.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { hu } from '../i18n/hu'
import { APP_VERSION, useSettings } from './store'
import type { Profile, Settings, ThemeChoice } from './types'
import { IconDevice, IconMonitor, IconMoon, IconSun } from '../app/icons'
import { useLayout } from '../app/useLayout'
import './settings.css'

export interface SettingsPageProps {
  onExportAll: () => void
  onDeleteEverything: () => void
  onPrivacy: () => void
  /** Result message from export / delete, shown as a notice at the top. */
  status?: string | null
}

const Chevron = () => (
  <svg className="settings-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M9 5l7 7-7 7" />
  </svg>
)

export function SettingsPage({ onExportAll, onDeleteEverything, onPrivacy, status }: SettingsPageProps) {
  const t = hu.settings
  const [settings, update] = useSettings()
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const uid = useId()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const change = (patch: Partial<Settings>) => {
    update(patch)
    setSaved(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaved(false), 1500)
  }
  const setField = (key: keyof Profile, value: string) =>
    change({ profile: { ...settings.profile, [key]: value } })

  const fields: Array<{
    key: keyof Profile; label: string; placeholder: string; type: string; auto: string; optional?: boolean
  }> = [
    { key: 'name', label: t.name, placeholder: t.namePlaceholder, type: 'text', auto: 'name' },
    { key: 'address', label: t.address, placeholder: t.addressPlaceholder, type: 'text', auto: 'street-address' },
    { key: 'email', label: t.email, placeholder: t.emailPlaceholder, type: 'email', auto: 'email' },
    { key: 'phone', label: t.phone, placeholder: t.phonePlaceholder, type: 'tel', auto: 'tel', optional: true },
  ]

  const plateOn = settings.plateReader === 'on'
  const layout = useLayout()
  const themes: Array<{ value: ThemeChoice; label: string; icon: ReactNode }> = [
    { value: 'light', label: t.themeLight, icon: <IconSun /> },
    { value: 'dark', label: t.themeDark, icon: <IconMoon /> },
    // "Automatic" follows the device: a phone on the phone layout, a monitor on the PC (owner).
    { value: 'auto', label: t.themeAuto, icon: layout === 'pc' ? <IconMonitor /> : <IconDevice /> },
  ]

  return (
    <div className="settings-page">
      {status ? <div className="notice notice-info" role="status">{status}</div> : null}

      <section className="stack" aria-labelledby={`${uid}-look`}>
        <h2 className="settings-h2" id={`${uid}-look`}>{t.appearanceTitle}</h2>
        <fieldset className="theme-seg" aria-describedby={`${uid}-look-hint`}>
          <legend>{t.appearanceLabel}</legend>
          {themes.map((o) => (
            <label className="theme-seg__opt" key={o.value}>
              <input type="radio" name={`${uid}-theme`} value={o.value} checked={settings.theme === o.value}
                onChange={() => change({ theme: o.value })} />
              <span className="theme-seg__face">{o.icon}<span>{o.label}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="muted small" id={`${uid}-look-hint`} style={{ margin: 0 }}>
          {/* Phone: one running line; PC: one sentence per line (owner). */}
          {layout === 'pc' ? <>{t.appearanceHint[0]}<br />{t.appearanceHint[1]}</> : t.appearanceHint.join(' ')}
        </p>
      </section>

      <section className="stack" aria-labelledby={`${uid}-profile`}>
        <div className="settings-head">
          <h2 className="settings-h2" id={`${uid}-profile`}>{t.profileTitle}</h2>
          <span className="settings-saved" role="status">{saved ? t.saved : ''}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>{t.profileIntro}</p>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label className="field-label" htmlFor={`${uid}-${f.key}`}>
              {f.label}{f.optional ? <> <span className="optional">{t.optional}</span></> : null}
            </label>
            <input
              id={`${uid}-${f.key}`}
              className="input"
              type={f.type}
              autoComplete={f.auto}
              placeholder={f.placeholder}
              value={settings.profile[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </div>
        ))}
      </section>

      <section className="stack" aria-labelledby={`${uid}-behaviour`}>
        <h2 className="settings-h2" id={`${uid}-behaviour`}>{t.behaviourTitle}</h2>
        <div className="settings-card">
          <label className="settings-row">
            <span className="settings-row-text">
              <span className="settings-row-title">{t.plateReader}</span>
              <span className="muted small">{plateOn ? t.plateReaderOn : t.plateReaderOff}</span>
            </span>
            <input type="checkbox" className="switch" role="switch" checked={plateOn}
              onChange={(e) => change({ plateReader: e.target.checked ? 'on' : 'off' })} />
          </label>
          <label className="settings-row">
            <span className="settings-row-text">
              <span className="settings-row-title">{t.addressLookup}</span>
              <span className="muted small">{settings.addressLookup ? t.addressLookupHint : t.addressLookupOffHint}</span>
            </span>
            <input type="checkbox" className="switch" role="switch" checked={settings.addressLookup}
              onChange={(e) => change({ addressLookup: e.target.checked })} />
          </label>
        </div>
      </section>

      <section className="stack" aria-labelledby={`${uid}-data`}>
        <h2 className="settings-h2" id={`${uid}-data`}>{t.dataTitle}</h2>
        <div className="settings-card">
          <button type="button" className="settings-row" onClick={onPrivacy}>
            <span className="settings-row-text"><span className="settings-row-title">{t.privacy}</span></span>
            <Chevron />
          </button>
          <button type="button" className="settings-row" onClick={onExportAll}>
            <span className="settings-row-text"><span className="settings-row-title">{t.exportAll}</span></span>
            <Chevron />
          </button>
          <button type="button" className="settings-row" onClick={() => {
            if (window.confirm(t.confirmDeleteEverything)) onDeleteEverything()
          }}>
            <span className="settings-row-text"><span className="settings-row-danger">{t.deleteEverything}</span></span>
          </button>
        </div>
      </section>

      <p className="settings-footer">{t.version(APP_VERSION)}</p>
    </div>
  )
}
