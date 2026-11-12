// Pure .eml (RFC 5322 / MIME) builder. No DOM, no dependencies; works in browsers and Node.
//
// buildEml({to, subject, body, attachments: [{filename, mimeType, bytes: Uint8Array}], unsent: boolean})
//   -> Uint8Array (all ASCII except a non-ASCII "To" value, if you pass one; the result is UTF-8 bytes)
//
// - CRLF line endings everywhere, no line longer than 78 characters (excluding CRLF).
// - "X-Unsent: 1" is the very first line when unsent is true (Outlook then opens it as an editable draft).
// - No From, Date or Message-ID headers. "To" is omitted when empty.
// - Subject: RFC 2047 encoded-words (UTF-8, B), folded with CRLF + space, never splitting a UTF-8 character.
// - Text part: text/plain; charset=UTF-8, base64, 76-char lines.
// - Attachments: base64, 76-char lines, ASCII-only sanitised filenames.

const CRLF = '\r\n';
const encoder = new TextEncoder();

// Base64 of a Uint8Array without blowing the stack: chunk size is a multiple of 3 so chunks concatenate cleanly.
export function bytesToBase64(bytes) {
  const CHUNK = 3 * 8192;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.subarray(i, i + CHUNK);
    let bin = '';
    const SUB = 0x2000;
    for (let j = 0; j < part.length; j += SUB) {
      bin += String.fromCharCode.apply(null, part.subarray(j, j + SUB));
    }
    out += btoa(bin);
  }
  return out;
}

export function wrap76(b64) {
  if (b64.length === 0) return '';
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF) + CRLF;
}

function normaliseNewlines(s) {
  return s.replace(/\r\n|\r|\n/g, CRLF);
}

function isPlainAscii(s) {
  return /^[\x20-\x7e]*$/.test(s);
}

// RFC 2047 encoding of a header value. `prefixLen` = length of "Name: " on the first line,
// so that no physical line exceeds 78 characters. Returns the value with CRLF+space folds.
export function encodeHeaderValue(value, prefixLen) {
  value = value.replace(/[\r\n]+/g, ' ');
  if (isPlainAscii(value) && prefixLen + value.length <= 76) return value;

  const overhead = '=?UTF-8?B?'.length + '?='.length; // 12
  // Budget for base64 characters per encoded-word: must be a multiple of 4, max 60 (-> word <= 72 chars),
  // and the first line (prefix + word) must stay within 78 characters.
  const b64Budget = Math.min(60, Math.floor((78 - prefixLen - overhead) / 4) * 4);
  const maxBytes = Math.floor(b64Budget / 4) * 3;

  const words = [];
  let cur = [];
  let curBytes = 0;
  const flush = () => {
    if (cur.length) {
      words.push('=?UTF-8?B?' + bytesToBase64(encoder.encode(cur.join(''))) + '?=');
      cur = []; curBytes = 0;
    }
  };
  for (const ch of Array.from(value)) { // iterates by code point: never splits a character
    const n = encoder.encode(ch).length;
    if (curBytes + n > maxBytes) flush();
    cur.push(ch);
    curBytes += n;
  }
  flush();
  return words.join(CRLF + ' ');
}

export function sanitiseFilename(name) {
  let s = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '');
  if (s.length > 30) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
    s = s.slice(0, 30 - ext.length) + ext;
  }
  return s || 'attachment';
}

function sanitiseMime(m) {
  return /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(m || '') ? m : 'application/octet-stream';
}

function makeBoundary(avoid) {
  const rnd = () => {
    const a = new Uint8Array(12);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(a);
    else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  };
  for (let i = 0; i < 20; i++) {
    const b = '=_PS_' + rnd();
    if (!avoid.includes(b)) return b;
  }
  throw new Error('could not find a unique MIME boundary');
}

export function buildEml({ to = '', subject = '', body = '', attachments = [], unsent = true } = {}) {
  const textB64 = wrap76(bytesToBase64(encoder.encode(normaliseNewlines(body))));

  const parts = attachments.map((a) => {
    const filename = sanitiseFilename(a.filename);
    return {
      filename,
      mimeType: sanitiseMime(a.mimeType),
      b64: wrap76(bytesToBase64(a.bytes)),
    };
  });

  // base64 text cannot contain "-" or "_", so a collision is practically impossible, but verify anyway.
  const toClean = String(to).replace(/[\r\n]+/g, ' ').trim();
  const subjectHeader = encodeHeaderValue(String(subject), 'Subject: '.length);
  const avoid = [textB64, subjectHeader, toClean, ...parts.map((p) => p.b64 + p.filename)].join('\n');
  const boundary = makeBoundary(avoid);

  const out = [];
  if (unsent) out.push('X-Unsent: 1');
  if (toClean) out.push('To: ' + toClean);
  out.push('Subject: ' + subjectHeader);
  out.push('MIME-Version: 1.0');
  out.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  out.push('');

  out.push('--' + boundary);
  out.push('Content-Type: text/plain; charset=UTF-8');
  out.push('Content-Transfer-Encoding: base64');
  out.push('');
  let head = out.join(CRLF) + CRLF;
  head += textB64;

  let tail = '';
  for (const p of parts) {
    tail += '--' + boundary + CRLF;
    tail += `Content-Type: ${p.mimeType}; name="${p.filename}"` + CRLF;
    tail += 'Content-Transfer-Encoding: base64' + CRLF;
    tail += `Content-Disposition: attachment; filename="${p.filename}"` + CRLF;
    tail += CRLF;
    tail += p.b64;
  }
  tail += '--' + boundary + '--' + CRLF;

  // Text part's base64 already ends with CRLF; MIME requires a CRLF before each delimiter, which that provides.
  return encoder.encode(head + tail);
}
