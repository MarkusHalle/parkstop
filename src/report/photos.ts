// Photos attached to the report (SPEC 4.3, F-PHOTO-3). Originals stay untouched in memory;
// the reduced copies for the e-mail are made by src/mail/photos.ts at the e-mail step.

export const MAX_PHOTOS = 5

export interface PhotoItem {
  id: string
  file: File
  /** Object URL for the thumbnail; revoke with releasePhoto. */
  url: string
}

export interface AddPhotosResult {
  added: PhotoItem[]
  /** File names the browser could not decode (HEIC on some devices, camera RAW). */
  unreadable: string[]
  /** Files left out because the limit was reached. */
  overLimit: number
}

let seq = 0

const DECODE_TIMEOUT_MS = 8000

/**
 * Can the browser show this file? createImageBitmap first (works off-screen), then an <img>
 * with a time limit: img.decode() may never settle in a hidden page, and a stalled check
 * must not swallow the photo.
 */
async function decodes(file: File, url: string): Promise<boolean> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      const ok = bmp.width > 0
      bmp.close()
      return ok
    } catch {
      // Fall through to <img>: some formats decode there but not as a bitmap.
    }
  }
  const img = new Image()
  img.src = url
  try {
    const ok = await Promise.race([
      img.decode().then(() => img.naturalWidth > 0),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(img.naturalWidth > 0), DECODE_TIMEOUT_MS)),
    ])
    return ok
  } catch {
    return false
  }
}

/** Checks each file can be shown by the browser and keeps at most MAX_PHOTOS in total. */
export async function addPhotos(existingCount: number, files: Iterable<File>): Promise<AddPhotosResult> {
  const result: AddPhotosResult = { added: [], unreadable: [], overLimit: 0 }
  for (const file of files) {
    if (existingCount + result.added.length >= MAX_PHOTOS) {
      result.overLimit++
      continue
    }
    const url = URL.createObjectURL(file)
    if (await decodes(file, url)) result.added.push({ id: `p${++seq}`, file, url })
    else {
      URL.revokeObjectURL(url)
      result.unreadable.push(file.name)
    }
  }
  return result
}

export function releasePhoto(p: PhotoItem): void {
  URL.revokeObjectURL(p.url)
}
