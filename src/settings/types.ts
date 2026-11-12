// Contract of the settings module (SPEC 4.6, 4.9 F-PLATE-6; roadmap 3.4). Stored in
// localStorage on this device only.

export interface Profile {
  name: string
  address: string
  email: string
  phone: string
}

/** 'ask' until the user answers the one-time offer on the first photo (D17, F-PLATE-6). */
export type PlateReaderChoice = 'ask' | 'on' | 'off'

export interface Settings {
  profile: Profile
  /** Reverse lookup and address search through Nominatim (F-MAP-4). Default on. */
  addressLookup: boolean
  plateReader: PlateReaderChoice
}
