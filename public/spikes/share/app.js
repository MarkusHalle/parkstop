import {
  $, SAMPLE_SUBJECT, SAMPLE_BODY, makeLogger, errText, renderEnv, lsGet, lsSet,
  copyText, setupPhotoPicker, fmtSize,
} from './common.js';
import { createWizard, h } from './wizard.js';

const logger = makeLogger($('log'));
const log = logger.log;

// ---------- technical details: environment + sample ----------
function detectFeatures() {
  let canShareFile = 'n/a';
  try {
    if (typeof navigator.canShare === 'function') {
      canShareFile = navigator.canShare({ files: [new File(['x'], 'probe.jpg', { type: 'image/jpeg' })] });
    }
  } catch (e) { canShareFile = 'threw ' + errText(e); }
  return {
    'navigator.share': typeof navigator.share === 'function',
    'navigator.canShare': typeof navigator.canShare === 'function',
    'canShare({files:[jpeg]})': canShareFile,
    'navigator.clipboard.writeText': !!(navigator.clipboard && navigator.clipboard.writeText),
    'ClipboardItem': typeof ClipboardItem !== 'undefined',
    'createImageBitmap': typeof createImageBitmap === 'function',
    'navigator.userActivation': !!navigator.userActivation,
  };
}
const envText = renderEnv($('env'), detectFeatures());
$('subj').textContent = SAMPLE_SUBJECT;
$('bodyview').textContent = SAMPLE_BODY;
$('clearlog').addEventListener('click', () => logger.clear());

// ---------- recipient (stored on this device only) ----------
const RECIPIENT_KEY = 'parkstop-spike-recipient';
const recipient = () => lsGet(RECIPIENT_KEY, '').trim();
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ---------- photos ----------
let photos = [];
let busy = false;
let wiz = null;
setupPhotoPicker({
  inputs: [$('pick'), $('cam')],
  downscaleBox: $('scale'),
  thumbsEl: $('thumbs'),
  log,
  onState: (p, b) => { photos = p; busy = b; if (wiz) wiz.update(); },
});
const hasPhoto = () => photos.length > 0 && !busy;
const files = () => photos.map((p) => p.file);

// ---------- sharing (each call is made directly from the click handler) ----------
function describeData(data) {
  const parts = [];
  if (data.files) parts.push(`files=${data.files.length} (${data.files.map((f) => `${f.name} ${f.type} ${fmtSize(f.size)}`).join(', ')})`);
  if ('title' in data) parts.push(`title=${JSON.stringify(data.title).slice(0, 80)}`);
  if ('text' in data) parts.push(`text=${data.text.length} chars`);
  return parts.join(', ');
}

// Returns a promise that always resolves with {status, detail}.
function callShare(name, data) {
  try {
    const can = typeof navigator.canShare === 'function' ? navigator.canShare({ files: data.files }) : 'canShare missing';
    log(`${name}: canShare({files}) = ${can}`);
  } catch (e) {
    log(`${name}: canShare threw ${errText(e)}`);
  }
  if (typeof navigator.share !== 'function') {
    log(`${name}: navigator.share is not available in this browser/context.`);
    return Promise.resolve({ status: 'unsupported', detail: 'navigator.share is not available' });
  }
  log(`${name}: calling navigator.share({${describeData(data)}}); userActivation.isActive=${navigator.userActivation ? navigator.userActivation.isActive : 'n/a'}`);
  let p;
  try {
    p = navigator.share(data);
  } catch (e) {
    log(`${name}: navigator.share THREW synchronously: ${errText(e)}`);
    return Promise.resolve({ status: 'failed', detail: 'threw synchronously: ' + errText(e) });
  }
  return p.then(
    () => { log(`${name}: share promise RESOLVED (sheet completed or closed by the OS without error)`); return { status: 'ok', detail: 'share promise resolved' }; },
    (e) => {
      log(`${name}: share promise REJECTED: ${errText(e)}`);
      return { status: e && e.name === 'AbortError' ? 'cancelled' : 'failed', detail: 'share promise rejected: ' + errText(e) };
    },
  );
}

