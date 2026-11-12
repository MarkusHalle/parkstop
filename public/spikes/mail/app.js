import {
  $, SAMPLE_SUBJECT, SAMPLE_BODY, SAMPLE_BODY_SHORT, SAMPLE_NOTE, makeLogger, errText,
  renderEnv, lsGet, lsSet, setupPhotoPicker, fmtSize, renderToCanvas, canvasToBlob,
} from './common.js';
import { buildEml, sanitiseFilename } from './eml.js';
import { createWizard, h } from './wizard.js';

const logger = makeLogger($('log'));
const log = logger.log;

const envText = renderEnv($('env'), {
  'navigator.clipboard.write': !!(navigator.clipboard && navigator.clipboard.write),
  'ClipboardItem': typeof ClipboardItem !== 'undefined',
  'ClipboardItem.supports("image/png")': typeof ClipboardItem !== 'undefined' && typeof ClipboardItem.supports === 'function'
    ? ClipboardItem.supports('image/png') : 'n/a',
  'createImageBitmap': typeof createImageBitmap === 'function',
  'Blob / URL.createObjectURL': typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function',
  'a[download] supported': 'download' in document.createElement('a'),
});
$('subj').textContent = SAMPLE_SUBJECT;
$('bodyview').textContent = SAMPLE_BODY;
$('clearlog').addEventListener('click', () => logger.clear());

// ---------- recipient (stored on this device only) ----------
const RECIPIENT_KEY = 'parkstop-spike-recipient';
const recipient = () => lsGet(RECIPIENT_KEY, '').trim();
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ---------- mailto ----------
function mailtoUrl(to, subject, body) {
  return 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@')
    + '?subject=' + encodeURIComponent(subject)
    + '&body=' + encodeURIComponent(body.replace(/\n/g, '\r\n'));
}

const END_MARKER = '--- VÉGE ---';
// Over-long: full body, then the note repeated until the encoded URL is clearly beyond 2 500 chars.
function makeLongBody(to) {
  let body = SAMPLE_BODY + '\n\nMegjegyzés (ismétlés a hosszú teszthez):';
  let n = 0;
  while (mailtoUrl(to, SAMPLE_SUBJECT, body).length <= 2600) {
    n += 1;
    body += `\n${n}. ${SAMPLE_NOTE}`;
  }
  body += '\n' + END_MARKER;
  return body;
}

const bodyFor = (n) => (n === 1 ? SAMPLE_BODY_SHORT : n === 2 ? SAMPLE_BODY : makeLongBody(recipient()));

function updateLengths() {
  const to = recipient();
  for (const k of [1, 2, 3]) {
    const body = bodyFor(k);
    $('len' + k).textContent = `Test ${k}: body ${body.length} chars; encoded mailto URL length: ${mailtoUrl(to, SAMPLE_SUBJECT, body).length}`;
  }
}

function openMailto(n) {
  const to = recipient();
  const body = bodyFor(n);
  const url = mailtoUrl(to, SAMPLE_SUBJECT, body);
  log(`Test ${n}: mailto URL length ${url.length} (body ${body.length} chars, to ${to ? 'set' : 'EMPTY'}). Opening via <a> click.`);
  if (body.endsWith(END_MARKER)) log(`Test ${n}: the last line of the body should read "${END_MARKER}".`);
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  return Promise.resolve({ status: 'ok', detail: `mailto link opened via <a> click, URL length ${url.length}, body ${body.length} chars` });
}

// ---------- photos ----------
let photos = [];
let busy = false;
let wiz = null;
setupPhotoPicker({
  inputs: [$('pick')],
  downscaleBox: $('scale'),
  thumbsEl: $('thumbs'),
  log,
  onState: (p, b) => { photos = p; busy = b; if (wiz) wiz.update(); },
});
const hasPhoto = () => photos.length > 0 && !busy;

