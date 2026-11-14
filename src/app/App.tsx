// Roadmap 2.1: app shell. Phone: full-screen map with a bottom sheet, full pages for the
// form and e-mail; PC (≥ 900 px): side panel beside the map (SPEC 3, 9; approved mockups).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
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
import { useStepSwipe } from './useStepSwipe'
import { useSheetMorph } from './useSheetMorph'
import './app.css'

type Step = 'map' | 'report' | 'mail' | 'done' | SideStep
type SideStep = 'history' | 'settings' | 'help' | 'privacy'
type Resolve = (ll: LatLon, opts: ResolveOptions) => Resolution
const STEP_NO: Record<Step, number> = { map: 1, report: 2, mail: 3, done: 3, history: 0, settings: 0, help: 0, privacy: 0 }
const isSide = (s: Step): s is SideStep => s === 'history' || s === 'settings' || s === 'help' || s === 'privacy'
const REOPEN_KEY = 'parkstop-reopen-after-update'
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
  // A handed report is a record of what went to the mail app: the first change after the
  // hand-off continues in a new draft and leaves that record untouched (D47). Set further down.
  const forkIfHanded = useRef<() => void>(() => {})

  // A search or "Saját helyzetem" on the map beside a PC side page (Settings, Help…) sets the
  // place, so it brings step 1 back into view.
  const stepRef = useRef(step)
  useLayoutEffect(() => { stepRef.current = step })
  const onPinChange = useCallback((ll: LatLon, source: PinSource) => {
    if (isSide(stepRef.current)) { history.replaceState({ step: 'map' }, ''); setStep('map') }
    forkIfHanded.current()
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
  // Latest photo list and time source, for async work that must not read render-time values.
  const photosRef = useRef<PhotoItem[]>([])
  const timeSourceRef = useRef(timeSource)
  useLayoutEffect(() => {
    photosRef.current = photos
    timeSourceRef.current = timeSource
  })
  const setTimeSourceNow = useCallback((s: 'none' | 'now' | 'photo' | 'user') => {
    timeSourceRef.current = s
    setTimeSource(s)
  }, [])
  // Batches run one after the other, so the 5-photo cap and the time rule see the result of the
  // previous batch (a second pick during a slow decode would otherwise exceed 5 photos).
  const addQueue = useRef<Promise<void>>(Promise.resolve())
  const addBatch = useCallback(async (files: File[]) => {
    const res = await addPhotos(photosRef.current.length, files)
    photosRef.current = [...photosRef.current, ...res.added]
    setPhotos(photosRef.current)
    setPhotoMessages([
      ...res.unreadable.map((n) => hu.report.photoUnreadable(n)),
      ...(res.overLimit > 0 ? [hu.report.tooMany(5)] : []),
    ])
    // SPEC 4.3: the time defaults to the photo's capture time (EXIF, read on the device).
    // The photo's position is not used: Android removes it before a browser sees the file (D34).
    const takenAt = firstTakenAt(await Promise.all(res.added.map((p) => readPhotoTime(p.file))))
    if (takenAt && timeSourceRef.current !== 'user') {
      setForm((f) => ({ ...f, time: toLocalDateTime(takenAt) }))
      setTimeSourceNow('photo')
    }
  }, [setTimeSourceNow])
  const onAddFiles = useCallback((files: File[]) => {
    if (files.length === 0) return Promise.resolve()
    forkIfHanded.current()
    const run = addQueue.current.then(() => addBatch(files))
    addQueue.current = run.catch(() => undefined)
    return run
  }, [addBatch])
  const onRemovePhoto = (id: string) => {
    forkIfHanded.current()
    const gone = photosRef.current.find((p) => p.id === id)
    if (gone) releasePhoto(gone)
    const rest = photosRef.current.filter((p) => p.id !== id)
    photosRef.current = rest
    setPhotos(rest)
    setPhotoMessages([])
    // The time came from the removed photo: take it from a remaining one, else use now.
    if (gone && timeSourceRef.current === 'photo') {
      void Promise.all(rest.map((p) => readPhotoTime(p.file))).then((times) => {
        if (timeSourceRef.current !== 'photo') return
        const takenAt = firstTakenAt(times)
        setForm((f) => ({ ...f, time: toLocalDateTime(takenAt ?? new Date()) }))
        setTimeSourceNow(takenAt ? 'photo' : 'now')
      })
    }
  }
  const onMovePhoto = (id: string, dir: -1 | 1) => {
    forkIfHanded.current()
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
    forkIfHanded.current()
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
      setTimeSourceNow('now')
    }
    go('report')
  }
  // Marks the missing fields and brings the first one into view. A swipe does not focus it,
  // so the phone's keyboard does not pop up (owner: "resist and point").
  const pointToErrors = (focus: boolean) => {
    setShowErrors(true)
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-field="${ERROR_FIELD[errors[0]]}"] :is(input:not([type=hidden]):not([hidden]), select, textarea, button)`,
      )
      if (focus) el?.focus()
      el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
  }
  const toMail = () => {
    if (errors.length > 0) { pointToErrors(true); return }
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
  const handoffRef = useRef(handoff)
  useLayoutEffect(() => { handoffRef.current = handoff })
  useLayoutEffect(() => {
    forkIfHanded.current = () => {
      if (!handoffRef.current) return
      handoffRef.current = null
      setHandoff(null)
      setCurrent({ id: newReportId(), createdAt: Date.now() })
      showToast(hu.history.forked)
    }
  })
  const saveNow = useCallback((): Promise<void> => {
    const r = snapshot.current()
    return r ? saveReport(r).catch(() => showToast(hu.history.saveError)) : Promise.resolve()
  }, [showToast])
  // "Frissítés" reloads the page: save the open report first and reopen it after the reload.
  const beforeUpdate = useCallback(async () => {
    const r = snapshot.current()
    await saveNow()
    if (r) { try { sessionStorage.setItem(REOPEN_KEY, r.id) } catch { /* storage blocked */ } }
  }, [saveNow])
  // Save on every step change, photo change and hand-off, and when the page is hidden (the
  // phone switches to the mail app); typing alone does not rewrite the photos each time.
  useEffect(() => {
    if (step === 'report' || step === 'mail' || step === 'done') saveNow()
  }, [step, photos, handoff, current, saveNow])
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void saveNow() }
    const onPageHide = () => void saveNow()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide) }
  }, [saveNow])

  const clearReport = () => {
    photos.forEach(releasePhoto)
    setPhotos([]); setPhotoMessages([]); setForm(emptyForm()); setShowErrors(false)
    setPin(null); setManualAddress(null); setSearchHit(null); setChosenId(null); setHandoff(null)
    photosRef.current = []
    setTimeSourceNow('none'); setSheetOpen(true); setCurrent(null)
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
    const restored = r.photos.map((p) => photoFromBlob(p.name, p.type, p.blob))
    photosRef.current = restored
    setPhotos(restored)
    setPhotoMessages([]); setShowErrors(false)
    setForm({ ...emptyForm(), ...r.form }); setTimeSourceNow(r.timeSource)
    setPin(r.pin); setSearchHit(null); setManualAddress(r.address || null); setChosenId(r.recipientId)
    setCurrent({ id: r.id, createdAt: r.createdAt })
    setHandoff(r.handedAt ? { at: new Date(r.handedAt), bodyCopied: null } : null)
    if (!r.form.time) { setForm((f) => ({ ...f, time: toLocalDateTime(new Date()) })); setTimeSourceNow('now') }
    go(r.status === 'handed' && r.photos.length > 0 ? 'mail' : 'report')
    if (message) showToast(message)
  }
  // After an update reload, reopen the report that was open (see beforeUpdate).
  const reopened = useRef(false)
  useEffect(() => {
    if (reopened.current) return
    reopened.current = true
    let id: string | null = null
    try { id = sessionStorage.getItem(REOPEN_KEY); sessionStorage.removeItem(REOPEN_KEY) } catch { /* storage blocked */ }
    if (id) void openReport(id)
    // Runs once on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
  // The guard above only changes what is shown. Bring the step in line, so a stale step left
  // by Back cannot send the next pin straight to the form (the authority step and the saving
  // of the report would be skipped). Not before the resolver has loaded: a report opened from
  // the history sets its pin first.
  const stale = view === 'map' && (step === 'report' || step === 'mail' || step === 'done') && (resolver !== null || resolverError)
  useEffect(() => {
    if (!stale) return
    history.replaceState({ step: 'map' }, '')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keeps the step in line with the view
    setStep('map')
  }, [stale])

  // The step before this one, for the step bar and screen animations (forward or back).
  // React's "information from previous renders" pattern: compared and stored during render.
  const stepNow = STEP_NO[view]
  const [stepSeen, setStepSeen] = useState({ now: stepNow, from: stepNow })
  if (stepSeen.now !== stepNow) setStepSeen({ now: stepNow, from: stepSeen.now })
  const stepFrom = stepSeen.now !== stepNow ? stepSeen.now : stepSeen.from
  // The view before this one: a page that follows another page keeps its (opaque) frame and
  // only slides its content, so nothing behind it shows through during the change.
  const [viewSeen, setViewSeen] = useState({ now: view, from: view })
  if (viewSeen.now !== view) setViewSeen({ now: view, from: viewSeen.now })
  const viewFrom = viewSeen.now !== view ? viewSeen.now : viewSeen.from
  const pageSwap = viewFrom === 'map' || viewFrom === view ? null
    : viewFrom === 'privacy' || (!isSide(view) && !isSide(viewFrom) && stepNow < STEP_NO[viewFrom]) ? 'back' : 'fwd'
  // The page frame now outlives a step change, so start each page at the top.
  const pageRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { pageRef.current?.scrollTo(0, 0) }, [view])

  // --- Phone bottom sheet height → map padding -------------------------------------------
  const sheetRef = useRef<HTMLElement>(null)
  const [sheetH, setSheetH] = useState(0)
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) { setSheetH(0); return }
    // While the sheet folds or opens its height changes every frame. Re-rendering the whole
    // app per frame made the fold stutter, so the map's overlays follow through the CSS
    // variable directly and React state (map padding) catches up once the height settles.
    let settle = 0
    // Content changes (start panel → authority card, a notice appearing) resize the sheet in
    // one frame. Animate that from the old height to the new one (owner: "make the changes in
    // the sheet smooth"); the fold has its own transition and is left alone.
    let lastH = el.getBoundingClientRect().height
    let grow: Animation | null = null
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const folding = () => el.hasAttribute('data-morph')
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height
      document.querySelector<HTMLElement>('.ps-map')?.style.setProperty('--ps-inset', `${h}px`)
      const ours = grow?.playState === 'running'
      if (!ours && Math.abs(h - lastH) > 4 && !folding() && !reduced.matches) {
        grow = el.animate([{ height: `${lastH}px` }, { height: `${h}px` }], { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
        setSheetH(h) // the map eases along at once instead of after the sheet
      }
      if (!ours) lastH = h
      window.clearTimeout(settle)
      settle = window.setTimeout(() => setSheetH(h), 120)
    })
    ro.observe(el)
    return () => { ro.disconnect(); window.clearTimeout(settle); grow?.cancel() }
  }, [layout, view])

  // The fold itself (owner's option A with a morph, roadmap 6.14): a spring-driven morph of the
  // card into the folded summary; it hands the map the end height as soon as a fold starts.
  const sheetMorph = useSheetMorph(sheetRef, sheetOpen, layout === 'phone', setSheetH)

  // --- Swipe between the steps (phone; owner, roadmap 6.7) --------------------------------
  // Left: the next step, when it may open (otherwise the screen resists and the missing fields
  // are marked). Right: the step before. Step 1 swipes on its sheet, steps 2 and 3 on the page.
  const peekFwdRef = useRef<HTMLDivElement>(null)
  const peekBackRef = useRef<HTMLDivElement>(null)
  useStepSwipe({
    enabled: layout === 'phone' && (view === 'map' || view === 'report' || view === 'mail'),
    forward: view === 'map' ? { allowed: !!resolved && !!recipient, go: startReport, onBlocked: () => {} }
      : view === 'report' ? { allowed: errors.length === 0, go: toMail, onBlocked: () => pointToErrors(false) }
      : null,
    back: view === 'report' || view === 'mail' ? { go: back } : null,
  }, { target: view === 'map' ? sheetRef : pageRef, peekForward: peekFwdRef, peekBack: peekBackRef, reveal: sheetRef }, view)

  const [historyCount, setHistoryCount] = useState<number | null>(null)

  // --- Step content ----------------------------------------------------------------------
  const changeAddress = (a: string) => { forkIfHanded.current(); setManualAddress(a) }
  const authorityCard = (
    <AuthorityCard resolution={resolution} loadError={resolverError} address={address} addressStatus={addressStatus}
      onAddressChange={changeAddress} selectedId={recipient?.id ?? null} onSelect={(id) => { forkIfHanded.current(); setChosenId(id) }}
      onMovePin={() => { forkIfHanded.current(); setPin(null); setManualAddress(null) }} />
  )
  const start = (
    <>
      <StartPanel layout={layout} photoCount={photos.length} onAddFiles={onAddFiles} onLocate={() => setLocateRequest((n) => n + 1)} />
      {photoMessages.map((m) => <p key={m} className="field-error" role="alert">{m}</p>)}
    </>
  )
  const summary = resolved && recipient && (
    <section className="summary">
      <span className="summary-icon"><IconPin /></span>
      <div className="summary-text">
        <AddressField address={address} status={addressStatus} districtRoman={resolved.districtRoman} onChange={changeAddress}
          forceEdit={address.trim() === ''} invalid={showErrors && errors.includes('address')} />
        <div className="summary-recipient">
          <span className="muted small">{recipient.name}</span>
          {recipient.id === resolved.primary.id && <ConfidenceChip value={resolved.confidence} />}
        </div>
      </div>
    </section>
  )

  // Step 1's sheet content is built for every view: on the phone the sheet stays mounted under
  // the full pages, so a step change never shows the bare map (owner: "the map shows for a split
  // second between steps") and the map keeps its padding instead of panning on every change.
  // Keyed by what the sheet shows, so a switch (start → loading → card) fades the new content in.
  const mapBody = <div className="sheet-content" key={pin ? `pin-${resolution?.kind ?? (resolverError ? 'error' : 'loading')}` : 'start'}>{pin ? authorityCard : start}</div>
  const mapFooter = resolved ? <button type="button" className="btn btn-primary" onClick={startReport}>{hu.authority.continue}</button> : null
  let body: ReactNode
  let footer: ReactNode = null
  if (view === 'map') {
    body = mapBody
    footer = mapFooter
  } else if (view === 'report') {
    body = (
      <div className="stack">
        <div data-field="address">{summary}</div>
        {timeSource === "photo" && <p className="notice notice-ok" role="status"><IconCheck size={16} />{hu.report.filledTime}</p>}
        <ReportForm form={form} timeFromPhoto={timeSource === 'photo'}
          onChange={(p) => { forkIfHanded.current(); if (p.time !== undefined) setTimeSourceNow('user'); setForm((f) => ({ ...f, ...p })) }}
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
      locateRequest={locateRequest} onOpenHistory={() => openSide('history')} pinLocked={view !== 'map'} />
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
      // In this order: on the phone the sheet stays mounted (inert) under the pages.
      const h = ['.page-header h1', '.side-header h1', 'main h1', '.panel h1', '.sheet:not([inert]) h1']
        .map((s) => document.querySelector<HTMLElement>(s)).find((e) => e !== null)
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
        {/* Steps 2 and 3 lock the map (a stray click would move the pin). Beside a side page
            (Settings, Help, History) it can be looked around, but the pin stays put (owner:
            after a theme switch the map looked frozen). */}
        <div className="map-area" inert={view !== 'map' && !isSide(view)}>{map}</div>
        {toastEl}
        <UpdatePrompt onBeforeUpdate={beforeUpdate} />
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
      <section className={`sheet${sheetOpen ? '' : ' is-folded'}`} ref={sheetRef} aria-label={hu.steps.where} inert={view !== 'map'} aria-hidden={view !== 'map' || undefined} onKeyDown={(e) => {
          // Escape folds the sheet (not while typing in a field: there it belongs to the field).
          if (e.key !== 'Escape' || !sheetOpen || e.defaultPrevented) return
          if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
          setSheetOpen(false)
          requestAnimationFrame(() => document.querySelector<HTMLElement>('.sheet-peek')?.focus())
        }}>
          <SheetHandle open={sheetOpen} onChange={setSheetOpen} morph={sheetMorph} />
          {/* Both parts stay mounted; useSheetMorph morphs the card into the summary. */}
          <div className="sheet-stage">
            <div className="sheet-body" inert={!sheetOpen}>{mapBody}</div>
            <div className="sheet-fold-peek" inert={sheetOpen}>
              {/* Folded summary (owner's option A): label and confidence, the recipient, the place. */}
              <button type="button" className={`sheet-peek${pin && resolved && recipient ? '' : ' sheet-peek--title'}`} onClick={() => setSheetOpen(true)}>
                <span className="sheet-peek-text">
                  {pin && resolved && recipient ? (
                    <>
                      <span className="sheet-peek-top">
                        <span className="eyebrow">{hu.authority.heading}</span>
                        {recipient.id === resolved.primary.id && <ConfidenceChip value={resolved.confidence} />}
                      </span>
                      <span className="sheet-peek-name">{recipient.name}</span>
                      {address.trim() !== '' && (
                        <span className="sheet-peek-sub">
                          {address.trim()}{resolved.districtRoman ? `, ${hu.mailTemplate.district(resolved.districtRoman)}` : ''}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="sheet-peek-name">
                      {pin ? (resolution?.kind === 'outside' ? hu.authority.outsideTitle : hu.authority.loading) : hu.start.title}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
          {mapFooter && <div className="sheet-footer">{mapFooter}</div>}
        </section>
      {view !== 'map' && (
        // One frame for all pages: it slides in over the sheet when it opens from step 1; between
        // pages it stays put and opaque, and only the content below the header slides.
        <div className="page page-in-fwd" ref={pageRef}>
          <header className="page-header">
            {view !== 'done' && <button type="button" className="icon-btn" aria-label={hu.nav.back} onClick={back}><IconBack /></button>}
            {view === 'done' ? <span className="page-title">{title}</span> : <h1 className="page-title">{title}</h1>}
            {stepped && <span className="muted small">{hu.steps.progress(STEP_NO[view], 3)}</span>}
            {sideMeta && <span className="muted small">{sideMeta}</span>}
          </header>
          {stepped && (
            <div className="progress" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <span key={i} className={
                  i <= stepNow ? (i === stepNow && stepFrom < stepNow ? 'on grow' : 'on') : (i <= stepFrom ? 'shrink' : '')
                } />
              ))}
            </div>
          )}
          <main className={`page-body${pageSwap ? ` page-swap-${pageSwap}` : ''}`} key={view}>{body}</main>
          {footer && <div className="page-footer">{footer}</div>}
        </div>
      )}
      {/* What a swipe pulls in: the next (or previous) step's header, its content follows on release. */}
      {(view === 'map' || view === 'report') && <PeekHeader ref={peekFwdRef} title={view === 'map' ? hu.report.title : hu.mail.title}
        n={STEP_NO[view] + 1} filled={stepNow} />}
      {view === 'mail' && <PeekHeader ref={peekBackRef} title={hu.report.title} n={2} filled={stepNow} />}
      {toastEl}
      <UpdatePrompt onBeforeUpdate={beforeUpdate} />
    </div>
  )
}

/** A step's header and step bar, shown beside the screen while it is swiped (useStepSwipe). */
function PeekHeader({ ref, title, n, filled }: { ref: Ref<HTMLDivElement>; title: string; n: number; filled: number }) {
  return (
    <div className="page-peek" ref={ref} aria-hidden="true" inert>
      <header className="page-header">
        <span className="icon-btn"><IconBack /></span>
        <span className="page-title">{title}</span>
        <span className="muted small">{hu.steps.progress(n, 3)}</span>
      </header>
      <div className="progress">{[1, 2, 3].map((i) => <span key={i} className={i <= filled ? 'on' : ''} />)}</div>
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
