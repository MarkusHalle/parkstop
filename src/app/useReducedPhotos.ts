// Reduced JPEG copies of the report photos for the e-mail (F-PHOTO-2), made once per set of
// photos and kept for "Fotók mentése" on the mail and done screens. The set is kept within
// the e-mail size budget (reduceAll). A photo that fails to reduce is reported by name; the
// others carry on (F-PHOTO-3).
import { useEffect, useState } from 'react'
import { downscaleToJpeg, photoFileName, reduceAll } from '../mail'
import type { PhotoItem } from '../report/photos'

export interface ReducedPhotos {
  status: 'idle' | 'working' | 'ready' | 'error'
  files: { blob: Blob; name: string }[]
  /** Original names of photos that could not be reduced. */
  failed: string[]
  totalBytes: number
}

const EMPTY = { files: [], failed: [], totalBytes: 0 }

export function useReducedPhotos(active: boolean, photos: PhotoItem[], plate: string, observedAt: Date | null): ReducedPhotos {
  const [state, setState] = useState<ReducedPhotos & { key: string }>({ status: 'idle', ...EMPTY, key: '' })
  const key = `${photos.map((p) => p.id).join(',')}|${plate}|${observedAt?.getTime() ?? ''}`

  useEffect(() => {
    if (!active || photos.length === 0 || !observedAt) return
    let cancelled = false
    // Reset when the photo set changes; the effect owns this state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'working', ...EMPTY, key })
    ;(async () => {
      const res = await reduceAll(photos.map((p) => p.file), (f, s) => downscaleToJpeg(f, s.maxEdge, s.quality))
      const ok = photos.flatMap((p, i) => (res.blobs[i] ? [{ blob: res.blobs[i]!, p }] : []))
      const files = ok.map(({ blob }, i) => ({ blob, name: photoFileName(plate, observedAt, i, ok.length) }))
      const failed = photos.filter((_, i) => !res.blobs[i]).map((p) => p.file.name)
      if (!cancelled) setState({ status: files.length > 0 ? 'ready' : 'error', files, failed, totalBytes: res.totalBytes, key })
    })()
    return () => { cancelled = true }
    // key captures photos, plate and time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])

  return state.key === key ? state : { status: active ? 'working' : 'idle', ...EMPTY }
}