function photoFilename(i, p) {
  if (p.file !== p.original) return `parkstop-foto-${i + 1}.jpg`;
  const m = /\.[A-Za-z0-9]{1,5}$/.exec(p.original.name || '');
  return `parkstop-foto-${i + 1}${m ? m[0].toLowerCase() : '.jpg'}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- .eml ----------
async function downloadEml(unsent) {
  const name = unsent ? 'Test 4' : 'Test 5';
  try {
    if (busy) { log(`${name}: photos are still being processed.`); return { status: 'failed', detail: 'photos still being processed' }; }
    const attachments = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      attachments.push({
        filename: sanitiseFilename(photoFilename(i, p)),
        mimeType: p.file.type || 'application/octet-stream',
        bytes: new Uint8Array(await p.file.arrayBuffer()),
      });
    }
    const to = recipient();
    const bytes = buildEml({ to, subject: SAMPLE_SUBJECT, body: SAMPLE_BODY, attachments, unsent });
    const filename = unsent ? 'parkstop-teszt-4.eml' : 'parkstop-teszt-5.eml';
    downloadBlob(new Blob([bytes], { type: 'message/rfc822' }), filename);
    const detail = `${filename} generated, ${fmtSize(bytes.length)}, ${attachments.length} attachment(s), X-Unsent ${unsent ? 'ON' : 'off'}, To ${to ? 'set' : 'EMPTY'}`;
    log(`${name}: ${detail}.`);
    return { status: 'ok', detail };
  } catch (e) {
    log(`${name}: FAILED ${errText(e)}`);
    return { status: 'failed', detail: errText(e) };
  }
}

// ---------- clipboard image ----------
function copyPhotoToClipboard() {
  if (!photos.length) return Promise.resolve({ status: 'failed', detail: 'no photo' });
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
    log('Test 6: ClipboardItem / navigator.clipboard.write not available here.');
    return Promise.resolve({ status: 'unsupported', detail: 'ClipboardItem or navigator.clipboard.write not available' });
  }
  const src = photos[0].original;
  // Hand a Promise to ClipboardItem so that clipboard.write() is called synchronously inside the click.
  const pngPromise = renderToCanvas(src, $('scale').checked ? 2000 : 0).then((c) => canvasToBlob(c, 'image/png'));
  let item;
  try {
    item = new ClipboardItem({ 'image/png': pngPromise });
  } catch (e) {
    log(`Test 6: new ClipboardItem threw ${errText(e)}`);
    return Promise.resolve({ status: 'unsupported', detail: 'new ClipboardItem threw ' + errText(e) });
  }
  return navigator.clipboard.write([item]).then(
    async () => {
      const b = await pngPromise.catch(() => null);
      log(`Test 6: clipboard.write RESOLVED (PNG ${b ? fmtSize(b.size) : '?'}). Now paste with Ctrl+V into an open draft.`);
      return { status: 'ok', detail: `clipboard.write resolved, PNG ${b ? fmtSize(b.size) : '?'}` };
    },
    (e) => {
      log(`Test 6: clipboard.write REJECTED: ${errText(e)}`);
      return { status: 'failed', detail: 'clipboard.write rejected: ' + errText(e) };
    },
  );
}

// ---------- photo downloads ----------
function downloadPhotos() {
  const list = photos.slice();
  log(`Test 7: starting ${list.length} download(s), 500 ms apart.`);
  // The first download is triggered synchronously (inside the click); the rest follow after a short pause.
  return (async () => {
    for (let i = 0; i < list.length; i++) {
      const filename = photoFilename(i, list[i]);
      downloadBlob(list[i].file, filename);
      log(`Test 7: download ${i + 1}/${list.length} triggered: ${filename} (${fmtSize(list[i].file.size)})`);
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 500));
    }
    return { status: 'ok', detail: `${list.length} download(s) triggered` };
  })();
}

// ---------- setup step ----------
function buildSetup(api) {
  const email = h('input', { type: 'email', id: 'setup-email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
  email.value = lsGet(RECIPIENT_KEY, '');
  email.addEventListener('input', () => { lsSet(RECIPIENT_KEY, email.value.trim()); updateLengths(); api.update(); });

  const photoArea = h('div');
  let url = null;
  const el = h('div', {},
    h('label', { class: 'lbl', for: 'setup-email', text: 'Type your own e-mail address' }),
    h('p', { class: 'hint', text: 'It is only used to fill in the test e-mails. It stays on this computer.' }),
    email,
    h('p', { class: 'lbl', text: 'Choose a photo — any photo will do' }),
    h('button', { type: 'button', class: 'primary', text: 'Choose a photo', onclick: () => $('pick').click() }),
    photoArea,
  );

  function showPhoto() {
    if (url) { URL.revokeObjectURL(url); url = null; }
    photoArea.textContent = '';
    if (busy) { photoArea.append(h('p', { class: 'muted', text: 'Preparing your photo…' })); return; }
    if (!photos.length) return;
    url = URL.createObjectURL(photos[0].file);
    photoArea.append(h('div', { class: 'photo-ok' },
      h('img', { src: url, alt: 'Your chosen photo' }),
      h('span', { class: 'tick', text: '✓ Photo chosen' }),
    ));
  }
  return {
    el,
    status() {
      if (!looksLikeEmail(email.value.trim())) return 'Still needed: your e-mail address.';
      if (busy) return 'Please wait a moment, the photo is being prepared.';
      if (!photos.length) return 'Still needed: a photo.';
      return '';
    },
    update: showPhoto,
    cleanup() { if (url) URL.revokeObjectURL(url); url = null; },
  };
}

// ---------- steps ----------
const OPENED_Q = { id: 'opened', text: 'Did a new e-mail window open?' };
const FILLED_Q = { id: 'filled', text: 'Are To, subject and text filled in?' };
const LETTERS_Q = { id: 'letters', text: 'Do the Hungarian letters (á, é, ő, ű) look right?' };

const TODO_MAILTO = [
  'Click the blue button below.',
  'If your computer asks which program to use, choose your e-mail program. A new e-mail window opens.',
  'Look at the e-mail, but do not send it.',
  'Close the e-mail window (discard the draft) and come back to this page.',
];

const TODO_EML = (file) => [
  'Click the blue button below.',
  `A file named ${file} is saved to your Downloads folder. Your browser may show it at the top or bottom of the window.`,
  'Open your Downloads folder and double-click the file.',
  'Look at the e-mail that opens, but do not send it.',
  'Close it (discard the draft) and come back to this page.',
];

const EML_QUESTIONS = [
  { id: 'opened', text: 'Did it open in an e-mail program?' },
  { id: 'edit', text: 'Can you edit it, and is there a Send button?' },
  { id: 'photos', text: 'Are the photos attached?' },
  LETTERS_Q,
];

const steps = [
  {
    type: 'welcome',
    title: 'Welcome',
    paragraphs: [
      'This page checks which way of creating an e-mail works on your PC. It takes about 5 minutes.',
      'Open this page in your usual browser (Chrome, Edge, Firefox…).',
      'Nothing is sent anywhere. Test e-mails will open — please do not send them, just close them.',
    ],
    startLabel: 'Start',
  },
  { type: 'setup', title: 'Before we start', build: buildSetup },
  {
    type: 'test', id: 't1', name: 'Short e-mail', needsPhoto: false, run: () => openMailto(1),
    todo: TODO_MAILTO, questions: [OPENED_Q, FILLED_Q, LETTERS_Q],
  },
  {
    type: 'test', id: 't2', name: 'Normal-length e-mail', needsPhoto: false, run: () => openMailto(2),
    todo: TODO_MAILTO, questions: [OPENED_Q, FILLED_Q, LETTERS_Q],
  },
  {
    type: 'test', id: 't3', name: 'Very long e-mail', needsPhoto: false, run: () => openMailto(3),
    todo: [
      'Click the blue button below.',
      'If your computer asks which program to use, choose your e-mail program. A new e-mail window opens.',
      `Scroll to the very end of the e-mail text and look at the last line. It should say “${END_MARKER}”. Do not send the e-mail.`,
      'Close the e-mail window (discard the draft) and come back to this page.',
    ],
    questions: [
      OPENED_Q, FILLED_Q, LETTERS_Q,
      { id: 'end', text: `Scroll to the very end of the e-mail text. Is the last line “${END_MARKER}” there?` },
    ],
  },
  {
    type: 'test', id: 't4', name: 'Ready-made draft file with photos', needsPhoto: true, run: () => downloadEml(true),
    todo: TODO_EML('parkstop-teszt-4.eml'), questions: EML_QUESTIONS,
  },
  {
    type: 'test', id: 't5', name: 'Draft file, second version', needsPhoto: true, run: () => downloadEml(false),
    intro: 'The same file saved in a slightly different way, to compare.',
    todo: TODO_EML('parkstop-teszt-5.eml'), questions: EML_QUESTIONS,
  },
  {
    type: 'test', id: 't6', name: 'Copy the photo and paste it into an e-mail', needsPhoto: true, run: copyPhotoToClipboard,
    todo: [
      'Click the blue button below.',
      'Open any new e-mail (in your e-mail program or in webmail).',
      'Click into the text of the e-mail.',
      'Press Ctrl+V.',
    ],
    questions: [{ id: 'pasted', text: 'Did the photo appear in the e-mail?' }],
  },
  {
    type: 'test', id: 't7', name: 'Save the photos', needsPhoto: true, run: downloadPhotos,
    todo: [
      'Click the blue button below.',
      'Your browser may ask to allow several downloads. If it does, allow them.',
      'Open your Downloads folder and look for files named parkstop-foto-1.jpg (and -2, -3 if you chose more photos).',
    ],
    questions: [{ id: 'saved', text: 'Did the photo file(s) appear in your Downloads folder?' }],
  },
  { type: 'final' },
];

wiz = createWizard({
  root: $('wizard'),
  progressTextEl: $('progtext'),
  barFillEl: $('barfill'),
  startOverBtn: $('startover'),
  storageKey: 'parkstop-spike-mail-wizard-v2',
  pageTitle: 'S2 mailto / .eml / clipboard (PC)',
  steps,
  hasPhoto,
  mailPlaceholder: 'For example: Outlook, Windows Mail, Thunderbird, Gmail in the browser',
  pasteInstruction: 'Now go back to the chat with Claude and paste (Ctrl+V in the message box).',
  getEnvText: () => envText,
  getLogText: () => logger.text(),
  onReset: () => logger.clear(),
});

updateLengths();
log('Page ready.');
