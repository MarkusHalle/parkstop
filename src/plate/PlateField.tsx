// The "Rendszám" field with the plate reader's states (SPEC 4.9 F-PLATE-2…8; approved mockup
// "08 Rendszám mező állapotai") and the zoomable photo (roadmap 3.6).
import { useId, useRef, useState, type ReactNode } from 'react'
import { hu } from '../i18n/hu'
import { IconCheck } from '../app/icons'
import { useSettings } from '../settings'
import { normalizePlate, plateWhileTyping, type PlateSource } from '../report/plate'
import type { PhotoItem } from '../report/photos'
import { optionWithValue, type PlateOption } from './decide'
import type { PlateReaderState, UiPlate } from './usePlateReader'
import { ZoomPanel, type ZoomPhoto } from './ZoomView'
import './plate.css'

type Option = PlateOption<UiPlate>
type View = 'plain' | 'working' | 'suggested' | 'confirmed' | 'manual' | 'incomplete' | 'pick' | 'unavailable'

/** Decimal megabytes, as in "kb. 26 MB" (SPEC 4.9). */
const MB = 1_000_000

/** F-PLATE-6: offered once, when a photo exists and the user has not answered yet. */
export function PlateOptIn({ photoCount }: { photoCount: number }) {
  const [settings, update] = useSettings()
  const titleId = useId()
  const show = settings.plateReader === 'ask' && photoCount > 0
  // The live wrapper stays mounted so screen readers announce the card when it appears
  // (after the first photo); focus is not moved.
  return (
    <div className="plate-optin-live" aria-live="polite">
      {show && (
        <section className="plate-optin" role="region" aria-labelledby={titleId}>
          <p className="eyebrow">{hu.plate.optInEyebrow}</p>
          <h2 className="plate-optin-title" id={titleId}>{hu.plate.optInTitle}</h2>
          <p className="lead">{hu.plate.optInText}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => update({ plateReader: 'on' })}>{hu.plate.optInYes}</button>
            <button type="button" className="btn btn-secondary" onClick={() => update({ plateReader: 'off' })}>{hu.plate.optInNo}</button>
          </div>
        </section>
      )}
    </div>
  )
}

export interface PlateFieldProps {
  inputId: string
  value: string
  source: PlateSource
  /** Validation error lines, already rendered. */
  errorText: ReactNode
  invalid: boolean
  /** Ids of the visible error lines, for aria-describedby. */
  describedBy?: string
  /** Text typed or edited by the user (its own value from now on). */
  onType: (value: string) => void
  /** Formatting on blur; keeps the source. */
  onFormat: (value: string) => void
  onConfirm: () => void
  onPick: (option: Option) => void
  photos: PhotoItem[]
  reader: PlateReaderState
}

