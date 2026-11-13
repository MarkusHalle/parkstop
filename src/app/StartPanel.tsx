// Step 1 before a pin exists: phone bottom sheet / PC side panel (mockups Main, DesktopStart).
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { hu } from '../i18n/hu'
import { IconCamera, IconImage, IconLocate } from './icons'

interface Props {
  layout: 'phone' | 'pc'
  photoCount: number
  onAddFiles: (files: File[]) => void
  onLocate: () => void
}

export function StartPanel({ layout, photoCount, onAddFiles, onLocate }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const pick = () => fileRef.current?.click()
  // A file dropped outside the dropzone would make the browser open it and leave the app,
  // losing the photos and pin not yet saved. Cancel such drops everywhere else.
  useEffect(() => {
    const isFileDrag = (e: globalThis.DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const inZone = (e: globalThis.DragEvent) => e.target instanceof Element && e.target.closest('.dropzone') !== null
    const over = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      if (!inZone(e) && e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    const drop = (e: globalThis.DragEvent) => { if (isFileDrag(e)) e.preventDefault() }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])
  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" multiple hidden
      onChange={(e) => { onAddFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
  )
  // Android's multi-photo picker has no camera option, so the camera gets its own input
  // (capture opens the rear camera directly; one photo per shot).
  const cameraInput = (
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
      onChange={(e) => { onAddFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
  )
  const added = photoCount > 0 && <p className="notice notice-ok" role="status">{hu.start.photoAdded(photoCount)}</p>

  if (layout === 'phone') {
    return (
      <div className="stack">
        <h1 className="title">{hu.start.title}</h1>
        <p className="lead">{hu.start.introPhone}</p>
        {added}
        {/* Camera and gallery side by side, pictograms only (owner); names for screen readers. */}
        <div className="photo-pair">
          <button type="button" className="btn btn-primary" onClick={() => cameraRef.current?.click()}
            aria-label={hu.start.takePhoto} title={hu.start.takePhoto}><IconCamera size={26} /></button>
          <button type="button" className="btn btn-secondary" onClick={pick}
            aria-label={hu.start.fromGallery} title={hu.start.fromGallery}><IconImage /></button>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onLocate}><IconLocate />{hu.start.locate}</button>
        {fileInput}
        {cameraInput}
      </div>
    )
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    onAddFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || f.type === ''))
  }
  return (
    <div className="stack stack-lg">
      <div className="stack-sm">
        <h1 className="title title-lg">{hu.start.title}</h1>
        <p className="lead">{hu.start.introPc}</p>
      </div>
      <div className={`dropzone${dragging ? ' dropzone-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <span className="dropzone-icon"><IconCamera size={32} /></span>
        <span className="strong">{hu.start.dropPhotos}</span>
        <span className="muted small">{hu.start.dropHint}</span>
        <button type="button" className="btn btn-primary btn-small" onClick={pick}>{hu.start.choosePhotos}</button>
        {fileInput}
      </div>
      {added}
      <button type="button" className="btn btn-secondary" onClick={onLocate}><IconLocate />{hu.start.locate}</button>
      <section className="stack-sm">
        <h2 className="field-label">{hu.start.howTitle}</h2>
        <ol className="numbered">
          {hu.start.how.map((t, i) => <li key={t}><span className="num">{i + 1}</span><span>{t}</span></li>)}
        </ol>
      </section>
    </div>
  )
}
