// mailto: link builder per RFC 6068, with the F-MAIL-1 length fallback. Pure.

import type { MailDraft, MailtoLink } from './types'

/**
 * Default maximum href length before the body is left out (F-MAIL-1). Raised from 1 800 to
 * 4 000 by the owner (D29): Hungarian accents take 6 characters each once encoded, so a
 * typical report with reporter details is ~1 830; a 2 634-character link worked on the PC.
 */
export const MAILTO_LIMIT = 4000

// Characters RFC 6068 allows unencoded in the "to" part: unreserved + some-delims.
const ADDR_SAFE = /^[A-Za-z0-9\-._~!$'()*+,;:@]$/

/**
 * Replaces lone UTF-16 surrogates (half an emoji, e.g. from a cut paste) with U+FFFD:
 * encodeURIComponent throws URIError on them (review 2.6, finding 6).
 */
export function wellFormed(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
}

/** Percent-encodes an address only where RFC 6068 requires it. */
export function encodeAddress(addr: string): string {
  let out = ''
  for (const ch of wellFormed(addr)) out += ADDR_SAFE.test(ch) ? ch : encodeURIComponent(ch)
  return out
}

/** Query value: UTF-8 percent-encoding, line breaks as %0D%0A. */
export function encodeQueryValue(s: string): string {
  return encodeURIComponent(wellFormed(s).replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'))
}

export function buildMailto(draft: MailDraft, limit: number = MAILTO_LIMIT): MailtoLink {
  const base = `mailto:${encodeAddress(draft.to)}?subject=${encodeQueryValue(draft.subject)}`
  const full = `${base}&body=${encodeQueryValue(draft.body)}`
  if (full.length <= limit) return { href: full, bodyInLink: true }
  return { href: base, bodyInLink: false }
}
