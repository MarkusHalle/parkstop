// Contract of the history module (SPEC 4.7, F-PHOTO-4; roadmap 3.3). Reports and their
// photos live only in this device's IndexedDB.
import type { LatLon } from '../authority/types'
import type { FormState } from '../report/ReportForm'

/** SPEC 4.7: "piszkozat" until handed to the mail app, then "átadva" (F-MAIL-3). */
export type ReportStatus = 'draft' | 'handed'

export interface StoredPhoto {
  name: string
  type: string
  /** The original file as the user added it (never modified). */
  blob: Blob
}

export interface StoredReport {
  id: string
  /** ms since epoch */
  createdAt: number
  updatedAt: number
  status: ReportStatus
  /** When "Megnyitás a levelezőben" was pressed (ms), else null. */
  handedAt: number | null
  pin: LatLon | null
  /** Address as shown in the e-mail. */
  address: string
  /** True when the user typed or edited the address (do not overwrite with a lookup). */
  addressEdited: boolean
  /** Chosen recipient (authority id), null = the resolver's primary. */
  recipientId: string | null
  /** Display only (the list), so the list works without the resolver. */
  recipientName: string
  districtRoman: string | null
  form: FormState
  timeSource: 'none' | 'now' | 'photo' | 'user'
  photos: StoredPhoto[]
}

/** What the list shows; no photo blobs, so the list stays light. */
export interface ReportSummary {
  id: string
  updatedAt: number
  createdAt: number
  status: ReportStatus
  handedAt: number | null
  plate: string
  address: string
  violationId: string
  /** The user's own text for "Egyéb". */
  customText: string
  recipientName: string
  /** Observation time from the form ("YYYY-MM-DDTHH:mm"), may be ''. */
  time: string
  photoCount: number
}
