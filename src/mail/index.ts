// Public API of the mail module.

export type { MailDraft, MailInput, MailViolation, MailtoLink, Reporter } from './types'
export { daySuffix, formatCoord, formatHuDate, formatHuTime } from './format'
export { buildBody, buildMail, LABEL_WIDTH } from './template'
export { buildMailto, encodeAddress, encodeQueryValue, MAILTO_LIMIT } from './mailto'
export { downscaleToJpeg, downscaleToPng, photoFileName, PhotoDecodeError } from './photos'
export { copyImage, copyText, openMailto, saveFiles } from './handoff'