const clipText = (r) => (r.ok ? 'OK' : 'FAILED ' + r.error) + (r.fallback ? ' (execCommand fallback)' : '');

function runTest1() {
  return callShare('Test 1', { files: files(), title: SAMPLE_SUBJECT, text: SAMPLE_BODY });
}

function runTest2() {
  return callShare('Test 2', { files: files(), text: SAMPLE_SUBJECT + '\n\n' + SAMPLE_BODY });
}

function runTest3() {
  // Start the clipboard write synchronously, do NOT await it, so the share call keeps user activation.
  const clip = copyText(SAMPLE_BODY).then((r) => {
    log(`Test 3: body clipboard write ${clipText(r)}`);
    return clipText(r);
  });
  const share = callShare('Test 3', { files: files() });
  return Promise.all([share, clip]).then(([s, c]) => ({ status: s.status, detail: `${s.detail}; body clipboard write: ${c}` }));
}

async function runTest4() {
  const to = recipient();
  if (!to) { log('Test 4: no e-mail address available (nothing to copy).'); return { status: 'failed', detail: 'no recipient address set' }; }
  log(`Test 4: userActivation.isActive before clipboard = ${navigator.userActivation ? navigator.userActivation.isActive : 'n/a'}`);
  const r = await copyText(to);
  log(`Test 4: recipient clipboard write ${clipText(r)}`);
  const s = await callShare('Test 4', { files: files(), title: SAMPLE_SUBJECT, text: SAMPLE_BODY });
  return { status: s.status, detail: `${s.detail}; recipient clipboard write before share: ${clipText(r)}` };
}

async function runTest5() {
  const to = recipient();
  const s = await callShare('Test 5', { files: files(), title: SAMPLE_SUBJECT, text: SAMPLE_BODY });
  if (!to) { log('Test 5: no e-mail address available (nothing copied after share).'); return { status: s.status, detail: `${s.detail}; no recipient address set` }; }
  const r = await copyText(to);
  log(`Test 5: recipient clipboard write after share ${clipText(r)}`);
  return { status: s.status, detail: `${s.detail}; recipient clipboard write after share: ${clipText(r)}` };
}

function runTest6() {
  const to = recipient();
  const href = 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@')
    + '?subject=' + encodeURIComponent(SAMPLE_SUBJECT)
    + '&body=' + encodeURIComponent(SAMPLE_BODY.replace(/\n/g, '\r\n'));
  log(`Test 6: opening mailto: link, encoded length ${href.length}`);
  const a = document.createElement('a');
  a.href = href;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  return Promise.resolve({ status: 'ok', detail: `mailto link opened via <a> click, URL length ${href.length}` });
}

