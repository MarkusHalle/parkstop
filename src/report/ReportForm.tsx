// Roadmap 2.5: report form and validation (SPEC 4.3). Plate typed by hand in M2; the
// on-device reader (SPEC 4.9) arrives in M3 and will suggest a value here.
import { useId, useRef } from 'react'
import { hu } from '../i18n/hu'
import violationsData from '../data/violations.json'
import { IconClose, IconPlus } from '../app/icons'
import { normalizePlate, plateWhileTyping } from './plate'
import { MAX_PHOTOS, type PhotoItem } from './photos'
import type { ReportError } from './validate'

export interface FormState {
  plate: string
  violationId: string
  customText: string
  time: string
  vehicle: string
  note: string
}

export const NOTE_MAX = 500
export const violations = violationsData.violations

export function emptyForm(): FormState {
  return { plate: '', violationId: '', customText: '', time: '', vehicle: '', note: '' }
}

interface Props {
  form: FormState
  onChange: (patch: Partial<FormState>) => void
  photos: PhotoItem[]
  onAddFiles: (files: File[]) => void
  onRemovePhoto: (id: string) => void
  photoMessages: string[]
  errors: ReportError[]
  maxTime: string
  /** The time was filled from a photo (shown as "a fotóból", mockup Report). */
  timeFromPhoto?: boolean
}

export function ReportForm({ form, onChange, photos, onAddFiles, onRemovePhoto, photoMessages, errors, maxTime, timeFromPhoto }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = { plate: useId(), violation: useId(), custom: useId(), time: useId(), vehicle: useId(), note: useId(), photos: useId() }
  const has = (e: ReportError) => errors.includes(e)
  const plateFormat = normalizePlate(form.plate).format
  const err = (e: ReportError, text: string) => has(e) && <p className="field-error" id={`${ids.plate}-${e}`}>{text}</p>

  return (
    <div className="form">
      <section className="field" aria-labelledby={ids.photos} data-field="photos">
        <div className="row-between">
          <h2 className="field-label" id={ids.photos}>{hu.report.photos}</h2>
          <span className="muted small">{hu.report.photoCount(photos.length, MAX_PHOTOS)}</span>
        </div>
        <div className="thumbs">
          {photos.map((p, i) => (
            <div className="thumb" key={p.id}>
              <img src={p.url} alt={hu.report.photoAlt(i + 1)} />
              <button type="button" className="thumb-remove" aria-label={hu.report.removePhoto(i + 1)} onClick={() => onRemovePhoto(p.id)}>
                <IconClose size={16} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className={`thumb-add${has('photos') ? ' input-invalid' : ''}`} aria-label={hu.report.addPhoto}
              onClick={() => fileRef.current?.click()}>
              <IconPlus />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { onAddFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        </div>
        {photoMessages.map((m) => <p key={m} className="field-error">{m}</p>)}
        {err('photos', hu.report.errors.photos)}
        <p className="muted small">{hu.report.photosHint}</p>
      </section>

      <div className="field" data-field="plate">
        <div className="row-between">
          <label htmlFor={ids.plate} className="field-label">{hu.report.plate}</label>
          {plateFormat === 'unusual' && <span className="chip chip-warn">{hu.report.plateUnusual}</span>}
        </div>
        <div className={`plate${has('plate') ? ' input-invalid' : ''}`}>
          <span className="plate-country" aria-hidden="true">{hu.report.plateCountry}</span>
          <input id={ids.plate} type="text" value={form.plate} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            aria-invalid={has('plate') || undefined}
            onChange={(e) => onChange({ plate: plateWhileTyping(e.target.value) })}
            onBlur={() => onChange({ plate: normalizePlate(form.plate).value })} />
        </div>
        {err('plate', hu.report.errors.plate)}
      </div>

      <div className="field" data-field="violation">
        <label htmlFor={ids.violation} className="field-label">{hu.report.violation}</label>
        <select id={ids.violation} className={`input${has('violation') ? ' input-invalid' : ''}`} value={form.violationId}
          aria-invalid={has('violation') || undefined} onChange={(e) => onChange({ violationId: e.target.value })}>
          <option value="" disabled>{hu.report.violationChoose}</option>
          {violations.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {err('violation', hu.report.errors.violation)}
      </div>

      {form.violationId === 'egyeb' && (
        <div className="field" data-field="custom">
          <label htmlFor={ids.custom} className="field-label">{hu.report.customViolation}</label>
          <textarea id={ids.custom} className={`input textarea${has('custom') ? ' input-invalid' : ''}`} rows={2} maxLength={300}
            placeholder={hu.report.customViolationPlaceholder} value={form.customText}
            aria-invalid={has('custom') || undefined} onChange={(e) => onChange({ customText: e.target.value })} />
          {err('custom', hu.report.errors.custom)}
        </div>
      )}

      <div className="field" data-field="time">
        <div className="row-between">
          <label htmlFor={ids.time} className="field-label">{hu.report.time}</label>
          {timeFromPhoto && <span className="muted small">{hu.report.timeFromPhoto}</span>}
        </div>
        <input id={ids.time} type="datetime-local" className={`input${has('time') || has('timeFuture') ? ' input-invalid' : ''}`}
          value={form.time} max={maxTime} aria-invalid={has('time') || has('timeFuture') || undefined}
          onChange={(e) => onChange({ time: e.target.value })} />
        {err('time', hu.report.errors.time)}
        {err('timeFuture', hu.report.errors.timeFuture)}
      </div>

      <div className="field">
        <label htmlFor={ids.vehicle} className="field-label">
          {hu.report.vehicle} <span className="optional">{hu.report.optional}</span>
        </label>
        <input id={ids.vehicle} type="text" className="input" maxLength={100} placeholder={hu.report.vehiclePlaceholder}
          value={form.vehicle} onChange={(e) => onChange({ vehicle: e.target.value })} />
      </div>

      <div className="field">
        <div className="row-between">
          <label htmlFor={ids.note} className="field-label">
            {hu.report.note} <span className="optional">{hu.report.optional}</span>
          </label>
          <span className="muted small">{hu.report.counter(form.note.length, NOTE_MAX)}</span>
        </div>
        <textarea id={ids.note} className="input textarea" rows={3} maxLength={NOTE_MAX} placeholder={hu.report.notePlaceholder}
          value={form.note} onChange={(e) => onChange({ note: e.target.value })} />
      </div>

      <p className="muted small">{hu.report.tip}</p>
    </div>
  )
}
