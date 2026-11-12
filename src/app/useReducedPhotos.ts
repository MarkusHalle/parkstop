// Reduced JPEG copies of the report photos for the e-mail (F-PHOTO-2), made once per set of
// photos and kept for "Fotók mentése" on the mail and done screens. A photo that fails to
// reduce is reported by name; the others carry on (F-PHOTO-3).
import { useEffect, useState } from 'react'
import { downscaleToJpeg, photoFileName } from '../mail'
import type { PhotoItem } from '../report/photos'

export interface ReducedPhotos {
  status: 'idle' | 'working' | 'ready' | 'error'
  files: { blob: Blob; name: string }[]
  /** Original names of photos that could not be reduced. */
  failed: string[]
}

export function useReducedPhotos(active: boolean, photos: PhotoItem[], plate: string, observedAt: Date | null): ReducedPhotos {
  const [state, setState] = useState<ReducedPhotos & { key: string }>({ status: 'idle', files: [], failed: [], key: '' })
  const key = `${photos.map((p) => p.id).join(',')}|${plate}|${observedAt?.getTime() ?? ''}`

  useEffect(() => {
    if (!active || photos.length === 0 || !observedAt) return
    let cancelled = false
    // Reset when the photo set changes; the effect owns this state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'working', files: [], failed: [], key })
    ;(async () => {
      const files: ReducedPhotos['files'] = []
      const failed: string[] = []
      for (const [i, p] of photos.entries()) {
        try {
          files.push({ blob: await downscaleToJpeg(p.file), name: photoFileName(plate, observedAt, i, photos.length) })
        } catch {
          failed.push(p.file.name)
        }
      }
      if (!cancelled) setState({ status: files.length > 0 ? 'ready' : 'error', files, failed, key })
    })()
    return () => { cancelled = true }
    // key captures photos, plate and time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])

  return state.key === key ? state : { status: active ? 'working' : 'idle', files: [], failed: [] }
}
