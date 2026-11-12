// Contract of the mail module (SPEC 4.5, 7, D13, D15, roadmap 2.6).

export interface Reporter {
  name?: string
  address?: string
  email?: string
  phone?: string
}

export type MailViolation =
  | { kind: 'listed'; sentence: string; legalRef: string | null }
  | { kind: 'custom'; text: string }

export interface MailInput {
  /** A = enforcement body (bejelentés), B = police station (szabálysértési feljelentés). */
  template: 'A' | 'B'
  recipient: { name: string; email: string | null }
  /** Already normalised by the form (upper case, Hungarian formats hyphenated). */
  plate: string
  /** Street address as the user confirmed it, e.g. "Pannónia utca 14." */
  address: string
  /** Roman numeral of the district, e.g. "XIII"; null on Margit-sziget. */
  districtRoman: string | null
  lat: number
  lon: number
  /** Local wall-clock time of the observation. */
  observedAt: Date
  violation: MailViolation
  vehicle?: string
  note?: string
  photoCount: number
  reporter?: Reporter
}

export interface MailDraft {
  to: string
  subject: string
  body: string
}

export interface MailtoLink {
  href: string
  /** False when the body was left out because the link would exceed the limit (F-MAIL-1). */
  bodyInLink: boolean
}
