// Roadmap 2.1: app shell. Phone: full-screen map with a bottom sheet, full pages for the
// form and e-mail; PC (≥ 900 px): side panel beside the map (SPEC 3, 9; approved mockups).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hu } from '../i18n/hu'
import { loadResolver } from '../authority'
import type { LatLon, Resolution, ResolveOptions } from '../authority/types'
import { MapView, useReverseAddress, type PinSource } from '../map'
import type { MailInput } from '../mail'
import { firstTakenAt, readPhotoTime } from '../report/exif'
import { addPhotos, releasePhoto, type PhotoItem } from '../report/photos'
import { emptyForm, ReportForm, violations, type FormState } from '../report/ReportForm'
import { ERROR_FIELD, parseLocalDateTime, toLocalDateTime, validateReport, type ReportError } from '../report/validate'
import { AddressField } from './AddressField'
import { AuthorityCard, ConfidenceChip, recipients } from './AuthorityCard'
import { DoneStep } from './DoneStep'
import { MailStep } from './MailStep'
import { StartPanel } from './StartPanel'
import { IconBack, IconCheck, IconHistory, IconPin, IconSettings, LogoPin } from './icons'
import { SheetHandle } from './SheetHandle'
import { useLayout } from './useLayout'
import { useReducedPhotos } from './useReducedPhotos'
import './app.css'

type Step = 'map' | 'report' | 'mail' | 'done'
type Resolve = (ll: LatLon, opts: ResolveOptions) => Resolution
const STEP_NO: Record<Step, number> = { map: 1, report: 2, mail: 3, done: 3 }
const same = (a: LatLon | null, b: LatLon | null) => !!a && !!b && a.lat === b.lat && a.lon === b.lon

