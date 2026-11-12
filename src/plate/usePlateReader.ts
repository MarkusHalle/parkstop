// React side of the plate reader: reads each photo of the report once (results are kept per
// photo id), drops a removed photo's results, and combines everything with decide().
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PhotoItem } from '../report/photos'
import { getReaderSnapshot, ReaderRetryError, readPhoto, subscribeReader, type ReaderStatus } from './client'
import { decide, type Outcome, type PhotoRead, type ReadPlate } from './decide'

/** A part of a photo in fractions of its width and height (0…1). */
export interface FocusBox {
  x: number
  y: number
  w: number
  h: number
}

export interface UiPlate extends ReadPlate {
  meanConf: number
  regionConf: number | null
  detScore: number
  /** Object URL of the crop JPEG, or null. */
  cropUrl: string | null
  /** Where the crop is on the photo, for the zoomable view. */
  focus: FocusBox
}

export interface PlateReaderState {
  /** The setting is on and there is at least one photo. */
  active: boolean
  status: ReaderStatus
  progress: { loaded: number; total: number } | null
  /** For announcing the first download at its start and end only. */
  download: 'none' | 'running' | 'done'
  outcome: Outcome<UiPlate>
}

const NONE: Outcome<UiPlate> = { kind: 'none' }

/** F-PLATE-1: nothing is loaded until `enabled` (the user opted in) and a photo exists. */
export function usePlateReader(photos: PhotoItem[], enabled: boolean): PlateReaderState {
  const snap = useSyncExternalStore(subscribeReader, getReaderSnapshot, getReaderSnapshot)
  const [results, setResults] = useState<ReadonlyMap<string, PhotoRead<UiPlate>>>(() => new Map())
  const started = useRef(new Set<string>())
  const urls = useRef(new Map<string, string[]>())

  useEffect(() => {
    const ids = new Set(photos.map((p) => p.id))
    for (const [id, list] of urls.current) {
      if (!ids.has(id)) { list.forEach((u) => URL.revokeObjectURL(u)); urls.current.delete(id) }
    }
    for (const id of started.current) if (!ids.has(id)) started.current.delete(id)
    const begin = enabled ? photos.filter((p) => !started.current.has(p.id)) : []
    // Drop the results of removed photos; photos read (again) show as pending.
    setResults((m) => {
      const stale = [...m.keys()].some((id) => !ids.has(id))
      if (!stale && begin.every((p) => m.get(p.id)?.status !== 'failed')) return m
      const next = new Map([...m].filter(([id]) => ids.has(id)))
      for (const p of begin) next.delete(p.id)
      return next
    })
    for (const p of begin) {
      started.current.add(p.id)
      const id = p.id
      readPhoto(p.file).then(
        (out) => {
          const plates: UiPlate[] = out.plates.map((pl) => ({
            text: pl.text, minConf: pl.minConf, meanConf: pl.meanConf, region: pl.region, regionConf: pl.regionConf,
            detScore: pl.detScore,
            cropUrl: pl.cropImage ? URL.createObjectURL(pl.cropImage) : null,
            focus: { x: pl.crop.x / out.width, y: pl.crop.y / out.height, w: pl.crop.w / out.width, h: pl.crop.h / out.height },
          }))
          const made = plates.flatMap((x) => (x.cropUrl ? [x.cropUrl] : []))
          if (!started.current.has(id)) { made.forEach((u) => URL.revokeObjectURL(u)); return } // removed meanwhile
          urls.current.set(id, made)
          setResults((m) => new Map(m).set(id, { status: 'done', plates }))
        },
        (e: unknown) => {
          if (!started.current.has(id)) return
          // Download trouble: read this photo again when the next photo is added.
          if (e instanceof ReaderRetryError) started.current.delete(id)
          setResults((m) => new Map(m).set(id, { status: 'failed' }))
        },
      )
    }
  }, [photos, enabled])

  const active = enabled && photos.length > 0
  const outcome = useMemo(
    () => (active ? decide(photos.map((p) => ({ id: p.id, read: results.get(p.id) }))) : NONE),
    [active, photos, results],
  )
  const status: ReaderStatus = active && snap.status === 'idle' ? 'loading' : snap.status
  return { active, status, progress: snap.progress, download: snap.download, outcome }
}
