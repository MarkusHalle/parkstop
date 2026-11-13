// Public API of the mail module.

export type { MailDraft, MailInput, MailViolation, MailtoLink, Reporter } from './types'
export { daySuffix, formatCoord, formatHuDate, formatHuTime } from './format'
export { buildBody, buildMail } from './template'
export { buildMailto, encodeAddress, encodeQueryValue, MAILTO_LIMIT } from './mailto'
export {
  downscaleToJpeg, downscaleToPng, formatBytes, MAIL_PHOTO_BUDGET_BYTES, photoFileName, PhotoDecodeError, reduceAll, REDUCE_STEPS,
} from './photos'
export { copyImage, copyText, openMailto, saveFiles } from './handoff'
