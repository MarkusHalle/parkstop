// After the hand-off (mockup Done, F-MAIL-3): checklist, never claims the mail was sent.
import { hu } from '../i18n/hu'
import { saveFiles } from '../mail'
import { shortDateTime } from './format'
import { IconCheck, IconDownload } from './icons'
import type { ReducedPhotos } from './useReducedPhotos'

interface Props {
  layout: 'phone' | 'pc'
  handedAt: Date
  bodyCopied: boolean | null
  reduced: ReducedPhotos
  onNew: () => void
  onBack: () => void
}

export function DoneStep({ layout, handedAt, bodyCopied, reduced, onNew, onBack }: Props) {
  return (
    <div className="stack">
      <div className="done-mark"><IconCheck size={28} /></div>
      <h1 className="title">{hu.done.title}</h1>
      <p className="muted small">{hu.done.handedAt(shortDateTime(handedAt))}</p>
      {bodyCopied === true && <p className="notice notice-warn">{hu.mail.longBody}</p>}
      {bodyCopied === false && <p className="notice notice-error">{hu.mail.longBodyCopyFailed}</p>}
      <p className="lead">{hu.done.intro}</p>
      <ol className="numbered">
        <li>
          <span className="num">1</span>
          <span className="stack-sm">
            <span>{layout === 'phone' ? hu.done.step1Phone : hu.done.step1Pc}</span>
            <button type="button" className="btn btn-secondary btn-small" disabled={reduced.status !== 'ready'}
              onClick={() => saveFiles(reduced.files)}>
              <IconDownload />{layout === 'phone' ? hu.done.saveAgain : hu.mail.downloadPhotos}
            </button>
          </span>
        </li>
        <li><span className="num">2</span><span>{hu.done.step2}</span></li>
        <li><span className="num">3</span><span>{hu.done.step3}</span></li>
      </ol>
      <p className="muted small">{hu.done.disclaimer}</p>
      <div className="stack-sm">
        <button type="button" className="btn btn-primary" onClick={onNew}>{hu.done.newReport}</button>
        <button type="button" className="btn btn-secondary" onClick={onBack}>{hu.done.backToMail}</button>
      </div>
    </div>
  )
}
