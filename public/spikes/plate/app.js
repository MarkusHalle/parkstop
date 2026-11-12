// ParkStop spike S3: guided plate-reader test for a non-technical tester.
// One step at a time: welcome -> getting ready -> choose photos -> one step per photo -> results.
// Decoding and drawing happen here; inference runs in worker.js (pipeline.js).
// Nothing is stored or sent anywhere: a reload starts again.
import { formatHungarianPlate, normalizePlate } from './pipeline.js';

const MAX_SIDE = 4000; // longer photos are scaled down by the browser before reading
const SHOW_SIDE = 1280; // size of the copy shown on screen
const CROP_HEIGHT = 160; // shown plate crops (CSS shows them at most 160 px high)
const DET_CONF = 0.4; // fast-alpr's detector default
// F-PLATE-9: every photo is also read with this wider crop, so the results compare both on
// the same photos (same value as CROP_MARGIN in the app's src/plate/pipeline.ts).
const WIDE_MARGIN = { x: 0.06, y: 0.1 };
const LOAD_TIMEOUT_MS = 180000;

const $ = (id) => document.getElementById(id);

export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const S = {
  view: 'welcome', // 'welcome' | 'ready' | 'choose' | 'photo' | 'results'
  photoIndex: 0,
  load: { status: 'idle', info: null, error: '', ms: 0 }, // idle | loading | ok | failed
  photos: [],
  nextId: 1,
  worker: null,
  pending: new Map(),
  queue: Promise.resolve(),
  copied: false,
};
let current = null; // { update?() } of the shown step

// ---------------------------------------------------------------------------------------
// Navigation and progress

function totalSteps() { return 4 + S.photos.length; }
function stepNumber() {
  if (S.view === 'welcome') return 1;
  if (S.view === 'ready') return 2;
  if (S.view === 'choose') return 3;
  if (S.view === 'photo') return 4 + S.photoIndex;
  return totalSteps();
}

function go(view, photoIndex = 0) {
  S.view = view;
  S.photoIndex = photoIndex;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const root = $('wizard');
  root.textContent = '';
  const n = stepNumber();
  const m = totalSteps();
  $('progtext').textContent = `Step ${n} of ${m}`;
  $('barfill').style.width = `${Math.round((n / m) * 100)}%`;
  const build = { welcome: buildWelcome, ready: buildReady, choose: buildChoose, photo: buildPhoto, results: buildResults }[S.view];
  current = build(root) || {};
  if (current.update) current.update();
}

/** Something changed in the background (loading, reading): refresh the shown step and the tech box. */
function notify() {
  if (current && current.update) current.update();
  renderTech();
}

function navRow({ backLabel = 'Back', onBack, nextLabel, onNext }) {
  const backBtn = onBack ? h('button', { type: 'button', class: 'secondary', text: backLabel, onclick: onBack }) : null;
  const nextBtn = nextLabel ? h('button', { type: 'button', class: 'primary', text: nextLabel, onclick: onNext }) : null;
  return { el: h('div', { class: 'navrow' }, backBtn, nextBtn), nextBtn };
}

// ---------------------------------------------------------------------------------------
// Step 1: welcome

function buildWelcome(root) {
  root.append(
    h('h2', { text: 'Number plate test' }),
    h('p', { class: 'lead', text: 'This page checks how well the app can read number plates from your photos.' }),
    h('p', { class: 'lead', text: 'You need about 20 photos of parked cars where you can read the number plate yourself. A mix of older plates (like ABC-123) and newer ones (like AA BB-123) is best.' }),
    h('p', { class: 'lead', text: 'It takes about 10 minutes. Your photos stay on this device. Nothing is uploaded.' }),
    h('p', { class: 'lead', text: 'Keep this page open until you finish. If you close or reload it, you start again.' }),
    h('button', { type: 'button', class: 'primary', text: 'Start', onclick: () => go('ready') }),
  );
}

// ---------------------------------------------------------------------------------------
// Step 2: getting ready (loads automatically)

