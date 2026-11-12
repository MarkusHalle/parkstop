// F-PLATE-9 as decided on the owner's 38 test photos (D38): each detected plate is read at
// several crop widths (pipeline CROP_MARGINS) and a read is offered only when at least two
// widths give the same characters, each confident and plausible, and no other confident,
// plausible read disagrees. Pure: no DOM, no worker.
//
// Measured on 46 detected plates: the single 6 %/10 % crop filled 39 right and 0 wrong; one
// wider crop alone filled 39 right but 1 wrong (a half-covered plate read as Latvian "S636"
// at 0.97); this rule fills 40 right and 0 wrong. It never invents characters: the result is
// always one of the reader's own reads (F-PLATE-5).
import { compactPlate, hungarianFormat } from '../report/plate'
import { FILL_THRESHOLD, HUNGARY_REGION, type ReadPlate } from './decide'

/**
 * Confident (every character ≥ FILL_THRESHOLD) and, for a Hungarian label, a Hungarian
 * format. `hungarianOnly` (plates found by the zoomed second search, D39): a Hungarian format
 * whatever the label, because there a half-hidden plate read as Finnish "SAM7" otherwise passed.
 */
export function plausible(r: ReadPlate, hungarianOnly = false): boolean {
  const compact = compactPlate(r.text)
  if (compact === '' || !(r.minConf >= FILL_THRESHOLD)) return false
  return (!hungarianOnly && r.region !== HUNGARY_REGION) || hungarianFormat(compact) !== null
}

export interface Consensus {
  /** Index into `reads` of the read to use (its text, region and crop). */
  index: number
  /** True when two or more widths agree; only then may the read be filled in. */
  agreed: boolean
}

/**
 * Picks the read for one detected plate. `reads[defaultIndex]` is the crop shown when no
 * width wins; null entries are crops that could not be made.
 */
export function chooseRead<R extends ReadPlate>(reads: readonly (R | null)[], defaultIndex: number, hungarianOnly = false): Consensus {
  const ok = reads.flatMap((r, i) => (r && plausible(r, hungarianOnly) ? [{ i, text: compactPlate(r.text), conf: r.minConf }] : []))
  const texts = new Set(ok.map((x) => x.text))
  if (texts.size === 1 && ok.length >= 2) {
    // Prefer the default crop when it is one of the agreeing reads, else the most certain one.
    const best = ok.find((x) => x.i === defaultIndex) ?? ok.reduce((a, b) => (b.conf > a.conf ? b : a))
    return { index: best.i, agreed: true }
  }
  if (reads[defaultIndex]) return { index: defaultIndex, agreed: false }
  const first = reads.findIndex((r) => r !== null)
  return { index: Math.max(0, first), agreed: false }
}

/**
 * The read handed to the decision rules: an agreed read as it is; otherwise the chosen read
 * with its confidence capped below the threshold, so it is shown (crop, "nem olvasható") but
 * never filled. A Hungarian-labelled read that fails the format keeps its confidence, so
 * the field can still say "Nem teljes a rendszám?" (F-PLATE-8).
 */
export function consensusRead<R extends ReadPlate>(reads: readonly (R | null)[], defaultIndex: number, hungarianOnly = false): R | null {
  const { index, agreed } = chooseRead(reads, defaultIndex, hungarianOnly)
  const r = reads[index]
  if (!r) return null
  if (agreed) return r
  const incomplete = r.region === HUNGARY_REGION && r.minConf >= FILL_THRESHOLD && compactPlate(r.text) !== '' && hungarianFormat(compactPlate(r.text)) === null
  if (incomplete) return r
  return { ...r, minConf: Math.min(r.minConf, FILL_THRESHOLD - 0.001) }
}
