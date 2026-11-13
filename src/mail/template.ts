// E-mail draft builder, templates A and B of SPEC 7 (D20). Pure: all prose comes from
// hu.mailTemplate.

import { hu } from '../i18n/hu'
import { formatCoord, formatHuDate, formatHuTime } from './format'
import type { MailDraft, MailInput, MailViolation, Reporter } from './types'

const t = hu.mailTemplate

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\r\n?/g, '\n').trim()
}

/**
 * "Label: value" with one space. No padded label column: mail apps use proportional fonts,
 * where the padding looked like stray double spaces (owner, after the M5 release). Further
 * lines of a multi-line value follow as they are.
 */
function blockLine(label: string, value: string): string {
  const lines = value.split('\n').map((l) => l.trimEnd())
  return `${label} ${lines.join('\n')}`
}

function violationText(v: MailViolation): string {
  if (v.kind === 'custom') return clean(v.text)
  const sentence = clean(v.sentence)
  const ref = clean(v.legalRef)
  if (!ref) return sentence
  return `${sentence.replace(/\.$/, '')} (${ref}).`
}

function reporterLines(r: Reporter | undefined): string[] {
  if (!r) return []
  const out: string[] = []
  const name = clean(r.name)
  const address = clean(r.address)
  const contact = [clean(r.email), clean(r.phone)].filter(Boolean).join(', ')
  if (name) out.push(name)
  if (address) out.push(address)
  if (contact) out.push(contact)
  return out
}

export function buildBody(input: MailInput): string {
  const observed = t.observed(formatHuDate(input.observedAt), formatHuTime(input.observedAt))
  const intro = input.template === 'B' ? `${t.reportB} ${observed}` : observed

  const district = input.districtRoman ? ` (${t.district(input.districtRoman)})` : ''
  const place = `${clean(input.address)}${district}, ${t.gps(formatCoord(input.lat), formatCoord(input.lon))}`

  const block = [blockLine(t.labelPlace, place), blockLine(t.labelPlate, clean(input.plate))]
  const vehicle = clean(input.vehicle)
  if (vehicle) block.push(blockLine(t.labelVehicle, vehicle))
  block.push(blockLine(t.labelViolation, violationText(input.violation)))
  const note = clean(input.note)
  if (note) block.push(blockLine(t.labelNote, note))

  const closing = input.template === 'B' ? t.closingB(input.photoCount) : t.closingA(input.photoCount)

  // A blank line between the fields as well, so the block reads easily on a phone.
  return [
    t.greeting(clean(input.recipient.name)),
    '',
    intro,
    '',
    ...block.flatMap((line, i) => (i === 0 ? [line] : ['', line])),
    '',
    closing,
    '',
    t.signoff,
    ...reporterLines(input.reporter),
  ].join('\n')
}

export function buildMail(input: MailInput): MailDraft {
  const plate = clean(input.plate)
  const address = clean(input.address)
  return {
    to: clean(input.recipient.email),
    subject: input.template === 'B' ? t.subjectB(plate, address) : t.subjectA(plate, address),
    body: buildBody(input),
  }
}
