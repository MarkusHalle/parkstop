// Decision rules for plate-reader results (SPEC 4.9 F-PLATE-2, -3, -4, -5, -8). Pure: no
// DOM, no worker, no React. The UI turns the outcome into one of the field's states.
import { compactPlate, hungarianFormat, normalizePlate, type PlateSource, type PlateVia } from '../report/plate'

export type { PlateSource, PlateVia }

/** F-PLATE-4: a read is filled in only when every character is at least this certain. */
export const FILL_THRESHOLD = 0.9
/** The reader's region label for Hungarian plates (public/models/cct_v2_global_plate_config.json). */
export const HUNGARY_REGION = 'Hungary'

/** What the decision needs from one read plate; the caller may carry more (crop, box). */
export interface ReadPlate {
  text: string
  minConf: number
  region: string | null
}

export type PhotoRead<P extends ReadPlate> =
  | { status: 'pending' }
  | { status: 'done'; plates: P[] }
  | { status: 'failed' }

/**
 * ok: confident and plausible, may be suggested. low: below the threshold or empty.
 * incomplete: labelled Hungarian but matching no Hungarian format (F-PLATE-8), never filled.
 */
export type Verdict = 'ok' | 'low' | 'incomplete'

export interface Judged {
  verdict: Verdict
  /** Display value for an ok read (separators added, characters unchanged), else null. */
  value: string | null
}

export function judgePlate(p: ReadPlate): Judged {
  const compact = compactPlate(p.text)
  if (compact === '' || !(p.minConf >= FILL_THRESHOLD)) return { verdict: 'low', value: null }
  if (p.region === HUNGARY_REGION && !hungarianFormat(compact)) return { verdict: 'incomplete', value: null }
  return { verdict: 'ok', value: formatRead(p.text, p.region) }
}

/**
 * F-PLATE-5: upper case, and Hungarian separators only for a read labelled Hungarian (or
 * without a region label). Foreign reads pass through unchanged. The reader's alphabet has
 * no spaces or hyphens, so the characters are exactly the read ones.
 */
export function formatRead(text: string, region: string | null): string {
  const compact = compactPlate(text)
  if (region !== null && region !== HUNGARY_REGION) return compact
  return normalizePlate(compact).value
}

export interface PlateOption<P extends ReadPlate> {
  /** Stable while the photo stays: "<photoId>#<plate index>". */
  key: string
  photoId: string
  /** 0-based position of the photo in the report. */
  photoIndex: number
  plate: P
  verdict: Verdict
  value: string | null
}

export type Outcome<P extends ReadPlate> =
  /** No photo to read. */
  | { kind: 'none' }
  /** At least one photo is still being read. */
  | { kind: 'working' }
  /** Exactly one plausible plate in the whole report: fill it in, marked "ellenőrizd". */
  | { kind: 'suggest'; option: PlateOption<P> }
  /** Several plates: the user picks (F-PLATE-2); options without a value show only the crop. */
  | { kind: 'pick'; options: PlateOption<P>[] }
  /**
   * Nothing plausible: nothing is filled in (F-PLATE-4). `options` are the crops that were
   * found (may be empty: show the zoomable photo); `incomplete` when a Hungarian read failed
   * the format check (F-PLATE-8, "Nem teljes a rendszám?").
   */
  | { kind: 'manual'; options: PlateOption<P>[]; incomplete: boolean }

/**
 * Combine the reads of every photo in the report (in photo order).
 *
 * - Plausible reads are de-duplicated by their characters: the same car on three photos is
 *   one suggestion.
 * - A photo with two or more detected plates always leads to the picker, listing all of
 *   them, even when only one was read confidently: the app never picks a car on its own.
 * - An unclear read from a photo with a single plate next to a plausible read from another
 *   photo also leads to the picker (it may be a different car), unless its characters equal
 *   the plausible read.
 * - Failed photos count as photos without plates.
 */
