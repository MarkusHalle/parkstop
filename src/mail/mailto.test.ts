import { describe, expect, it } from 'vitest'
import { buildMailto, encodeAddress, MAILTO_LIMIT } from './mailto'
import { buildMail } from './template'
import type { MailDraft } from './types'

const draft: MailDraft = {
  to: 'kozterulet@example.hu',
  subject: 'Szabálytalan parkolás bejelentése – ABC-123 – Pannónia utca 14.',
  body: 'Tisztelt Hatóság!\n\nŐrült hűtő áll a járdán: ő, ű, á, Ő, Ű.\nTisztelettel:',
}

function params(href: string): URLSearchParams {
  return new URLSearchParams(href.slice(href.indexOf('?') + 1))
}

describe('buildMailto', () => {
  it('builds mailto:<to>?subject=…&body=… with CRLF line breaks', () => {
    const l = buildMailto(draft)
    expect(l.bodyInLink).toBe(true)
    expect(l.href.startsWith('mailto:kozterulet@example.hu?subject=')).toBe(true)
    expect(l.href).toContain('%0D%0A%0D%0A')
    expect(l.href).not.toMatch(/[\s\u0080-￿]/)
    // Spaces must be %20, not "+" (mail programs show "+" literally).
    expect(l.href).not.toContain('+')
    const p = params(l.href)
    expect(p.get('subject')).toBe(draft.subject)
    expect(p.get('body')).toBe(draft.body.replace(/\n/g, '\r\n'))
    expect(decodeURIComponent(l.href.split('&body=')[1])).toBe(draft.body.replace(/\n/g, '\r\n'))
  })

  it('round-trips Hungarian letters', () => {
    const l = buildMailto(draft)
    expect(decodeURIComponent(l.href.split('&body=')[1])).toContain('ő, ű, á, Ő, Ű')
    expect(l.href).toContain('%C5%91') // ő
    expect(l.href).toContain('%C5%B1') // ű
    expect(l.href).toContain('%C3%A1') // á
  })

  it('existing CRLF is not doubled', () => {
    const l = buildMailto({ ...draft, body: 'a\r\nb' })
    expect(l.href.endsWith('&body=a%0D%0Ab')).toBe(true)
  })

  it('empty recipient gives mailto:?subject=', () => {
    expect(buildMailto({ ...draft, to: '' }).href.startsWith('mailto:?subject=')).toBe(true)
  })

  it('falls back to recipient and subject above the limit', () => {
    const long = { ...draft, body: 'x'.repeat(MAILTO_LIMIT) }
    const l = buildMailto(long)
    expect(l.bodyInLink).toBe(false)
    expect(l.href).not.toContain('body=')
    expect(params(l.href).get('subject')).toBe(draft.subject)
    expect(l.href.startsWith('mailto:kozterulet@example.hu?subject=')).toBe(true)
  })

  it('limit boundary: equal to limit keeps the body, one more drops it', () => {
    const full = buildMailto(draft, 100000).href
    expect(buildMailto(draft, full.length)).toEqual({ href: full, bodyInLink: true })
    expect(buildMailto(draft, full.length - 1).bodyInLink).toBe(false)
  })
})

describe('encodeAddress', () => {
  it('leaves ordinary addresses alone', () => {
    expect(encodeAddress('ugyfelszolgalat.kozterulet@bp13.hu')).toBe('ugyfelszolgalat.kozterulet@bp13.hu')
    expect(encodeAddress("a.b+c_d-e~f!g$h'i(j)k*l@x.hu")).toBe("a.b+c_d-e~f!g$h'i(j)k*l@x.hu")
  })
  it('encodes characters that would break the URI', () => {
    expect(encodeAddress('a?b@x.hu')).toBe('a%3Fb@x.hu')
    expect(encodeAddress('a&b@x.hu')).toBe('a%26b@x.hu')
    expect(encodeAddress('a%b@x.hu')).toBe('a%25b@x.hu')
    expect(encodeAddress('a b@x.hu')).toBe('a%20b@x.hu')
    expect(encodeAddress('ő@x.hu')).toBe('%C5%91@x.hu')
  })
})

describe('realistic href length (report to main session)', () => {
  it('template A, jarda, vehicle, 41-char note, full reporter', () => {
    const note = 'Babakocsival nem lehet elférni a járdán!!' // 41 characters
    expect(note.length).toBe(41)
    const d = buildMail({
      template: 'A',
      recipient: { name: 'Budapest Főváros XIII. Kerületi Önkormányzat Közterület-felügyelet', email: 'kozteruletfelugyelet@bp13.hu' },
      plate: 'ABC-123',
      address: 'Pannónia utca 14.',
      districtRoman: 'XIII',
      lat: 47.518812,
      lon: 19.051734,
      observedAt: new Date(2026, 10, 11, 8, 42),
      violation: {
        kind: 'listed',
        sentence:
          'A jármű a járdán várakozott ott, ahol ezt jelzőtábla vagy útburkolati jel nem engedte meg, illetve úgy, hogy a gyalogosok számára nem maradt 1,5 méter szabad hely.',
        legalRef: 'KRESZ 40. § (8)',
      },
      vehicle: 'szürke Opel Astra',
      note,
      photoCount: 2,
      reporter: { name: 'Kovács Erzsébet', address: '1137 Budapest, Szent István körút 18. 3. em. 2.', email: 'kovacs.erzsebet@example.com', phone: '+36 30 123 4567' },
    })
    const full = buildMailto(d, Infinity)
    // Close to the old 1 800 limit (D29); a little shorter since the label column padding went.
    expect(full.href.length).toBeGreaterThan(1600)
    // A typical full report keeps its body in the link with the default limit.
    expect(buildMailto(d).bodyInLink).toBe(true)
  })
})

describe('buildMailto: special characters (review 2.6)', () => {
  it('round-trips & # + % ? = in subject and body', () => {
    const d: MailDraft = { to: 'a@b.hu', subject: 'A & B #1 + 50% ? x=y', body: 'Sor 1 & 2\n#3 + 4% ? a=b' }
    const p = params(buildMailto(d).href)
    expect(p.get('subject')).toBe(d.subject)
    expect(p.get('body')).toBe('Sor 1 & 2\r\n#3 + 4% ? a=b')
  })

  it('does not throw on a lone surrogate (half an emoji)', () => {
    const d: MailDraft = { to: 'a@b.hu', subject: 'x', body: 'macska \uD83D vége' }
    expect(() => buildMailto(d)).not.toThrow()
    expect(params(buildMailto(d).href).get('body')).toBe('macska \uFFFD vége')
  })
})
