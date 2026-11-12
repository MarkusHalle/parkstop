// Roadmap 2.1: app shell. Phone: full-screen map with a bottom sheet, full pages for the
// form and e-mail; PC (≥ 900 px): side panel beside the map (SPEC 3, 9; approved mockups).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hu } from '../i18n/hu'
import { loadResolver } from '../authority'
import type { LatLon, Resolution, ResolveOptions } from '../authority/types'
import { MapView, useReverseAddress, type PinSource } from '../map'
import type { MailInput } from '../mail'
import { firstTakenAt, readPhotoTime } from '../report/exif'
import { addPhotos, photoFromBlob, releasePhoto, type PhotoItem } from '../report/photos'
import { deleteAllReports, exportAll, exportFileName, getReport, HistoryPage, newReportId, saveReport, type StoredReport } from '../history'
import { clearSettings, loadSettings, reporterFromProfile, SettingsPage, useSettings } from '../settings'
import { saveFiles } from '../mail'
import { emptyForm, ReportForm, violations, type FormState } from '../report/ReportForm'
import { clearPlateCache, reconcileField, usePlateReader, type PlateOption, type UiPlate } from '../plate'
import { ERROR_FIELD, parseLocalDateTime, toLocalDateTime, validateReport, type ReportError } from '../report/validate'
import { OfflineBanner, UpdatePrompt } from '../pwa'
import { HelpPage, PrivacyPage } from '../help'
import { AddressField } from './AddressField'
import { AuthorityCard, ConfidenceChip, recipients } from './AuthorityCard'
import { DoneStep } from './DoneStep'
import { MailStep } from './MailStep'
import { StartPanel } from './StartPanel'
import { IconBack, IconCheck, IconHelp, IconHistory, IconPin, IconSettings, LogoMark } from './icons'
import { SheetHandle } from './SheetHandle'
import { useLayout } from './useLayout'
import { useReducedPhotos } from './useReducedPhotos'
import './app.css'