function buildReady(root) {
  if (S.load.status === 'idle') startLoad();
  const busy = h('div', {},
    h('p', { class: 'lead', text: 'Getting the plate reader ready… This is a one-time download of about 26 MB.' }),
    h('div', { class: 'bar busy', role: 'progressbar', 'aria-label': 'Getting ready' }),
    h('p', { class: 'muted', text: 'On a slow connection this can take a minute or two.' }),
  );
  const ok = h('p', { class: 'ok', text: 'Ready.' });
  const fail = h('div', { class: 'calm' },
    h('p', { text: 'The plate reader could not start on this device. That is a useful result.' }),
    h('p', { text: 'Go to the last step and copy your results for Claude.' }),
  );
  const failBtn = h('button', { type: 'button', class: 'primary', text: 'Go to the last step', onclick: () => go('results') });
  const nav = navRow({ onBack: () => go('welcome'), nextLabel: 'Next', onNext: () => go('choose') });
  root.append(h('h2', { text: 'Getting ready' }), busy, ok, fail, failBtn, nav.el);
  return {
    update() {
      const st = S.load.status;
      busy.hidden = st !== 'loading';
      ok.hidden = st !== 'ok';
      fail.hidden = failBtn.hidden = st !== 'failed';
      nav.nextBtn.hidden = st === 'failed';
      nav.nextBtn.disabled = st !== 'ok';
    },
  };
}

// ---------------------------------------------------------------------------------------
// Step 3: choose photos

function buildChoose(root) {
  const pickBtn = h('button', { type: 'button', class: 'primary', text: 'Choose photos', onclick: () => $('pick').click() });
  const camBtn = h('button', { type: 'button', class: 'secondary small', text: 'Or take a photo now', onclick: () => $('cam').click() });
  const count = h('p', { class: 'big' });
  const thumbs = h('div', { class: 'thumbs' });
  const reading = h('p', { class: 'muted', 'aria-live': 'polite' });
  const errors = h('p', { class: 'calm', hidden: true });
  const nav = navRow({ onBack: () => go('ready'), nextLabel: 'Start checking', onNext: () => go('photo', firstUnanswered()) });
  root.append(
    h('h2', { text: 'Choose your photos' }),
    h('p', { class: 'lead', text: 'Choose photos of parked cars where you can read the plate yourself. You can add more photos in several goes.' }),
    pickBtn, camBtn, count, thumbs, reading, errors, nav.el,
  );
  let shown = 0;
  return {
    update() {
      const n = S.photos.length;
      pickBtn.textContent = n ? 'Add more photos' : 'Choose photos';
      pickBtn.className = n ? 'secondary' : 'primary';
      count.hidden = !n;
      count.textContent = n === 1 ? '1 photo chosen' : `${n} photos chosen`;
      for (; shown < n; shown++) thumbs.append(h('figure', {}, h('img', { alt: '', hidden: true })));
      [...thumbs.querySelectorAll('img')].forEach((img, i) => {
        const p = S.photos[i];
        if (p.showUrl && img.getAttribute('src') !== p.showUrl) { img.src = p.showUrl; img.hidden = false; }
      });
      const done = S.photos.filter((p) => p.status === 'done' || p.status === 'error').length;
      reading.textContent = !n ? '' : done < n ? `Reading photo ${done + 1} of ${n}…` : (n === 1 ? 'The photo is read.' : `All ${n} photos are read.`);
      const bad = S.photos.filter((p) => p.status === 'error').length;
      errors.hidden = !bad;
      errors.textContent = bad === 1 ? '1 photo could not be opened on this device. It will be left out.' : `${bad} photos could not be opened on this device. They will be left out.`;
      nav.nextBtn.disabled = n === 0;
    },
  };
}