export function PlateField(props: PlateFieldProps) {
  const { inputId, value, source, errorText, invalid, describedBy, onType, onFormat, onConfirm, onPick, photos, reader } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  // Local to this visit of the form: the picker the user closed, the unclear crop they chose,
  // and whether the zoomable photo is open (null: the state's default).
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [chosenKey, setChosenKey] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState<boolean | null>(null)

  const { outcome } = reader
  const pickSig = outcome.kind === 'pick' ? outcome.options.map((o) => o.key).join() : ''
  const allOptions: Option[] =
    outcome.kind === 'suggest' ? [outcome.option] : outcome.kind === 'pick' || outcome.kind === 'manual' ? outcome.options : []
  const chosen = allOptions.find((o) => o.key === chosenKey) ?? null
  const empty = value.trim() === ''

  // What the reader offers for typing by hand: the crops to show and zoom. Kept while the
  // user types, so the zoomed photo does not vanish with the first letter.
  const settled = reader.active && (reader.status === 'ready' || reader.status === 'idle' || reader.status === 'retry') &&
    (outcome.kind === 'suggest' || outcome.kind === 'pick' || outcome.kind === 'manual')
  let helpShown: Option[] = []
  let helpView: 'manual' | 'incomplete' = 'manual'
  if (settled) {
    helpShown = chosen ? [chosen] : allOptions.filter((o) => o.verdict !== 'ok' || outcome.kind !== 'pick')
    if (helpShown.length === 0) helpShown = allOptions
    const incomplete = helpShown[0]?.verdict === 'incomplete' || (outcome.kind === 'manual' && outcome.incomplete && !chosen)
    helpView = incomplete ? 'incomplete' : 'manual'
  }

  let view: View
  let shown: Option[] = [] // crops relevant to this state, first one is shown and zoomed
  if (source === 'confirmed' && !empty) view = 'confirmed'
  else if (source === 'reader' && !empty) {
    view = 'suggested'
    const o = optionWithValue(outcome, value)
    shown = o ? [o] : []
  } else if (!empty) { view = 'plain'; shown = helpShown }
  else if (!reader.active) view = 'plain'
  else if (reader.status === 'failed') view = 'unavailable'
  else if (reader.status === 'loading' || outcome.kind === 'working') view = 'working'
  else if (outcome.kind === 'pick' && dismissed !== pickSig) view = 'pick'
  else if (!settled) view = 'plain'
  else { view = helpView; shown = helpShown }

  const showInput = view !== 'pick'
  const zoomDefault = view === 'manual' || view === 'incomplete' ||
    // Typing after "írd be kézzel": keep the zoomed photo that was open.
    (view === 'plain' && source === 'user' && (outcome.kind === 'manual' || (outcome.kind === 'pick' && dismissed === pickSig)))
  const zoomShown = photos.length > 0 && (zoomOpen ?? zoomDefault)
  const zoomPhotos: ZoomPhoto[] = photos.map((p) => ({
    id: p.id, url: p.url, focus: shown.find((o) => o.photoId === p.id)?.plate.focus ?? null,
  }))
  const crop = shown[0]?.plate.cropUrl ?? null

  let chip: ReactNode = null
  if (view === 'working') chip = <span className="chip chip-info">{hu.plate.working}</span>
  else if (view === 'suggested') chip = <span className="chip chip-warn">{hu.plate.suggested}</span>
  else if (view === 'confirmed') chip = <span className="chip chip-ok"><IconCheck size={14} />{hu.plate.confirmed}</span>
  else if (view === 'manual' || view === 'incomplete' || view === 'unavailable') chip = <span className="chip chip-neutral">{hu.plate.manual}</span>
  const unusual = (view === 'plain' || view === 'confirmed') && normalizePlate(value).format === 'unusual'

  /** Focus the input once the button that was pressed has gone (Jó, a picked plate). */
  const focusInputSoon = () => requestAnimationFrame(() => inputRef.current?.focus())
  /** After „Jó” or a readable pick nothing is left to type: focus the field, not the input, so no phone keyboard opens. */
  const focusFieldSoon = () => requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }))
  const edit = () => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }
  const pick = (o: Option) => {
    setDismissed(null)
    if (o.verdict === 'ok' && o.value !== null) {
      setChosenKey(null)
      onPick(o)
      focusFieldSoon()
    } else {
      // An unclear crop: the user types it, helped by the zoomed crop.
      setChosenKey(o.key)
      setDismissed(pickSig)
      setZoomOpen(null)
      focusInputSoon()
    }
  }
  const progress = reader.progress && reader.progress.total > 0 ? reader.progress : null
  // Screen readers hear the first download once when it starts and once when it ends.
  const announce = !reader.active ? '' : reader.download === 'running' ? hu.plate.downloadStarted
    : reader.download === 'done' ? hu.plate.downloadDone : ''

  return (
    <div className="field plate-field" data-field="plate" ref={fieldRef} tabIndex={-1}>
      <div className="row-between">
        {showInput
          ? <label htmlFor={inputId} className="field-label">{hu.report.plate}</label>
          : <span className="field-label">{hu.report.plate}</span>}
        <span className="plate-chips" aria-live="polite">
          {unusual && <span className="chip chip-warn">{hu.report.plateUnusual}</span>}
          {chip}
        </span>
      </div>

      {view === 'pick' && outcome.kind === 'pick' && (
        <div className="plate-pick" role="group" aria-label={hu.plate.pickTitle}>
          <p className="plate-pick-title">{hu.plate.pickTitle}</p>
          <div className="plate-pick-grid">
            {outcome.options.map((o) => (
              <button key={o.key} type="button" className="plate-pick-btn" onClick={() => pick(o)}
                aria-label={hu.plate.pickOption(o.value ?? hu.plate.pickUnclear, o.photoIndex + 1)}>
                <span className="plate-crop">{o.plate.cropUrl && <img src={o.plate.cropUrl} alt="" />}</span>
                <span className={o.value ? 'plate-pick-text' : 'plate-pick-text muted'} aria-hidden="true">{o.value ?? hu.plate.pickUnclear}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-small plate-pick-none"
            onClick={() => { setDismissed(pickSig); setChosenKey(null); focusInputSoon() }}>
            {hu.plate.pickNone}
          </button>
        </div>
      )}

      {showInput && (
        <div className={`plate plate-${view}${invalid ? ' input-invalid' : ''}`}>
          <span className="plate-country" aria-hidden="true">{hu.report.plateCountry}</span>
          <span className="plate-input-wrap">
            {view === 'working' && <span className="plate-skeleton" aria-hidden="true" />}
            <input ref={inputRef} id={inputId} type="text" value={value} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              aria-invalid={invalid || undefined} aria-describedby={describedBy}
              onChange={(e) => onType(plateWhileTyping(e.target.value))}
              onBlur={() => { const v = normalizePlate(value).value; if (v !== value) onFormat(v) }} />
          </span>
        </div>
      )}
      {errorText}

      {view === 'working' && (
        <p className="muted small">
          {progress ? `${hu.plate.downloading(Math.round(progress.loaded / MB), Math.round(progress.total / MB))} · ` : ''}
          {hu.plate.workingHint}
        </p>
      )}

      {view === 'suggested' && (
        <div className="plate-suggest">
          {crop && (
            <button type="button" className="plate-crop plate-crop-btn" aria-label={hu.plate.zoomOpen} onClick={() => setZoomOpen(true)}>
              <img src={crop} alt={hu.plate.cropAlt} />
            </button>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn-ok" onClick={() => { onConfirm(); focusFieldSoon() }}>{hu.plate.confirm}</button>
            <button type="button" className="btn btn-secondary" onClick={edit}>{hu.plate.edit}</button>
          </div>
        </div>
      )}

      {view === 'incomplete' && (
        <div className="plate-note">
          {crop && <span className="plate-crop"><img src={crop} alt={hu.plate.cropAlt} /></span>}
          <p className="strong">{hu.plate.incompleteTitle}</p>
          <p className="muted small">{hu.plate.incompleteHint}</p>
        </div>
      )}
      {view === 'manual' && reader.status === 'retry' && <p className="muted small">{hu.plate.downloadFailed}</p>}
      {view === 'manual' && reader.status !== 'retry' && (outcome.kind === 'manual' || chosen) && <p className="muted small">{hu.plate.manualHint}</p>}
      {view === 'unavailable' && <p className="muted small">{hu.plate.unavailable}</p>}

      {zoomShown ? (
        <ZoomPanel photos={zoomPhotos} startId={shown[0]?.photoId}
          onClose={() => {
            setZoomOpen(false)
            // The close button is about to disappear: keep keyboard focus on the field.
            requestAnimationFrame(() => (fieldRef.current?.querySelector<HTMLElement>('.plate-zoom-open') ?? inputRef.current)?.focus())
          }} />
      ) : photos.length > 0 && view !== 'pick' && (
        <button type="button" className="btn btn-secondary btn-small plate-zoom-open" onClick={() => setZoomOpen(true)}>
          {hu.plate.zoomOpen}
        </button>
      )}
      <span className="plate-sr" aria-live="polite">{announce}</span>
    </div>
  )
}