type Step = 'map' | 'report' | 'mail' | 'done' | SideStep
type SideStep = 'history' | 'settings' | 'help' | 'privacy'
type Resolve = (ll: LatLon, opts: ResolveOptions) => Resolution
const STEP_NO: Record<Step, number> = { map: 1, report: 2, mail: 3, done: 3, history: 0, settings: 0, help: 0, privacy: 0 }
const isSide = (s: Step): s is SideStep => s === 'history' || s === 'settings' || s === 'help' || s === 'privacy'
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
  const [settings] = useSettings()
  const reverse = useReverseAddress(pin, settings.addressLookup, searchKnown?.pin ?? null)
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
  const onMovePhoto = (id: string, dir: -1 | 1) => {
    setPhotos((ps) => {
      const i = ps.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ps.length) return ps
      const next = [...ps]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // --- Plate reader (SPEC 4.9): suggests the plate, never overwrites the user's own value ----
  const readerOn = settings.plateReader === 'on'
  const plateReader = usePlateReader(photos, readerOn)
  // How the value got there (plateSource / plateVia / plateTyped) is part of the form, so a
  // reopened draft keeps a picked but unconfirmed plate (F-PLATE-2, -3).
  useEffect(() => {
    const action = reconcileField({
      plate: form.plate, source: form.plateSource ?? 'user', via: form.plateVia, typed: form.plateTyped,
      outcome: plateReader.outcome, readerOn, readerFailed: plateReader.status === 'failed',
    })
    if (action.type === 'fill') {
      // Re-checked against the latest form: the user may have typed in the meantime.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to the reader's result
      setForm((f) => ((f.plateSource ?? 'user') === 'user' && !f.plateTyped && f.plate.trim() === ''
        ? { ...f, plate: action.value, plateSource: 'reader', plateVia: 'auto' }
        : f))
    } else if (action.type === 'clear') {
      // The app withdraws its own unconfirmed suggestion; a remaining single one may be offered again.
      setForm((f) => (f.plateSource === 'reader' ? { ...f, plate: '', plateSource: 'user', plateVia: undefined } : f))
    }
  }, [form.plate, form.plateSource, form.plateVia, form.plateTyped, plateReader.outcome, plateReader.status, readerOn])
  const onPickPlate = useCallback((o: PlateOption<UiPlate>) => {
    const value = o.value
    if (value === null) return
    setForm((f) => (f.plateSource === 'confirmed' ? f : { ...f, plate: value, plateSource: 'reader', plateVia: 'pick' }))
  }, [])

  const errors: ReportError[] = validateReport(
    { photoCount: photos.length, plate: form.plate, plateSource: form.plateSource, violationId: form.violationId, customText: form.customText, time: form.time, address },
    new Date(),
  )

  const startReport = () => {
    if (!current) setCurrent({ id: newReportId(), createdAt: new Date().getTime() })
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
        el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
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
      reporter: reporterFromProfile(settings.profile),
    }
    // observedAt is derived from form.time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, recipient, form, address, pin, photos.length, settings.profile])

  const reduced = useReducedPhotos(step === 'mail' || step === 'done', photos, form.plate, observedAt)
  const [handoff, setHandoff] = useState<{ at: Date; bodyCopied: boolean | null } | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const showToast = useCallback((text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }, [])

  // --- History (SPEC 4.7): the report in progress is saved on this device -----------------
  // The report being edited: its history id and when it was first saved.
  const [current, setCurrent] = useState<{ id: string; createdAt: number } | null>(null)
  const snapshot = useRef<() => StoredReport | null>(() => null)
  // Refreshed after every render, before the effects below run.
  useLayoutEffect(() => {
  snapshot.current = () => {
    if (!current || !pin) return null
    return {
      id: current.id, createdAt: current.createdAt, updatedAt: Date.now(),
      status: handoff ? 'handed' : 'draft', handedAt: handoff?.at.getTime() ?? null,
      pin, address, addressEdited: manualAddress !== null,
      recipientId: chosenId, recipientName: recipient?.name ?? '', districtRoman: resolved?.districtRoman ?? null,
      form, timeSource,
      photos: photos.map((p) => ({ name: p.file.name, type: p.file.type, blob: p.file })),
    }
  }
  })
  const saveNow = useCallback(() => {
    const r = snapshot.current()
    if (r) saveReport(r).catch(() => showToast(hu.history.saveError))
  }, [showToast])
  // Save on every step change, photo change and hand-off, and when the page is hidden (the
  // phone switches to the mail app); typing alone does not rewrite the photos each time.
  useEffect(() => {
    if (step === 'report' || step === 'mail' || step === 'done') saveNow()
  }, [step, photos, handoff, current, saveNow])
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') saveNow() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', saveNow)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveNow) }
  }, [saveNow])

  const clearReport = () => {
    photos.forEach(releasePhoto)
    setPhotos([]); setPhotoMessages([]); setForm(emptyForm()); setShowErrors(false)
    setPin(null); setManualAddress(null); setSearchHit(null); setChosenId(null); setHandoff(null)
    setTimeSource('none'); setSheetOpen(true); setCurrent(null)
  }
  const reset = () => {
    saveNow()
    clearReport()
    history.replaceState({ step: 'map' }, '')
    setStep('map')
  }
  const openSide = (s: SideStep) => {
    saveNow()
    if (step === s) return
    if (isSide(step)) { history.replaceState({ step: s }, ''); setStep(s) } else go(s)
  }
  const openReport = async (id: string, message?: string) => {
    saveNow()
    let r: StoredReport | undefined
    try { r = await getReport(id) } catch { r = undefined }
    if (!r || !r.pin) { showToast(hu.history.loadError); return }
    photos.forEach(releasePhoto)
    setPhotos(r.photos.map((p) => photoFromBlob(p.name, p.type, p.blob)))
    setPhotoMessages([]); setShowErrors(false)
    setForm({ ...emptyForm(), ...r.form }); setTimeSource(r.timeSource)
    setPin(r.pin); setSearchHit(null); setManualAddress(r.address || null); setChosenId(r.recipientId)
    setCurrent({ id: r.id, createdAt: r.createdAt })
    setHandoff(r.handedAt ? { at: new Date(r.handedAt), bodyCopied: null } : null)
    if (!r.form.time) { setForm((f) => ({ ...f, time: toLocalDateTime(new Date()) })); setTimeSource('now') }
    go(r.status === 'handed' && r.photos.length > 0 ? 'mail' : 'report')
    if (message) showToast(message)
  }
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null)
  const exportEverything = async () => {
    try {
      const blob = await exportAll({ settings: loadSettings() })
      await saveFiles([{ blob, name: exportFileName(new Date()) }])
      setSettingsStatus(hu.history.exported)
    } catch {
      setSettingsStatus(hu.history.exportError)
    }
  }
  const deleteEverything = async () => {
    try { await deleteAllReports() } catch { /* storage unavailable: nothing stored */ }
    await clearPlateCache() // the downloaded plate-reader files (Cache Storage)
    clearSettings()
    clearReport()
    setSettingsStatus(hu.settings.deletedEverything)
  }

  // Guard: steps that need earlier data fall back (e.g. browser back after "Új bejelentés").
  let view: Step = step
  if (view !== 'map' && !isSide(view) && !resolved) view = 'map'
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

  const [historyCount, setHistoryCount] = useState<number | null>(null)

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
          onRemovePhoto={onRemovePhoto} onMovePhoto={onMovePhoto} photoMessages={photoMessages} errors={showErrors ? errors : []}
          maxTime={toLocalDateTime(new Date())} plateReader={plateReader} onPickPlate={onPickPlate} />
        {showErrors && errors.length > 0 && <p className="notice notice-error" role="alert">{hu.report.fixErrors}</p>}
      </div>
    )
    footer = <button type="button" className="btn btn-primary" onClick={toMail}>{hu.report.continue}</button>
  } else if (view === 'mail') {
    body = mailInput && (
      <MailStep input={mailInput} photos={photos} reduced={reduced} layout={layout}
        onHandedOff={(bodyCopied) => { setHandoff({ at: new Date(), bodyCopied }); go('done') }} />
    )
  } else if (view === 'done') {
    body = handoff && (
      <DoneStep layout={layout} handedAt={handoff.at} bodyCopied={handoff.bodyCopied} reduced={reduced} onNew={reset} onBack={back} />
    )
  } else if (view === 'history') {
    body = (
      <HistoryPage onOpen={(id) => void openReport(id)} onCountChange={setHistoryCount} exportExtra={() => ({ settings: loadSettings() })}
        onDeleted={(id) => { if (id === null || id === current?.id) clearReport() }}
        onDuplicated={(r) => void openReport(r.id, hu.history.duplicated)} onStart={() => go('map')} />
    )
  } else if (view === 'help') {
    // Privacy opens on top of help (pushState), so Back returns to help.
    body = <HelpPage onPrivacy={() => go('privacy')} />
  } else if (view === 'privacy') {
    body = <PrivacyPage />
  } else {
    body = (
      <SettingsPage status={settingsStatus} onExportAll={() => void exportEverything()}
        onDeleteEverything={() => void deleteEverything()} onPrivacy={() => go('privacy')} />
    )
  }

  const map = (
    <MapView pin={pin} onPinChange={onPinChange} onAddressPicked={onAddressPicked} layout={layout}
      bottomInset={layout === 'phone' ? sheetH : 0} showHint={!pin && view === 'map'} lookupEnabled={settings.addressLookup}
      locateRequest={locateRequest} onOpenHistory={() => openSide('history')} />
  )
  // The live region stays mounted so screen readers announce each message when it appears.
  const toastEl = <div className="toast-region" role="status">{toast && <div className="toast">{toast}</div>}</div>
  const sideTitle = view === 'history' ? hu.history.title : view === 'help' ? hu.help.title : view === 'privacy' ? hu.privacy.title : hu.settings.title
  const sideMeta = view === 'history' && historyCount !== null ? hu.history.count(historyCount) : null
  const navTo = (s: SideStep) => () => { setSettingsStatus(null); openSide(s) }

  // After a step or page change the pressed button is gone: move focus to the new heading so
  // keyboard and screen-reader users start at the top of the new content.
  const lastView = useRef(view)
  useEffect(() => {
    if (lastView.current === view) return
    lastView.current = view
    const id = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>('.page-header h1, .side-header h1, main h1, .panel h1, .sheet h1')
      if (!h) return
      h.tabIndex = -1
      h.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [view])

  if (layout === 'pc') {
    const n = STEP_NO[view]
    const stepNames = [hu.steps.where, hu.steps.details, hu.steps.mail]
    return (
      <div className="app app-pc">
        <main className="panel">
          <header className="panel-header">
            <Brand />
            <nav className="nav-text">
              <button type="button" className="btn-link" aria-current={view === 'help' ? 'page' : undefined} onClick={navTo('help')}>{hu.help.open}</button>
              <button type="button" className="btn-link" aria-current={view === 'history' ? 'page' : undefined} onClick={navTo('history')}>{hu.nav.history}</button>
              <button type="button" className="btn-link" aria-current={view === 'settings' ? 'page' : undefined} onClick={navTo('settings')}>{hu.nav.settings}</button>
            </nav>
          </header>
          <OfflineBanner />
          {isSide(view) ? (
            <div className="side-header">
              <button type="button" className="icon-btn" aria-label={hu.nav.back} onClick={back}><IconBack /></button>
              <h1 className="page-title">{sideTitle}</h1>
              {sideMeta && <span className="muted small">{sideMeta}</span>}
            </div>
          ) : (
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
          )}
          {!isSide(view) && (view === 'report' || view === 'mail') && <h1 className="sr-only">{view === 'report' ? hu.report.title : hu.mail.title}</h1>}
          <div className="panel-body" key={view}>{body}</div>
          {footer && <div className="panel-footer">{footer}</div>}
        </main>
        <div className="map-area">{map}</div>
        {toastEl}
        <UpdatePrompt />
      </div>
    )
  }

  // Phone. The map stays mounted at the same place in the tree under the full pages, so
  // going back to step 1 does not reload it.
  const title = view === 'report' ? hu.report.title : view === 'mail' ? hu.mail.title : isSide(view) ? sideTitle : hu.appName
  const stepped = view === 'report' || view === 'mail'
  return (
    <div className="app app-phone">
      <header className="topbar" inert={view !== 'map'}>
        <Brand />
        <nav className="nav-icons">
          <button type="button" className="icon-btn" aria-label={hu.help.open} onClick={navTo('help')}><IconHelp /></button>
          <button type="button" className="icon-btn" aria-label={hu.nav.history} onClick={navTo('history')}><IconHistory /></button>
          <button type="button" className="icon-btn" aria-label={hu.nav.settings} onClick={navTo('settings')}><IconSettings /></button>
        </nav>
      </header>
      <OfflineBanner />
      {/* A div with the main role while the map is the view, so a page's own <main> is the only one otherwise. */}
      <div className="map-area" role={view === 'map' ? 'main' : undefined} inert={view !== 'map'}>{map}</div>
      {view === 'map' ? (
        <section className="sheet" ref={sheetRef} aria-label={hu.steps.where} onKeyDown={(e) => {
          // Escape folds the sheet (not while typing in a field: there it belongs to the field).
          if (e.key !== 'Escape' || !sheetOpen || e.defaultPrevented) return
          if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
          setSheetOpen(false)
          requestAnimationFrame(() => document.querySelector<HTMLElement>('.sheet-peek')?.focus())
        }}>
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
            {view === 'done' ? <span className="page-title">{title}</span> : <h1 className="page-title">{title}</h1>}
            {stepped && <span className="muted small">{hu.steps.progress(STEP_NO[view], 3)}</span>}
            {sideMeta && <span className="muted small">{sideMeta}</span>}
          </header>
          {stepped && (
            <div className="progress" aria-hidden="true">
              {[1, 2, 3].map((i) => <span key={i} className={i <= STEP_NO[view] ? 'on' : ''} />)}
            </div>
          )}
          <main className="page-body">{body}</main>
          {footer && <div className="page-footer">{footer}</div>}
        </div>
      )}
      {toastEl}
      <UpdatePrompt />
    </div>
  )
}

function Brand() {
  return (
    <div className="brand">
      <LogoMark />
      <span className="brand-name">{hu.appName}</span>
    </div>
  )
}
