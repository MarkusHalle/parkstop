// E-mail draft builder, templates A and B of SPEC 7 (D20). Pure: all prose comes from
// hu.mailTemplate.

import { hu } from '../i18n/hu'
import { formatCoord, formatHuDate, formatHuTime } from './format'
import type { MailDraft, MailInput, MailViolation, Reporter } from './types'

/** Width of the label column in the Helyszín … Megjegyzés block. */
export const LABEL_WIDTH = 17

const t = hu.mailTemplate

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\r\n?/g, '\n').trim()
}

/** "Label:" padded to the label column, then the value; continuation lines are indented. */
function blockLine(label: string, value: string): string {
  const indent = ' '.repeat(LABEL_WIDTH)
  const lines = value.split('\n').map((l) => l.trimEnd())
  return label.padEnd(LABEL_WIDTH, ' ') + lines.map((l, i) => (i === 0 || l === '' ? l : indent + l)).join('\n')
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

  return [
    t.greeting(clean(input.recipient.name)),
    '',
    intro,
    '',
    ...block,
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