export function App() {
  const layout = useLayout()
  const [step, setStep] = useState<Step>('map')

  // Browser back button moves between steps instead of leaving the app.
  useEffect(() => {
    history.replaceState({ step: 'map' }, '')
    const onPop = (e: PopStateEvent) => setStep((e.state as { step?: Step } | null)?.step ?? 'map')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const go = useCallback((s: Step) => {
    history.pushState({ step: s }, '')
    setStep(s)
    window.scrollTo(0, 0)
  }, [])
  const back = () => history.back()

  // --- Place ---------------------------------------------------------------------------
  const [pin, setPin] = useState<LatLon | null>(null)
  const [searchHit, setSearchHit] = useState<{ pin: LatLon; address: string } | null>(null)
  const lastSearchPin = useRef<LatLon | null>(null)
  const [manualAddress, setManualAddress] = useState<string | null>(null)
  const [locateRequest, setLocateRequest] = useState(0)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)

  const onPinChange = useCallback((ll: LatLon, source: PinSource) => {
    setPin(ll)
    setManualAddress(null)
    setChosenId(null)
    setSheetOpen(true)
    if (source === 'search') lastSearchPin.current = ll
    else setSearchHit(null)
  }, [])
  const onAddressPicked = useCallback((address: string) => {
    if (lastSearchPin.current) setSearchHit({ pin: lastSearchPin.current, address })
  }, [])
  const searchKnown = searchHit && same(searchHit.pin, pin) ? searchHit : null
  const reverse = useReverseAddress(pin, true, searchKnown?.pin ?? null)
  const address = manualAddress ?? searchKnown?.address ?? reverse.address ?? ''
  const addressStatus = manualAddress !== null || searchKnown ? 'done' : reverse.status

  // --- Authority -----------------------------------------------------------------------
  const [resolver, setResolver] = useState<{ fn: Resolve } | null>(null)
  const [resolverError, setResolverError] = useState(false)
  useEffect(() => {
    loadResolver().then((fn) => setResolver({ fn }), () => setResolverError(true))
  }, [])
  const resolution = useMemo(() => (pin && resolver ? resolver.fn(pin, { today: new Date() }) : null), [pin, resolver])
  const resolved = resolution?.kind === 'resolved' ? resolution : null
  const recipient = resolved
    ? (recipients(resolved).find((x) => x.authority.id === chosenId)?.authority ?? resolved.primary)
    : null

  // --- Report --------------------------------------------------------------------------
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [photoMessages, setPhotoMessages] = useState<string[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showErrors, setShowErrors] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Where the time came from: the user's own edit is never overwritten by a photo.
  const [timeSource, setTimeSource] = useState<'none' | 'now' | 'photo' | 'user'>('none')
  const onAddFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const res = await addPhotos(photos.length, files)
    setPhotos((p) => [...p, ...res.added])
    setPhotoMessages([
      ...res.unreadable.map((n) => hu.report.photoUnreadable(n)),
      ...(res.overLimit > 0 ? [hu.report.tooMany(5)] : []),
    ])
    // SPEC 4.3: the time defaults to the photo's capture time (EXIF, read on the device).
    // The photo's position is not used: Android removes it before a browser sees the file (D34).
    const takenAt = firstTakenAt(await Promise.all(res.added.map((p) => readPhotoTime(p.file))))
    if (takenAt && timeSource !== 'user') {
      setForm((f) => ({ ...f, time: toLocalDateTime(takenAt) }))
      setTimeSource('photo')
    }
  }, [photos.length, timeSource])
  const onRemovePhoto = (id: string) => {
    setPhotos((ps) => {
      const gone = ps.find((p) => p.id === id)
      if (gone) releasePhoto(gone)
      return ps.filter((p) => p.id !== id)
    })
    setPhotoMessages([])
  }

  const errors: ReportError[] = validateReport(
    { photoCount: photos.length, plate: form.plate, violationId: form.violationId, customText: form.customText, time: form.time, address },
    new Date(),
  )

  const startReport = () => {
    if (!form.time) {
      setForm((f) => ({ ...f, time: toLocalDateTime(new Date()) }))
      setTimeSource('now')
    }
    go('report')
  }
  const toMail = () => {
    if (errors.length > 0) {
      setShowErrors(true)
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-field="${ERROR_FIELD[errors[0]]}"] :is(input:not([type=hidden]):not([hidden]), select, textarea, button)`,
        )
        el?.focus()
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
      return
    }
    go('mail')
  }

  const observedAt = parseLocalDateTime(form.time)
  const mailInput = useMemo<MailInput | null>(() => {
    if (!resolved || !recipient || !observedAt) return null
    const v = violations.find((x) => x.id === form.violationId)
    if (!v) return null
    return {
      template: recipient.type === 'police' ? 'B' : 'A',
      recipient: { name: recipient.name, email: recipient.email },
      plate: form.plate,
      address: address.trim(),
      districtRoman: resolved.districtRoman,
      lat: pin!.lat,
      lon: pin!.lon,
      observedAt,
      violation: v.id === 'egyeb' || !v.sentence
        ? { kind: 'custom', text: form.customText }
        : { kind: 'listed', sentence: v.sentence, legalRef: v.legalRef },
      vehicle: form.vehicle,
      note: form.note,
      photoCount: photos.length,
    }
    // observedAt is derived from form.time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, recipient, form, address, pin, photos.length])

  const reduced = useReducedPhotos(step === 'mail' || step === 'done', photos, form.plate, observedAt)
  const [handoff, setHandoff] = useState<{ at: Date; bodyCopied: boolean | null } | null>(null)

  const reset = () => {
    photos.forEach(releasePhoto)
    setPhotos([]); setPhotoMessages([]); setForm(emptyForm()); setShowErrors(false)
    setPin(null); setManualAddress(null); setSearchHit(null); setChosenId(null); setHandoff(null)
    setTimeSource('none'); setSheetOpen(true)
    history.replaceState({ step: 'map' }, '')
    setStep('map')
  }

  // Guard: steps that need earlier data fall back (e.g. browser back after "Új bejelentés").
  let view: Step = step
  if (view !== 'map' && !resolved) view = 'map'
  if ((view === 'mail' || view === 'done') && (!mailInput || errors.length > 0)) view = resolved ? 'report' : 'map'
  if (view === 'done' && !handoff) view = 'mail'

  // --- Phone bottom sheet height → map padding -------------------------------------------
  const sheetRef = useRef<HTMLElement>(null)
  const [sheetH, setSheetH] = useState(0)
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) { setSheetH(0); return }
    const ro = new ResizeObserver(() => setSheetH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout, view])

  const comingSoon = () => { setToast(hu.nav.comingSoon); window.setTimeout(() => setToast(null), 2500) }

  // --- Step content ----------------------------------------------------------------------
  const authorityCard = (
    <AuthorityCard resolution={resolution} loadError={resolverError} address={address} addressStatus={addressStatus}
      onAddressChange={setManualAddress} selectedId={recipient?.id ?? null} onSelect={setChosenId}
      onMovePin={() => { setPin(null); setManualAddress(null) }} />
  )
  const start = (
    <StartPanel layout={layout} photoCount={photos.length} onAddFiles={onAddFiles} onLocate={() => setLocateRequest((n) => n + 1)} />
  )
  const summary = resolved && recipient && (
    <section className="summary">
      <span className="summary-icon"><IconPin /></span>
      <div className="summary-text">
        <AddressField address={address} status={addressStatus} districtRoman={resolved.districtRoman} onChange={setManualAddress}
          forceEdit={address.trim() === ''} invalid={showErrors && errors.includes('address')} />
        <div className="summary-recipient">
          <span className="muted small">{recipient.name}</span>
          {recipient.id === resolved.primary.id && <ConfidenceChip value={resolved.confidence} />}
        </div>
      </div>
    </section>
  )

  let body: ReactNode
  let footer: ReactNode = null
  if (view === 'map') {
    body = pin ? authorityCard : start
    if (resolved) footer = <button type="button" className="btn btn-primary" onClick={startReport}>{hu.authority.continue}</button>
  } else if (view === 'report') {
    body = (
      <div className="stack">
        <div data-field="address">{summary}</div>
        {timeSource === "photo" && <p className="notice notice-ok" role="status"><IconCheck size={16} />{hu.report.filledTime}</p>}
        <ReportForm form={form} timeFromPhoto={timeSource === 'photo'}
          onChange={(p) => { if (p.time !== undefined) setTimeSource('user'); setForm((f) => ({ ...f, ...p })) }}
          photos={photos} onAddFiles={onAddFiles}
          onRemovePhoto={onRemovePhoto} photoMessages={photoMessages} errors={showErrors ? errors : []}
          maxTime={toLocalDateTime(new Date())} />
        {showErrors && errors.length > 0 && <p className="notice notice-error" role="alert">{hu.report.fixErrors}</p>}
      </div>
    )
    footer = <button type="button" className="btn btn-primary" onClick={toMail}>{hu.report.continue}</button>
  } else if (view === 'mail') {
    body = mailInput && (
      <MailStep input={mailInput} photos={photos} reduced={reduced} layout={layout}
        onHandedOff={(bodyCopied) => { setHandoff({ at: new Date(), bodyCopied }); go('done') }} />
    )
  } else {
    body = handoff && (
      <DoneStep layout={layout} handedAt={handoff.at} bodyCopied={handoff.bodyCopied} reduced={reduced} onNew={reset} onBack={back} />
    )
  }

  const map = (
    <MapView pin={pin} onPinChange={onPinChange} onAddressPicked={onAddressPicked} layout={layout}
      bottomInset={layout === 'phone' ? sheetH : 0} showHint={!pin && view === 'map'} lookupEnabled locateRequest={locateRequest} />
  )
  const toastEl = toast && <div className="toast" role="status">{toast}</div>

  if (layout === 'pc') {
    const n = STEP_NO[view]
    const stepNames = [hu.steps.where, hu.steps.details, hu.steps.mail]
    return (
      <div className="app app-pc">
        <aside className="panel">
          <header className="panel-header">
            <Brand />
            <nav className="nav-text">
              <button type="button" className="btn-link" onClick={comingSoon}>{hu.nav.history}</button>
              <button type="button" className="btn-link" onClick={comingSoon}>{hu.nav.settings}</button>
            </nav>
          </header>
          <ol className="stepper">
            {stepNames.map((name, i) => {
              const target: Step = (['map', 'report', 'mail'] as const)[i]
              const reachable = i + 1 < n && view !== 'done'
              return (
                <li key={name} className={i + 1 <= n ? 'stepper-on' : ''} aria-current={i + 1 === n ? 'step' : undefined}>
                  <span className="stepper-bar" />
                  {reachable
                    ? <button type="button" className="btn-link" onClick={() => go(target)}>{hu.steps.label(i + 1, name)}</button>
                    : hu.steps.label(i + 1, name)}
                </li>
              )
            })}
          </ol>
          <div className="panel-body" key={view}>{body}</div>
          {footer && <div className="panel-footer">{footer}</div>}
        </aside>
        <main className="map-area">{map}</main>
        {toastEl}
      </div>
    )
  }

  // Phone. The map stays mounted at the same place in the tree under the full pages, so
  // going back to step 1 does not reload it.
  const title = view === 'report' ? hu.report.title : view === 'mail' ? hu.mail.title : hu.appName
  return (
    <div className="app app-phone">
      <header className="topbar" inert={view !== 'map'}>
        <Brand />
        <nav className="nav-icons">
          <button type="button" className="icon-btn" aria-label={hu.nav.history} onClick={comingSoon}><IconHistory /></button>
          <button type="button" className="icon-btn" aria-label={hu.nav.settings} onClick={comingSoon}><IconSettings /></button>
        </nav>
      </header>
      <main className="map-area" inert={view !== 'map'}>{map}</main>
      {view === 'map' ? (
        <section className="sheet" ref={sheetRef} aria-label={hu.steps.where}>
          <SheetHandle open={sheetOpen} onChange={setSheetOpen} />
          {/* Both parts stay mounted and slide (grid rows 1fr ↔ 0fr) so folding is smooth. */}
          <div className={`sheet-fold${sheetOpen ? ' is-open' : ''}`} inert={!sheetOpen}>
            <div className="sheet-fold-inner">
              <div className="sheet-body">{body}</div>
            </div>
          </div>
          <div className={`sheet-fold sheet-fold-peek${sheetOpen ? '' : ' is-open'}`} inert={sheetOpen}>
            <div className="sheet-fold-inner">
              <button type="button" className="sheet-peek" onClick={() => setSheetOpen(true)}>
                {pin ? (resolved?.primary.name ?? (resolution?.kind === 'outside' ? hu.authority.outsideTitle : hu.authority.loading)) : hu.start.title}
              </button>
            </div>
          </div>
          {footer && <div className="sheet-footer">{footer}</div>}
        </section>
      ) : (
        <div className="page" key={view}>
          <header className="page-header">
            {view !== 'done' && <button type="button" className="icon-btn" aria-label={hu.nav.back} onClick={back}><IconBack /></button>}
            <span className="page-title">{title}</span>
            {view !== 'done' && <span className="muted small">{hu.steps.progress(STEP_NO[view], 3)}</span>}
          </header>
          {view !== 'done' && (
            <div className="progress" aria-hidden="true">
              {[1, 2, 3].map((i) => <span key={i} className={i <= STEP_NO[view] ? 'on' : ''} />)}
            </div>
          )}
          <main className="page-body">{body}</main>
          {footer && <div className="page-footer">{footer}</div>}
        </div>
      )}
      {toastEl}
    </div>
  )
}

function Brand() {
  return (
    <div className="brand">
      <LogoPin />
      <span className="brand-name">{hu.appName}</span>
    </div>
  )
}