export function decide<P extends ReadPlate>(photos: readonly { id: string; read: PhotoRead<P> | undefined }[]): Outcome<P> {
  if (photos.length === 0) return { kind: 'none' }
  if (photos.some((p) => !p.read || p.read.status === 'pending')) return { kind: 'working' }

  const plausible: PlateOption<P>[] = []
  const seen = new Set<string>()
  const unclearMulti: PlateOption<P>[] = []
  const unclearSingle: PlateOption<P>[] = []
  let multi = false

  photos.forEach((ph, photoIndex) => {
    if (ph.read?.status !== 'done') return
    const plates = ph.read.plates
    if (plates.length >= 2) multi = true
    plates.forEach((plate, i) => {
      const j = judgePlate(plate)
      const option: PlateOption<P> = { key: `${ph.id}#${i}`, photoId: ph.id, photoIndex, plate, verdict: j.verdict, value: j.value }
      if (j.verdict === 'ok' && j.value !== null) {
        const c = compactPlate(j.value)
        if (seen.has(c)) return
        seen.add(c)
        plausible.push(option)
      } else if (plates.length >= 2) {
        unclearMulti.push(option)
      } else {
        unclearSingle.push(option)
      }
    })
  })

  const otherSingles = unclearSingle.filter((o) => compactPlate(o.plate.text) === '' || !seen.has(compactPlate(o.plate.text)))
  if (multi || plausible.length >= 2 || (plausible.length === 1 && otherSingles.length > 0)) {
    return { kind: 'pick', options: [...plausible, ...unclearMulti, ...(plausible.length > 0 ? otherSingles : [])] }
  }
  if (plausible.length === 1) return { kind: 'suggest', option: plausible[0] }
  const unclear = [...unclearMulti, ...unclearSingle]
  return { kind: 'manual', options: unclear, incomplete: unclear.some((o) => o.verdict === 'incomplete') }
}

/** The plausible option whose value equals `value` (ignoring separators), if any. */
export function optionWithValue<P extends ReadPlate>(outcome: Outcome<P>, value: string): PlateOption<P> | null {
  const c = compactPlate(value)
  if (c === '') return null
  const options = outcome.kind === 'suggest' ? [outcome.option] : outcome.kind === 'pick' ? outcome.options : []
  return options.find((o) => o.value !== null && compactPlate(o.value) === c) ?? null
}

// ---------------------------------------------------------------------------------------
// The "Rendszám" field and the reader (F-PLATE-3).

export interface FieldSituation<P extends ReadPlate> {
  plate: string
  source: PlateSource
  /** For source 'reader': how it got there (missing in older drafts). */
  via?: PlateVia
  /** The user has typed in this report's plate field (also emptying it): never auto-fill again. */
  typed?: boolean
  outcome: Outcome<P>
  /** The setting is on. Off: unconfirmed suggestions are withdrawn. */
  readerOn: boolean
  /** The reader cannot run on this device: keep what is there, change nothing. */
  readerFailed: boolean
}

export type FieldAction =
  | { type: 'none' }
  | { type: 'fill'; value: string; key: string }
  | { type: 'clear' }

/**
 * What to do with the field after the reader's outcome or the setting changed.
 * Never touches a value the user typed or confirmed; fills an empty field only if the user
 * has not typed in it in this report; withdraws an unconfirmed suggestion when its photo is
 * gone, when several plates now compete (unless the user picked it), or when the reader is
 * switched off.
 */
export function reconcileField<P extends ReadPlate>(s: FieldSituation<P>): FieldAction {
  if (s.readerFailed) return { type: 'none' }
  if (s.source === 'confirmed') return { type: 'none' }
  if (s.source === 'user') {
    if (!s.readerOn || s.typed || s.plate.trim() !== '' || s.outcome.kind !== 'suggest') return { type: 'none' }
    const o = s.outcome.option
    if (o.value === null) return { type: 'none' }
    return { type: 'fill', value: o.value, key: o.key }
  }
  // source === 'reader'
  if (!s.readerOn) return { type: 'clear' }
  if (s.outcome.kind === 'working') return { type: 'none' }
  if (!optionWithValue(s.outcome, s.plate)) return { type: 'clear' }
  if (s.outcome.kind === 'pick' && s.via !== 'pick') return { type: 'clear' }
  return { type: 'none' }
}
