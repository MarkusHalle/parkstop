// Roadmap 2.6, screen part: the finished e-mail with copy buttons, photo save/download,
// reduced photo copy and the mailto hand-off (SPEC 4.5, D13, D15). Same flow on phone and PC.
import { useMemo, useState } from 'react'
import { hu } from '../i18n/hu'
import { buildMail, buildMailto, copyImage, copyText, downscaleToPng, formatBytes, openMailto, saveFiles, type MailInput } from '../mail'
import type { PhotoItem } from '../report/photos'
import { IconCopy, IconDownload, IconImage, IconMail } from './icons'
import type { ReducedPhotos } from './useReducedPhotos'

interface Props {
  input: MailInput
  photos: PhotoItem[]
  reduced: ReducedPhotos
  layout: 'phone' | 'pc'
  /** Called after the mail app was opened; `bodyCopied` when F-MAIL-1 put the body on the clipboard. */
  onHandedOff: (bodyCopied: boolean | null) => void
}

type Flash = { key: string; text: string; tone: 'ok' | 'error'; n: number } | null

export function MailStep({ input, photos, reduced, layout, onHandedOff }: Props) {
  const draft = useMemo(() => buildMail(input), [input])
  const link = useMemo(() => buildMailto(draft), [draft])
  const [flash, setFlash] = useState<Flash>(null)
  const show = (key: string, ok: boolean, okText: string = hu.mail.copied, errText: string = hu.mail.copyFailed) =>
    setFlash((f) => ({ key, text: ok ? okText : errText, tone: ok ? 'ok' : 'error', n: (f?.n ?? 0) + 1 }))
  const copy = async (key: string, text: string) => show(key, await copyText(text))

  const savePhotos = async () => {
    if (reduced.status !== 'ready') return
    await saveFiles(reduced.files)
    show('photos', true, hu.mail.photosSaved(reduced.files.length))
  }
  const copyPhoto = async () => {
    const first = photos[0]
    if (!first) return
    // Hand the promise over at once so the tap still counts as a user gesture (Safari).
    let ok: boolean
    try { ok = await copyImage(downscaleToPng(first.file)) } catch { ok = false }
    show('photos', ok, hu.mail.copyPhotoDone, hu.mail.copyPhotoFailed)
  }
  const open = async () => {
    // F-MAIL-1: copy first, while the tap still counts as a user gesture.
    const bodyCopied = link.bodyInLink ? null : await copyText(draft.body)
    openMailto(link.href)
    onHandedOff(bodyCopied)
  }

  const flashFor = (key: string) =>
    flash?.key === key && <p className={`flash flash-${flash.tone}`} aria-hidden="true">{flash.text}</p>
  const photosLabel =
    reduced.status === 'working' ? hu.mail.photosPreparing
      : reduced.status === 'error' ? hu.mail.photosFailed
        : layout === 'phone' ? hu.mail.photosReadyPhone : hu.mail.photosReadyPc

  // Do not promise a filled body or recipient when the hand-off will not carry them.
  const phoneHint = link.bodyInLink
    ? (draft.to ? hu.mail.hintPhone : hu.mail.hintPhoneNoTo)
    : (draft.to ? hu.mail.hintPhoneLongBody : hu.mail.hintPhoneNoToLongBody)

  return (
    <div className="stack">
      {/* One live region, mounted from the start: a region inserted together with its text is
          often not read out, and a new child per message makes a repeated tap announce again. */}
      <p className="sr-only" role="status">{flash && <span key={flash.n}>{flash.text}</span>}</p>
      {!draft.to && <p className="notice notice-warn">{hu.mail.noEmail}</p>}
      {input.template === 'B' && <p className="notice notice-info">{hu.mail.policeNote}</p>}
      {!link.bodyInLink && <p className="notice notice-warn">{hu.mail.longBodyBefore}</p>}

      <section className="mail-part">
        <div className="mail-part-text">
          <span className="eyebrow">{hu.mail.to}</span>
          <span className="strong">{input.recipient.name}</span>
          <span className="break">{draft.to || '—'}</span>
        </div>
        {draft.to && (
          <button type="button" className="icon-btn" aria-label={hu.mail.copyTo} onClick={() => copy('to', draft.to)}><IconCopy /></button>
        )}
      </section>
      {flashFor('to')}

      <section className="mail-part">
        <div className="mail-part-text">
          <span className="eyebrow">{hu.mail.subject}</span>
          <span>{draft.subject}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={hu.mail.copySubject} onClick={() => copy('subject', draft.subject)}><IconCopy /></button>
      </section>
      {flashFor('subject')}

      <section className="mail-part mail-body">
        <div className="row-between">
          <span className="eyebrow">{hu.mail.body}</span>
          <button type="button" className="btn-link" aria-label={hu.mail.copyBody} onClick={() => copy('body', draft.body)}>{hu.mail.copy}</button>
        </div>
        <pre className="mail-text">{draft.body}</pre>
      </section>
      {flashFor('body')}
      <p className="muted small">{input.reporter ? hu.settings.signatureFromSettings : hu.mail.signatureHint}</p>

      <section className="mail-part mail-photos">
        <div className="mini-thumbs">
          {photos.map((p, i) => <img key={p.id} src={p.url} alt={hu.report.photoAlt(i + 1)} />)}
        </div>
        <div className="mail-part-text">
          <span className="strong">
            {reduced.status === 'ready' ? hu.mail.photosCountSize(reduced.files.length, formatBytes(reduced.totalBytes)) : hu.mail.photosCount(photos.length)}
          </span>
          <span className="muted small" aria-live="polite">{photosLabel}</span>
        </div>
      </section>
      {reduced.failed.length > 0 && <p className="notice notice-warn">{hu.mail.photosSomeFailed(reduced.failed.join(', '))}</p>}
      {flashFor('photos')}

      <div className="mail-actions">
        {layout === 'phone' ? (
          <>
            <div className="numbered-action">
              <span className="num">1</span>
              <button type="button" className="btn btn-secondary" disabled={reduced.status !== 'ready'} onClick={savePhotos}>
                <IconDownload />{hu.mail.savePhotos}
              </button>
            </div>
            <div className="numbered-action">
              <span className="num">2</span>
              <button type="button" className="btn btn-primary" onClick={open}><IconMail />{hu.mail.open}</button>
            </div>
            <p className="muted small center">{phoneHint}</p>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={open}><IconMail />{hu.mail.open}</button>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" disabled={reduced.status !== 'ready'} onClick={savePhotos}>
                <IconDownload />{hu.mail.downloadPhotos}
              </button>
              <button type="button" className="btn btn-secondary" disabled={photos.length === 0} onClick={copyPhoto}>
                <IconImage />{hu.mail.copyPhoto}
              </button>
            </div>
            <p className="muted small center">{hu.mail.hintPc}</p>
          </>
        )}
      </div>
    </div>
  )
}