// ---------- setup step ----------
function buildSetup(api) {
  const email = h('input', { type: 'email', id: 'setup-email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
  email.value = lsGet(RECIPIENT_KEY, '');
  email.addEventListener('input', () => { lsSet(RECIPIENT_KEY, email.value.trim()); api.update(); });

  const photoArea = h('div');
  let url = null;
  const el = h('div', {},
    h('label', { class: 'lbl', for: 'setup-email', text: 'Type your own e-mail address' }),
    h('p', { class: 'hint', text: 'It is only used to fill in the test e-mails. It stays on this device.' }),
    email,
    h('p', { class: 'lbl', text: 'Choose a photo — any photo will do' }),
    h('button', { type: 'button', class: 'primary', text: 'Choose a photo', onclick: () => $('pick').click() }),
    h('button', { type: 'button', class: 'secondary small', text: 'Or take a new photo with the camera', onclick: () => $('cam').click() }),
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
const APPS_Q = { id: 'apps', text: 'Did the list of apps appear?' };
const PHOTO_Q = { id: 'photo', text: 'Is the photo attached to the e-mail?' };
const SUBJECT_Q = { id: 'subject', text: 'Is the subject line filled in?' };
const TEXT_Q = { id: 'text', text: 'Is the long text filled in?' };

const TODO_BASIC = [
  'Tap the blue button below.',
  'A list of apps appears. Choose your e-mail app (for example Gmail or Outlook).',
  'A new e-mail opens. Look at it, but do not send it.',
  'Close the e-mail (discard the draft) and come back to this page.',
];

const steps = [
  {
    type: 'welcome',
    title: 'Welcome',
    paragraphs: [
      'This page checks which way of creating an e-mail works on your phone. It takes about 5 minutes.',
      'Nothing is sent anywhere. Test e-mails will open — please do not send them, just close them.',
    ],
    startLabel: 'Start',
  },
  { type: 'setup', title: 'Before we start', build: buildSetup },
  {
    type: 'test', id: 't1', name: 'Photo with subject and text', needsPhoto: true, run: runTest1,
    todo: TODO_BASIC, questions: [APPS_Q, PHOTO_Q, SUBJECT_Q, TEXT_Q],
  },
  {
    type: 'test', id: 't2', name: 'Photo with text only', needsPhoto: true, run: runTest2,
    todo: TODO_BASIC, questions: [APPS_Q, PHOTO_Q, SUBJECT_Q, TEXT_Q],
  },
  {
    type: 'test', id: 't3', name: 'Photo only, text copied for pasting', needsPhoto: true, run: runTest3,
    todo: [
      'Tap the blue button below.',
      'A list of apps appears. Choose your e-mail app (for example Gmail or Outlook).',
      'A new e-mail opens. Look at it, but do not send it.',
      'Press and hold in the text area of the e-mail and choose Paste.',
      'Close the e-mail (discard the draft) and come back to this page.',
    ],
    questions: [
      APPS_Q, PHOTO_Q,
      { id: 'paste', text: 'Press and hold in the e-mail’s text area and choose Paste. Did the long text appear?' },
    ],
  },
  {
    type: 'test', id: 't4', name: 'Address copied first', needsPhoto: true, run: runTest4,
    todo: [
      'Tap the blue button below.',
      'A list of apps appears. Choose your e-mail app (for example Gmail or Outlook).',
      'A new e-mail opens. Look at it, but do not send it.',
      'Press and hold the “To” field and choose Paste. Your own e-mail address should appear.',
      'Close the e-mail (discard the draft) and come back to this page.',
    ],
    questions: [
      APPS_Q, PHOTO_Q,
      { id: 'paste', text: 'Press and hold the “To” field and choose Paste. Did your e-mail address appear?' },
    ],
  },
  {
    type: 'test', id: 't5', name: 'Address copied afterwards', needsPhoto: true, run: runTest5,
    todo: [
      'Tap the blue button below.',
      'A list of apps appears. Choose your e-mail app (for example Gmail or Outlook).',
      'A new e-mail opens. Look at it, but do not send it.',
      'Come back to this page first (close the e-mail or switch back to this page).',
      'Now open the e-mail again, or start a new e-mail. Press and hold the “To” field and choose Paste.',
      'Close the e-mail without sending it.',
    ],
    questions: [
      APPS_Q, PHOTO_Q,
      { id: 'paste', text: 'Press and hold the “To” field and choose Paste. Did your e-mail address appear?' },
    ],
  },
  {
    type: 'test', id: 't6', name: 'Plain e-mail link (no photo)', needsPhoto: false, run: runTest6,
    todo: [
      'Tap the blue button below.',
      'Your e-mail app opens with a new e-mail (you may be asked to choose an app first).',
      'Look at it, but do not send it.',
      'Close the e-mail (discard the draft) and come back to this page.',
    ],
    questions: [
      { id: 'opened', text: 'Did a new e-mail open?' },
      { id: 'filled', text: 'Are To, subject and text filled in?' },
    ],
  },
  { type: 'final' },
];

wiz = createWizard({
  root: $('wizard'),
  progressTextEl: $('progtext'),
  barFillEl: $('barfill'),
  startOverBtn: $('startover'),
  storageKey: 'parkstop-spike-share-wizard-v2',
  pageTitle: 'S1 Web Share (phone)',
  steps,
  hasPhoto,
  mailPlaceholder: 'For example: Gmail, Outlook, Samsung Email, Apple Mail',
  pasteInstruction: 'Now go back to the chat with Claude and paste (press and hold in the message box, then Paste).',
  getEnvText: () => envText,
  getLogText: () => logger.text(),
  onReset: () => logger.clear(),
});

log('Page ready.');