function firstUnanswered() {
  const i = S.photos.findIndex((p) => !isAnswered(p));
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------------------
// Step 4..: one step per photo

function isAnswered(p) {
  if (p.status === 'error') return true;
  if (p.verdict === 'right' || p.verdict === 'cannot' || p.verdict === 'skipped') return true;
  return p.verdict === 'wrong' && p.typed.trim() !== '';
}

function buildPhoto(root) {
  const i = S.photoIndex;
  const p = S.photos[i];
  const n = S.photos.length;
  const isLast = i === n - 1;
  const goNext = () => (isLast ? go('results') : go('photo', i + 1));

  const img = h('img', { class: 'shot', alt: 'Your photo', hidden: true });
  const answer = h('div', { 'aria-live': 'polite' });
  const noteEl = h('textarea', { id: 'note', rows: '2' });
  noteEl.value = p.note;
  noteEl.addEventListener('input', () => { p.note = noteEl.value; });
  const note = h('div', {},
    h('label', { class: 'lbl', for: 'note', text: 'Anything unusual about this photo? (optional)' }),
    h('p', { class: 'hint', text: 'For example: taken at night, far away, at an angle.' }),
    noteEl,
  );
  const nav = navRow({
    onBack: () => (i === 0 ? go('choose') : go('photo', i - 1)),
    nextLabel: isLast ? 'See results' : 'Next photo',
    onNext: goNext,
  });
  const skip = h('button', { type: 'button', class: 'linkbtn', text: 'Skip this photo', onclick: () => { p.verdict = 'skipped'; goNext(); } });

  root.append(h('h2', { text: `Photo ${i + 1} of ${n}` }), img, answer, note, nav.el, h('p', { class: 'center' }, skip));

  let builtFor = '';
  function refreshNav() { nav.nextBtn.disabled = !isAnswered(p); }

  function buildAnswer() {
    answer.textContent = '';
    if (p.status === 'error') {
      answer.append(h('p', { class: 'calm', text: 'This photo could not be opened on this device. It will be left out.' }));
      return;
    }
    if (p.status !== 'done') {
      answer.append(h('p', { class: 'lead', text: 'Reading this photo…' }), h('div', { class: 'bar busy', role: 'progressbar', 'aria-label': 'Reading' }));
      return;
    }
    const plates = p.result.plates;
    const choice = (label, pressed, onclick) => h('button', { type: 'button', class: 'answer-btn', text: label, 'aria-pressed': pressed ? 'true' : 'false', onclick });
    const set = (verdict, chosen = -1) => () => {
      p.verdict = verdict;
      p.chosen = chosen;
      if (verdict === 'cannot' && !plates.length) p.typed = '';
      buildAnswer();
      refreshNav();
    };
    const typeBox = (label) => {
      const input = h('input', { type: 'text', id: 'typed', class: 'plate-input', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABC-123' });
      input.value = p.typed;
      input.addEventListener('input', () => {
        p.typed = input.value.toUpperCase();
        if (!plates.length) {
          // No plate found: typing is the answer (and replaces "I cannot read it").
          p.verdict = p.typed.trim() ? 'wrong' : null;
          cannot.setAttribute('aria-pressed', 'false');
        }
        refreshNav();
      });
      return h('div', {}, h('label', { class: 'lbl', for: 'typed', text: label }), input);
    };
    const cannot = choice('I cannot read the plate myself', p.verdict === 'cannot', set('cannot'));

    if (plates.length === 0) {
      answer.append(h('p', { class: 'lead', text: 'The app could not find a number plate in this photo.' }), typeBox('Type the plate you can see'), cannot);
    } else if (plates.length === 1) {
      const pl = plates[0];
      answer.append(
        h('img', { class: 'crop', src: p.cropUrls[0] || null, alt: 'The plate the app found' }),
        h('p', { class: 'lead', text: 'The app read:' }),
        h('p', { class: 'plate-read', text: shown(pl.text) }),
        h('p', { class: 'qtext', text: 'Is this exactly the plate on the car?' }),
        choice('Yes, it is right', p.verdict === 'right', set('right', 0)),
        choice('No, it is wrong', p.verdict === 'wrong', set('wrong')),
        cannot,
      );
      if (p.verdict === 'wrong') answer.append(typeBox('Type the correct plate'));
    } else {
      answer.append(h('p', { class: 'lead', text: `The app found ${plates.length} plates in this photo.` }));
      plates.forEach((pl, k) => {
        answer.append(h('div', { class: 'cand' },
          h('img', { class: 'crop', src: p.cropUrls[k] || null, alt: `Plate ${k + 1}` }),
          choice(`This is the car I meant: ${shown(pl.text)}`, p.verdict === 'right' && p.chosen === k, set('right', k)),
        ));
      });
      answer.append(choice('None of these is right', p.verdict === 'wrong', set('wrong')), cannot);
      if (p.verdict === 'wrong') answer.append(typeBox('Type the correct plate'));
    }
    const typed = answer.querySelector('#typed');
    if (typed && document.activeElement !== typed && p.verdict === 'wrong' && plates.length && !p.typed) typed.focus();
  }

  return {
    update() {
      img.hidden = !p.showUrl;
      if (p.showUrl && img.getAttribute('src') !== p.showUrl) img.src = p.showUrl;
      const key = p.status + ':' + (p.result ? p.result.stamp : '');
      if (key !== builtFor) { builtFor = key; buildAnswer(); }
      refreshNav();
      skip.parentElement.hidden = isAnswered(p) && p.verdict !== 'skipped';
    },
  };
}

function shown(text) {
  return text ? formatHungarianPlate(text) : '(nothing readable)';
}

// ---------------------------------------------------------------------------------------
// Last step: results

function buildResults(root) {
  const s = computeSummary();
  const lines = [];
  if (S.load.status === 'failed') {
    lines.push(h('p', { class: 'big', text: 'The plate reader could not start on this device.' }));
    lines.push(h('p', { class: 'lead', text: 'That is a useful result. Please copy it for Claude.' }));
  } else if (!s.scored) {
    lines.push(h('p', { class: 'big', text: 'No photos were checked.' }));
  } else {
    lines.push(h('p', { class: 'big', text: `The app read ${s.correct} of ${s.scored} ${s.scored === 1 ? 'plate' : 'plates'} correctly.` }));
  }
  if (s.margin.photos) {
    lines.push(h('p', { class: 'lead', text: `Wider crop test: exact reads ${s.margin.plain.exact} of ${s.margin.photos} as cut by the detector, ${s.margin.wide.exact} of ${s.margin.photos} with the wider crop (6 % / 10 %).` }));
  }
  if (Number.isFinite(s.medianTotal)) {
    lines.push(h('p', { class: 'lead', text: `Typical time per photo: ${(s.medianTotal / 1000).toFixed(1)} seconds.` }));
  }
  if (s.leftOut) {
    lines.push(h('p', { class: 'lead', text: `${s.leftOut === 1 ? '1 photo was' : s.leftOut + ' photos were'} left out (you could not read the plate, skipped it, did not answer, or it could not be opened).` }));
  }
  const done = h('p', { class: 'ok', hidden: true });
  const paste = h('p', { class: 'lead', hidden: true, text: 'Now go back to the chat with Claude and paste. On a phone: press and hold in the message box, then tap Paste. On a PC: press Ctrl+V.' });
  const box = h('textarea', { rows: '10', readonly: true, hidden: true });
  const hint = h('p', { class: 'muted', hidden: true, text: 'If copying did not work, select this text and copy it by hand.' });
  const copyBtn = h('button', {
    type: 'button', class: 'primary', text: 'Copy my results',
    onclick: async () => {
      const text = buildReport();
      box.value = text;
      box.hidden = hint.hidden = paste.hidden = false;
      const r = await copyText(text);
      done.hidden = false;
      done.className = r.ok ? 'ok' : 'calm';
      done.textContent = r.ok ? 'Copied' : 'Copying did not work automatically. Please copy the text in the box below by hand.';
      if (r.ok) S.copied = true;
    },
  });
  const back = () => {
    if (S.load.status === 'failed') go('ready');
    else if (S.photos.length) go('photo', S.photos.length - 1);
    else go('choose');
  };
  root.append(h('h2', { text: 'Your results' }), ...lines, copyBtn, done, paste, box, hint, navRow({ onBack: back }).el);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return { ok };
    } catch {
      return { ok: false };
    }
  }
}

// ---------------------------------------------------------------------------------------
// Worker and loading

function makeWorker() {
  const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (ev) => {
    const m = ev.data;
    const id = m.type === 'loaded' || (m.type === 'error' && m.id === undefined) ? 'load' : m.id;
    const p = S.pending.get(id);
    if (!p) return;
    S.pending.delete(id);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  };
  w.onerror = (ev) => {
    const err = new Error(ev.message || 'The worker could not start (module workers may be unsupported).');
    for (const p of S.pending.values()) p.reject(err);
    S.pending.clear();
  };
  return w;
}

function call(msg, transfer) {
  return new Promise((resolve, reject) => {
    S.pending.set(msg.id ?? 'load', { resolve, reject });
    S.worker.postMessage(msg, transfer || []);
  });
}

async function startLoad() {
  if (S.load.status === 'loading' || S.load.status === 'ok') return;
  S.load = { status: 'loading', info: null, error: '', ms: 0 };
  const t = performance.now();
  try {
    if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is not available');
    S.worker = makeWorker();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${LOAD_TIMEOUT_MS / 1000} s`)), LOAD_TIMEOUT_MS));
    const m = await Promise.race([call({ type: 'load' }), timeout]);
    S.load = { status: 'ok', info: m.info, error: '', ms: performance.now() - t };
    for (const p of S.photos) if (p.status === 'queued') enqueue(p);
  } catch (e) {
    S.load = { status: 'failed', info: null, error: e && e.message ? e.message : String(e), ms: performance.now() - t };
    if (S.worker) S.worker.terminate();
  }
  notify();
}

// ---------------------------------------------------------------------------------------
// Photos: decoding and reading (in the background, one at a time)

function addFiles(files) {
  for (const file of files) {
    const p = {
      id: S.nextId++, file, name: file.name || `photo-${S.nextId}.jpg`, bytes: file.size,
      status: 'queued', error: '', result: null, showUrl: '', cropUrls: [],
      verdict: null, chosen: -1, typed: '', note: '',
    };
    S.photos.push(p);
    if (S.load.status === 'ok') enqueue(p);
  }
  render(); // the step count changed
  renderTech();
}

function enqueue(p) {
  S.queue = S.queue.then(() => processPhoto(p)).catch(() => {});
}

async function decodeFile(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback: <img> decoding applies EXIF orientation in current browsers.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      bmp = img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const w0 = bmp.width || bmp.naturalWidth;
  const h0 = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const hh = Math.round(h0 * scale);
  const canvas = makeCanvas(w, hh);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, hh);
  if (bmp.close) bmp.close();
  const imageData = ctx.getImageData(0, 0, w, hh);
  return { canvas, imageData, w, h: hh, w0, h0, scaled: scale < 1 };
}

function makeCanvas(w, hh) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, hh);
  return Object.assign(document.createElement('canvas'), { width: w, height: hh });
}

/** Draw a region of `src` into a small <canvas> and return an object URL of a JPEG. */
function regionToUrl(src, sx, sy, sw, sh, dw, dh) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(dw));
  c.height = Math.max(1, Math.round(dh));
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.85);
    } catch {
      resolve('');
    }
  });
}

async function processPhoto(p) {
  if (S.load.status !== 'ok') { p.status = 'queued'; return; }
  p.status = 'reading';
  notify();
  try {
    const t0 = performance.now();
    const d = await decodeFile(p.file);
    const decodeMs = performance.now() - t0;
    if (!p.showUrl) {
      const k = Math.min(1, SHOW_SIDE / Math.max(d.w, d.h));
      p.showUrl = await regionToUrl(d.canvas, 0, 0, d.w, d.h, d.w * k, d.h * k);
      notify();
    }
    const tRead = performance.now();
    const msg = await call(
      { type: 'read', id: p.id, width: d.w, height: d.h, buffer: d.imageData.data.buffer, confThresh: DET_CONF, wideMargin: WIDE_MARGIN },
      [d.imageData.data.buffer],
    );
    // Excludes making the on-screen copy and the second (wider-crop) read.
    const wallMs = decodeMs + (performance.now() - tRead) - (msg.wideMs || 0);
    const cropUrls = [];
    for (const pl of msg.plates) {
      const { x, y, w, h: ch } = pl.crop;
      const dh = Math.min(CROP_HEIGHT * 2, ch * 4);
      cropUrls.push(await regionToUrl(d.canvas, x, y, w, ch, (w / ch) * dh, dh));
    }
    p.result = {
      w: d.w, h: d.h, w0: d.w0, h0: d.h0, scaled: d.scaled, plates: msg.plates, platesWide: msg.platesWide || [],
      timings: { decode: decodeMs, ...msg.timings, wall: wallMs }, stamp: performance.now(),
    };
    p.cropUrls = cropUrls;
    p.status = 'done';
  } catch (e) {
    p.status = 'error';
    p.error = e && e.message ? e.message : String(e);
  }
  notify();
}

function rerunAll() {
  for (const p of S.photos) { p.status = 'queued'; enqueue(p); }
  notify();
}

// ---------------------------------------------------------------------------------------
// Scoring, summary and report

function topPlate(plates) {
  return plates.length ? plates.reduce((a, b) => (b.detScore > a.detScore ? b : a)) : null;
}

/**
 * correct: the tester confirmed a read (or typed exactly what the app read).
 * wrong: the tester typed a different plate, or no plate was found and they typed one.
 * left out: cannot read, skipped, not answered, could not be opened.
 * `read` is the read the app would suggest: the chosen crop, else the top plate.
 */
function score(p) {
  if (p.status === 'error') return { state: 'left', reason: 'could not be opened' };
  if (p.status !== 'done') return { state: 'left', reason: 'not read yet' };
  const plates = p.result.plates;
  if (p.verdict === 'skipped') return { state: 'left', reason: 'skipped' };
  if (p.verdict === 'cannot') return { state: 'left', reason: 'tester cannot read the plate' };
  if (p.verdict === 'right') {
    const read = plates[p.chosen] || plates[0];
    return { state: 'correct', read, truth: read.text };
  }
  if (p.verdict === 'wrong' && p.typed.trim()) {
    const same = plates.find((x) => normalizePlate(x.text) === normalizePlate(p.typed));
    if (same) return { state: 'correct', read: same, truth: p.typed.trim(), why: 'typed text equals a read' };
    return { state: 'wrong', read: topPlate(plates), truth: p.typed.trim(), why: plates.length ? 'misread' : 'no plate found' };
  }
  return { state: 'left', reason: 'not answered' };
}

function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function threshold() {
  const v = Number($('thr').value);
  return Number.isFinite(v) ? v : 0.9;
}

function computeSummary() {
  const thr = threshold();
  const sc = S.photos.map((p) => ({ p, s: score(p) }));
  const scored = sc.filter((x) => x.s.state !== 'left');
  const left = sc.filter((x) => x.s.state === 'left');
  const reasons = {};
  for (const x of left) reasons[x.s.reason] = (reasons[x.s.reason] || 0) + 1;
  const withRead = scored.filter((x) => x.s.read);
  const above = withRead.filter((x) => x.s.read.minConf >= thr);
  const done = S.photos.filter((p) => p.status === 'done');
  const totals = done.map((p) => p.result.timings.wall);
  // F-PLATE-9 comparison on the photos with a known true plate: is it among the reads with
  // the detector's crop, and with the wider crop? "filled" = that read is also above the threshold.
  const withTruth = scored.filter((x) => x.s.truth && x.p.result);
  const hit = (plates, truth) => plates.find((r) => normalizePlate(r.text) === normalizePlate(truth));
  const cmp = (key) => {
    const hits = withTruth.map((x) => hit(x.p.result[key], x.s.truth)).filter(Boolean);
    return { exact: hits.length, filled: hits.filter((r) => r.minConf >= thr).length };
  };
  const margin = { photos: withTruth.length, plain: cmp('plates'), wide: cmp('platesWide') };
  return {
    margin,
    thr, scored: scored.length, correct: scored.filter((x) => x.s.state === 'correct').length,
    wrong: scored.filter((x) => x.s.state === 'wrong').length,
    leftOut: left.length, reasons,
    noPlate: scored.filter((x) => !x.s.read).length,
    below: withRead.length - above.length,
    aboveCorrect: above.filter((x) => x.s.state === 'correct').length,
    aboveWrong: above.filter((x) => x.s.state === 'wrong').length,
    above: above.length,
    medianTotal: median(totals), maxTotal: totals.length ? Math.max(...totals) : NaN,
    medianDetect: median(done.map((p) => p.result.timings.detect)),
    medianOcr: median(done.map((p) => p.result.timings.ocr)),
    medianDecode: median(done.map((p) => p.result.timings.decode)),
  };
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '-');
const ms = (v) => (Number.isFinite(v) ? `${Math.round(v)} ms` : '-');

function downloadBytes() {
  const l = S.load.info;
  if (!l) return null;
  const models = l.models.reduce((a, m) => a + m.bytes, 0);
  const rt = l.resources.filter((r) => r.name.endsWith('.wasm') || r.name.endsWith('.mjs'));
  return {
    models,
    runtime: rt.reduce((a, r) => a + (r.decodedBodySize || 0), 0),
    runtimeWire: rt.reduce((a, r) => a + (r.transferSize || 0), 0),
  };
}

function envRows() {
  const l = S.load.info;
  return [
    ['User agent', navigator.userAgent],
    ['Page URL', location.href],
    ['Screen / DPR', `${screen.width}x${screen.height} @${window.devicePixelRatio}`],
    ['crossOriginIsolated', String(self.crossOriginIsolated === true)],
    ['hardwareConcurrency', String(navigator.hardwareConcurrency ?? 'n/a')],
    ['deviceMemory (GB)', String(navigator.deviceMemory ?? 'n/a')],
    ['WebGPU (not used)', navigator.gpu ? 'present' : 'absent'],
    ['ONNX Runtime Web', l ? `${l.ortVersion} (${l.bundle}), EP ${l.epUsed}, threads ${l.numThreads}` : S.load.status],
  ];
}

function verdictText(p, s) {
  const v = { right: 'RIGHT (confirmed a read)', wrong: 'WRONG (typed the correct plate)', cannot: 'cannot read it myself', skipped: 'skipped' }[p.verdict];
  if (p.status === 'error') return 'could not be opened';
  if (!v) return 'not answered';
  if (p.verdict === 'wrong' && s.state === 'correct') return 'typed the same text the app read (counted RIGHT)';
  if (p.verdict === 'wrong' && !p.result?.plates.length) return 'no plate found; typed the plate (counted WRONG)';
  return v;
}

function buildReport() {
  const s = computeSummary();
  const b = downloadBytes();
  const l = S.load.info;
  const L = [];
  L.push('ParkStop plate reader test (spike S3) - results');
  L.push(`Date: ${new Date().toISOString()}`);
  L.push(S.load.status === 'ok'
    ? `Reader: started in ${ms(S.load.ms)} (warm-up ${ms(l.warmupMs)})`
    : `Reader: ${S.load.status === 'failed' ? 'FAILED TO START - ' + S.load.error : S.load.status}`);
  L.push('');
  L.push('== Summary ==');
  L.push(`Read correctly: ${s.correct} of ${s.scored} (${pct(s.correct, s.scored)}); wrong: ${s.wrong} (of which no plate found: ${s.noPlate})`);
  const r = Object.entries(s.reasons).map(([k, v]) => `${k} ${v}`).join(', ');
  L.push(`Left out: ${s.leftOut}${r ? ' (' + r + ')' : ''}`);
  L.push(`Time per photo (decode + read): median ${ms(s.medianTotal)}, max ${ms(s.maxTotal)}; median decode ${ms(s.medianDecode)}, detect ${ms(s.medianDetect)}, read ${ms(s.medianOcr)}`);
  L.push(`Fill-in threshold ${s.thr.toFixed(2)} (min char confidence of the suggested read): below threshold ${s.below}; above threshold ${s.above}, of which right ${s.aboveCorrect} (${pct(s.aboveCorrect, s.above)}) and WRONG ${s.aboveWrong}`);
  if (b) L.push(`Download: models ${b.models} B + runtime ${b.runtime} B = ${b.models + b.runtime} B (runtime on the wire ${b.runtimeWire} B; 0 = from cache)`);
  L.push(`Photos chosen: ${S.photos.length}; detector min score ${DET_CONF}`);
  L.push(`Wider crop (F-PLATE-9, ${WIDE_MARGIN.x * 100} % / ${WIDE_MARGIN.y * 100} %) on ${s.margin.photos} photos with a known plate: exact ${s.margin.plain.exact} detector crop vs ${s.margin.wide.exact} wider crop; exact and above threshold ${s.margin.plain.filled} vs ${s.margin.wide.filled}`);
  L.push('');
  L.push('== Photos ==');
  S.photos.forEach((p, i) => {
    const sc = score(p);
    const res = p.result;
    L.push(`#${i + 1} ${p.name} | ${res ? `${res.w}x${res.h}${res.scaled ? ` (from ${res.w0}x${res.h0})` : ''}` : '-'} | ${p.bytes} B`);
    L.push(`  verdict: ${verdictText(p, sc)} | counted: ${sc.state === 'left' ? 'left out (' + sc.reason + ')' : sc.state.toUpperCase()} | true plate: ${sc.truth ? formatHungarianPlate(normalizePlate(sc.truth)) : '-'}`);
    if (p.status === 'error') L.push(`  error: ${p.error}`);
    if (res) {
      if (!res.plates.length) L.push('  reads: none (no plate found)');
      res.plates.forEach((pl, k) => {
        const tags = [k === p.chosen && p.verdict === 'right' ? 'chosen' : '', pl === topPlate(res.plates) && res.plates.length > 1 ? 'top' : ''].filter(Boolean).join(',');
        L.push(`  read: ${pl.text || '(empty)'} min ${pl.minConf.toFixed(4)} mean ${pl.meanConf.toFixed(4)} det ${pl.detScore.toFixed(3)} ${pl.region || ''} ${pl.regionConf != null ? pl.regionConf.toFixed(2) : ''}${tags ? ' [' + tags + ']' : ''}`);
      });
      if (res.platesWide && res.platesWide.length) {
        L.push(`  wider crop: ${res.platesWide.map((pl) => `${pl.text || '(empty)'} min ${pl.minConf.toFixed(4)}`).join('; ')}`);
      }
      const t = res.timings;
      L.push(`  ms: decode ${Math.round(t.decode)} detect ${Math.round(t.detect)} read ${Math.round(t.ocr)} total ${Math.round(t.wall)}`);
    }
    if (p.note.trim()) L.push(`  note: ${p.note.trim().replace(/\s*\n\s*/g, ' / ')}`);
  });
  L.push('');
  L.push('== Environment ==');
  for (const [k, v] of envRows()) L.push(`${k}: ${v}`);
  if (l) {
    L.push('');
    L.push('== Files ==');
    for (const m of l.models) {
      const rr = l.resources.find((x) => x.name === m.name);
      L.push(`${m.role} ${m.name}: ${m.bytes} B, wire ${rr ? rr.transferSize : 'n/a'} B, fetch ${Math.round(m.fetchMs)} ms, init ${Math.round(m.initMs)} ms`);
    }
    for (const rr of l.resources.filter((x) => x.name.endsWith('.wasm') || x.name.endsWith('.mjs'))) {
      L.push(`runtime ${rr.name}: ${rr.decodedBodySize} B, wire ${rr.transferSize} B, ${Math.round(rr.durationMs)} ms`);
    }
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------
// Technical details box

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '-';
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(1)} kB`;
}

function table(head, rows) {
  return h('table', { class: 'tech' },
    h('thead', {}, h('tr', {}, head.map((x) => h('th', { text: x })))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((x) => h('td', { text: x }))))));
}

function renderTech() {
  const env = $('env');
  env.textContent = '';
  env.append(h('dl', {}, envRows().flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));

  const l = S.load.info;
  const models = $('models');
  models.textContent = '';
  if (S.load.status === 'failed') models.append(h('p', { text: 'Load failed: ' + S.load.error }));
  else if (!l) models.append(h('p', { text: S.load.status === 'loading' ? 'Loading…' : 'Not loaded yet.' }));
  else {
    const rows = l.models.map((m) => [m.name, fmtBytes(m.bytes), `${Math.round(m.fetchMs)} ms`, `${Math.round(m.initMs)} ms`]);
    for (const r of l.resources.filter((x) => x.name.endsWith('.wasm') || x.name.endsWith('.mjs'))) {
      rows.push([r.name + ' (runtime)', fmtBytes(r.decodedBodySize), `${Math.round(r.durationMs)} ms`, '']);
    }
    const b = downloadBytes();
    rows.push(['Total', fmtBytes(b.models + b.runtime), '', '']);
    models.append(table(['File', 'Size', 'Fetch', 'Init'], rows), h('p', { class: 'muted', text: `Load ${Math.round(S.load.ms)} ms, warm-up ${Math.round(l.warmupMs)} ms` }));
  }

  const s = computeSummary();
  $('thrstats').textContent = '';
  $('thrstats').append(h('p', {
    text: `Checked ${s.scored}: right ${s.correct}, wrong ${s.wrong}. Below threshold: ${s.below}. Above threshold: ${s.above} (right ${s.aboveCorrect}, WRONG ${s.aboveWrong}). Median time ${ms(s.medianTotal)}, max ${ms(s.maxTotal)}.`,
  }));

  const pt = $('phototable');
  pt.textContent = '';
  if (!S.photos.length) pt.append('No photos yet.');
  else {
    pt.append(table(['#', 'File', 'Reads (min / mean / det)', 'Verdict', 'ms dec/det/read/total'], S.photos.map((p, i) => {
      const r = p.result;
      return [
        String(i + 1), p.name,
        r ? (r.plates.map((x) => `${x.text || '(empty)'} ${x.minConf.toFixed(3)}/${x.meanConf.toFixed(3)}/${x.detScore.toFixed(2)}`).join('; ') || 'none') : p.status,
        score(p).state,
        r ? ['decode', 'detect', 'ocr', 'wall'].map((k) => Math.round(r.timings[k])).join('/') : '',
      ];
    })));
  }
  $('rerun').disabled = !(S.load.status === 'ok' && S.photos.length);
}

// ---------------------------------------------------------------------------------------
// Wiring

$('pick').addEventListener('change', (ev) => { addFiles([...ev.target.files]); ev.target.value = ''; });
$('cam').addEventListener('change', (ev) => { addFiles([...ev.target.files]); ev.target.value = ''; });
$('thr').addEventListener('input', renderTech);
$('rerun').addEventListener('click', rerunAll);
window.addEventListener('beforeunload', (ev) => {
  if (S.photos.length && !S.copied) { ev.preventDefault(); ev.returnValue = ''; }
});

render();
renderTech();
