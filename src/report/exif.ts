// Capture time from a photo's EXIF data (SPEC 4.3: "Időpont" defaults to the photo's
// timestamp). Read on the device with exifr; nothing is sent anywhere. The photo's GPS
// position is not used: Android removes it before a browser sees the file (D34).
import exifr from 'exifr'

const validDate = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000

/** Never throws: a photo without EXIF (or one exifr cannot read) gives null. */
export async function readPhotoTime(file: Blob): Promise<Date | null> {
  try {
    return timeFromExif(await exifr.parse(file, { tiff: true, exif: true, pick: ['DateTimeOriginal', 'CreateDate'] }))
  } catch {
    return null
  }
}

/** Pure part, unit-tested: exifr's output → capture time (camera's local wall-clock time). */
export function timeFromExif(out: Record<string, unknown> | undefined | null): Date | null {
  if (!out) return null
  if (validDate(out.DateTimeOriginal)) return out.DateTimeOriginal
  if (validDate(out.CreateDate)) return out.CreateDate
  return null
}

/** The first photo (in order) that has a capture time. */
export function firstTakenAt(times: (Date | null)[]): Date | null {
  return times.find((t): t is Date => t !== null) ?? null
}
