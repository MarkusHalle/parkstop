// Self-check for eml.js. Run: node public/spikes/mail/eml.test.mjs
import assert from 'node:assert/strict';
import { buildEml, sanitiseFilename } from './eml.js';

const subject = 'Szabálytalan parkolás bejelentése – ABC-123 – Pannónia utca 14. – őűŐŰ árvíztűrő tükörfúrógép';
const body = [
  'Tisztelt Hatóság!',
  '',
  'Helyszín: Budapest XIII., Pannónia utca 14.',
  'Megjegyzés: Babakocsival nem lehet elférni a járdán.',
  'Tisztelettel: Teszt Elek őű',
].join('\n');

// Fake attachment: 100 000 bytes with every byte value, to exercise chunked base64.
const att = new Uint8Array(100000);
for (let i = 0; i < att.length; i++) att[i] = (i * 7 + (i >> 8)) & 0xff;

const bytes = buildEml({
  to: 'teszt@example.com',
  subject,
  body,
  attachments: [{ filename: 'Fotó árvíztűrő 1.jpg', mimeType: 'image/jpeg', bytes: att }],
  unsent: true,
});
assert.ok(bytes instanceof Uint8Array, 'returns Uint8Array');
const text = Buffer.from(bytes).toString('latin1'); // output must be ASCII, latin1 keeps 1:1 bytes
assert.ok(/^[\x00-\x7f]*$/.test(text), 'whole message is ASCII');

// 1. starts with X-Unsent
assert.ok(text.startsWith('X-Unsent: 1\r\n'), 'starts with X-Unsent: 1 CRLF');

// 2. only CRLF line endings
assert.ok(!/(?<!\r)\n/.test(text), 'no bare LF');
assert.ok(!/\r(?!\n)/.test(text), 'no bare CR');

// 3. no line longer than 78 characters
const lines = text.split('\r\n');
const longest = Math.max(...lines.map((l) => l.length));
assert.ok(longest <= 78, `longest line is ${longest} chars`);

// header / body split
const sep = text.indexOf('\r\n\r\n');
const headerBlock = text.slice(0, sep);
const unfolded = headerBlock.replace(/\r\n[ \t]+/g, '');
assert.ok(!/^(From|Date|Message-ID):/mi.test(headerBlock), 'no From/Date/Message-ID');
assert.ok(/^To: teszt@example\.com$/m.test(unfolded), 'To header');
assert.ok(/^MIME-Version: 1\.0$/m.test(unfolded), 'MIME-Version header');
assert.deepEqual(headerBlock.split('\r\n').slice(0, 2)[1].startsWith('To:'), true, 'To is second line');

// 4. Subject decodes back
const subjLine = unfolded.split('\r\n').find((l) => l.startsWith('Subject: '));
assert.ok(subjLine, 'Subject header present');
const folded = headerBlock.split('\r\n');
const subjIdx = folded.findIndex((l) => l.startsWith('Subject: '));
const subjLinesRaw = [folded[subjIdx]];
for (let i = subjIdx + 1; i < folded.length && /^[ \t]/.test(folded[i]); i++) subjLinesRaw.push(folded[i]);
assert.ok(subjLinesRaw.length > 1, 'long subject is folded over several lines');
const words = unfolded.slice(unfolded.indexOf('Subject: ') + 9).split('\r\n')[0].match(/=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/g);
assert.ok(words && words.length > 1, 'several encoded words');
let decoded = '';
for (const w of words) {
  assert.ok(w.length <= 75, `encoded-word too long: ${w.length}`);
  const b = Buffer.from(w.slice(10, -2), 'base64');
  decoded += new TextDecoder('utf-8', { fatal: true }).decode(b); // throws if a UTF-8 char was split
}
assert.equal(decoded, subject, 'subject round-trips');

// body / attachment parts
const boundary = /boundary="([^"]+)"/.exec(headerBlock)[1];
const segs = text.slice(sep + 4).split('--' + boundary);
// segs: [preamble '', text part, attachment part, '--\r\n']
assert.equal(segs[0], '', 'no preamble');
assert.ok(segs[3].startsWith('--\r\n'), 'closing delimiter');
const [textHdr, textB64] = splitPart(segs[1]);
assert.ok(/Content-Type: text\/plain; charset=UTF-8/.test(textHdr));
assert.ok(/Content-Transfer-Encoding: base64/.test(textHdr));
assert.ok(textB64.split('\r\n').every((l) => l.length <= 76), 'text base64 lines <= 76');
const decodedBody = Buffer.from(textB64.replace(/\r\n/g, ''), 'base64').toString('utf8');
assert.equal(decodedBody.replace(/\r\n/g, '\n'), body, 'body round-trips');
assert.ok(decodedBody.includes('\r\n'), 'body uses CRLF');

const [attHdr, attB64] = splitPart(segs[2]);
assert.ok(/Content-Type: image\/jpeg; name="Foto_arvizturo_1\.jpg"/.test(attHdr), 'attachment content-type/name: ' + attHdr);
assert.ok(/Content-Disposition: attachment; filename="Foto_arvizturo_1\.jpg"/.test(attHdr), 'disposition');
assert.ok(attB64.split('\r\n').every((l) => l.length <= 76), 'attachment base64 lines <= 76');
const attBack = Buffer.from(attB64.replace(/\r\n/g, ''), 'base64');
assert.ok(Buffer.compare(attBack, Buffer.from(att)) === 0, 'attachment bytes round-trip');
assert.equal(attBack.length, att.length);

// unsent: false -> no X-Unsent; no attachments, no To
const plain = Buffer.from(buildEml({ subject: 'abc', body: 'x', attachments: [], unsent: false })).toString('latin1');
assert.ok(!plain.includes('X-Unsent'), 'no X-Unsent when unsent=false');
assert.ok(!/^To:/m.test(plain), 'no To header when empty');
assert.ok(/^Subject: abc\r\n/m.test(plain), 'plain ASCII subject left as is');

// huge attachment does not overflow the stack
const big = new Uint8Array(6 * 1024 * 1024).fill(0xab);
assert.doesNotThrow(() => buildEml({ subject: 's', body: 'b', attachments: [{ filename: 'big.bin', mimeType: 'application/octet-stream', bytes: big }] }));

assert.equal(sanitiseFilename('Fotó – ő.jpeg'), 'Foto_o.jpeg');

console.log(`OK: all eml.js checks passed (message ${bytes.length} bytes, ${lines.length} lines, longest line ${longest}, subject in ${words.length} encoded words)`);

function splitPart(seg) {
  // seg starts with CRLF after the boundary; headers end at the blank line
  const s = seg.replace(/^\r\n/, '');
  const i = s.indexOf('\r\n\r\n');
  return [s.slice(0, i), s.slice(i + 4)];
}
