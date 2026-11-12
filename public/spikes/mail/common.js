// Shared helpers for the ParkStop spike pages (identical copy lives in share/ and mail/).
// Plain ES module, no dependencies, no network.

export const SAMPLE_SUBJECT = 'Szabálytalan parkolás bejelentése – ABC-123 – Pannónia utca 14.';
export const SAMPLE_NOTE = 'Babakocsival nem lehet elférni a járdán.';

export const SAMPLE_BODY = [
  'Tisztelt Teszt Hatóság!',
  '',
  '2026. 11. 11. 14:35-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:',
  '',
  'Helyszín:      Budapest XIII., Pannónia utca 14. (XIII. kerület), GPS: 47.5188, 19.0517',
  'Rendszám:      ABC-123',
  'Jármű:         piros Opel Astra',
  'Szabálysértés: járdán történő várakozás (KRESZ 40. § (1) bekezdés)',
  'Megjegyzés:    ' + SAMPLE_NOTE,
  '',
  'A helyszínen készített 2 fényképet mellékelem. Kérem az ügy kivizsgálását és a',
  'szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.',
  '',
  'Tisztelettel:',
  'Teszt Elek',
  '1135 Budapest, Árvíz tér 7.',
  'teszt.elek@example.com, +36 30 000 0000',
].join('\n');

export const SAMPLE_BODY_SHORT = [
  'Tisztelt Teszt Hatóság!',
  '',
  '2026. 11. 11. 14:35-kor szabálytalanul várakozó járművet észleltem.',
  'Helyszín: Budapest XIII., Pannónia utca 14.',
  'Rendszám: ABC-123',
  'Megjegyzés: ' + SAMPLE_NOTE,
  '',
  'Kérem az ügy kivizsgálását.',
  'Tisztelettel: Teszt Elek',
].join('\n');

export const $ = (id) => document.getElementById(id);

export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// ---------- localStorage (always guarded) ----------
export function lsGet(key, fallback = '') {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ---------- on-page log ----------
export function makeLogger(preEl) {
  const lines = [];
  const t0 = Date.now();
  function log(msg) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1).padStart(6, ' ');
    const line = `[${secs}s] ${msg}`;
    lines.push(line);
    preEl.textContent = lines.join('\n');
    preEl.scrollTop = preEl.scrollHeight;
  }
  return {
    log,
    text: () => lines.join('\n'),
    clear: () => { lines.length = 0; preEl.textContent = ''; },
  };
}

export function errText(e) {
  if (!e) return String(e);
  return `${e.name || 'Error'}: ${e.message || ''}`.trim();
}

// ---------- recipient input ----------
export function setupRecipient(input) {
  const KEY = 'parkstop-spike-recipient';
  input.value = lsGet(KEY, '');
  input.addEventListener('input', () => lsSet(KEY, input.value.trim()));
}

// ---------- environment box ----------
// features: { label: boolean | string }. Returns plain-text version.
export function renderEnv(box, features) {
  const rows = [
    ['User agent', navigator.userAgent],
    ['isSecureContext', String(window.isSecureContext)],
    ['Page URL', location.href],
    ['Screen / DPR', `${screen.width}x${screen.height} @${window.devicePixelRatio}`],
    ['Language', navigator.language],
  ];
  for (const [k, v] of Object.entries(features)) {
    rows.push([k, typeof v === 'boolean' ? (v ? 'yes' : 'NO') : String(v)]);
  }
  box.textContent = '';
  const dl = document.createElement('dl');
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  box.append(dl);
  return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ---------- clipboard ----------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (e) {
    // Fallback for older browsers / insecure context.
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
      return ok ? { ok: true, fallback: true, firstError: errText(e) } : { ok: false, error: errText(e) };
    } catch (e2) {
      return { ok: false, error: errText(e) + ' / fallback: ' + errText(e2) };
    }
  }
}

// ---------- image handling ----------
async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e1) {
    // Fallback: <img> (modern browsers apply EXIF orientation to <img> by default).
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } catch (e2) {
      throw new Error(`cannot decode image (${errText(e1)}; fallback ${errText(e2)})`);
    } finally {
      // Safe to revoke after decode: the decoded image is already drawn from memory.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

export async function renderToCanvas(file, maxEdge) {
  const src = await loadBitmap(file);
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(w0, h0)) : 1;
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  if (typeof src.close === 'function') src.close();
  return canvas;
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), type, quality);
  });
}

// Downscale to JPEG: long edge <= maxEdge, quality as given.
export async function downscaleToJpeg(file, maxEdge = 2000, quality = 0.85) {
  const canvas = await renderToCanvas(file, maxEdge);
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  return { blob, width: canvas.width, height: canvas.height };
}

// ---------- photo picker ----------
// Keeps up to 3 photos; processes them (optionally downscaled) when picked or when the option toggles.
// onState(photos, busy). photo = {name, original: File, file: File, width, height, error}
export function setupPhotoPicker({ inputs, downscaleBox, thumbsEl, log, onState }) {
  let photos = [];
  let picked = [];
  let token = 0;
  let thumbUrls = [];

  async function process() {
    const my = ++token;
    onState(photos, true);
    const out = [];
    const useScale = downscaleBox.checked;
    for (let i = 0; i < picked.length; i++) {
      const original = picked[i];
      const p = { name: `parkstop-${i + 1}.jpg`, original, file: original, width: 0, height: 0, error: '' };
      if (useScale) {
        try {
          const t = performance.now();
          const r = await downscaleToJpeg(original, 2000, 0.85);
          p.file = new File([r.blob], p.name, { type: 'image/jpeg' });
          p.width = r.width; p.height = r.height;
          log(`Photo ${i + 1}: ${fmtSize(original.size)} -> ${fmtSize(p.file.size)} (${r.width}x${r.height}) in ${Math.round(performance.now() - t)} ms`);
        } catch (e) {
          p.error = errText(e);
          log(`Photo ${i + 1}: downscale FAILED, using original. ${p.error}`);
        }
      } else {
        log(`Photo ${i + 1}: original used as is, ${fmtSize(original.size)}, type "${original.type}"`);
      }
      out.push(p);
      if (my !== token) return; // superseded
    }
    photos = out;
    renderThumbs();
    onState(photos, false);
  }

  function renderThumbs() {
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbUrls = [];
    thumbsEl.textContent = '';
    photos.forEach((p, i) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      const url = URL.createObjectURL(p.file);
      thumbUrls.push(url);
      img.src = url;
      img.alt = `Photo ${i + 1}`;
      const cap = document.createElement('figcaption');
      const dims = p.width ? `${p.width}x${p.height}, ` : '';
      cap.textContent = `${i + 1}: ${dims}${fmtSize(p.file.size)}${p.original !== p.file ? ` (orig ${fmtSize(p.original.size)})` : ''}${p.error ? ' - ' + p.error : ''}`;
      fig.append(img, cap);
      thumbsEl.append(fig);
    });
  }

  for (const input of inputs) {
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      if (files.length > 3) log(`Picked ${files.length} files, only the first 3 are used.`);
      picked = files.slice(0, 3);
      // Reset the other inputs so that the user sees which source is active.
      for (const other of inputs) if (other !== input) other.value = '';
      log(`Picked ${picked.length} file(s): ${picked.map((f) => `${f.name || '(no name)'} [${f.type || '?'}, ${fmtSize(f.size)}]`).join('; ')}`);
      process();
    });
  }
  downscaleBox.addEventListener('change', () => { if (picked.length) process(); });
  onState(photos, false);

  return { get photos() { return photos; } };
}

// ---------- results form ----------
// tests: [{id, label}]. Returns {text()} for the per-test summary.
export function setupResults({ root, storageKey, tests, copyBtn, summaryEl, copyStatusEl, getEnvText, getLogText, pageTitle }) {
  let state;
  try { state = JSON.parse(lsGet(storageKey, '{}')) || {}; } catch { state = {}; }
  const save = () => lsSet(storageKey, JSON.stringify(state));

  root.textContent = '';
  const options = [['', 'not tested'], ['worked', 'worked'], ['partly', 'partly'], ['failed', 'failed']];

  for (const t of tests) {
    const fs = document.createElement('fieldset');
    fs.className = 'result';
    const lg = document.createElement('legend');
    lg.textContent = t.label;
    fs.append(lg);
    const row = document.createElement('div');
    row.className = 'radios';
    for (const [val, text] of options) {
      const label = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'res-' + t.id; r.value = val;
      r.checked = (state['r-' + t.id] || '') === val;
      r.addEventListener('change', () => { state['r-' + t.id] = val; save(); });
      label.append(r, document.createTextNode(' ' + text));
      row.append(label);
    }
    const note = document.createElement('textarea');
    note.rows = 2;
    note.placeholder = 'Note (what happened, what was missing)';
    note.value = state['n-' + t.id] || '';
    note.addEventListener('input', () => { state['n-' + t.id] = note.value; save(); });
    fs.append(row, note);
    root.append(fs);
  }

  const fsApp = document.createElement('fieldset');
  fsApp.className = 'result';
  const lgApp = document.createElement('legend');
  lgApp.textContent = 'Mail app used / general remarks';
  const app = document.createElement('input');
  app.type = 'text';
  app.placeholder = 'e.g. Gmail app, Outlook (classic), Apple Mail, Thunderbird';
  app.value = state.mailApp || '';
  app.addEventListener('input', () => { state.mailApp = app.value; save(); });
  const gen = document.createElement('textarea');
  gen.rows = 3;
  gen.placeholder = 'Device, OS version, anything else';
  gen.value = state.general || '';
  gen.addEventListener('input', () => { state.general = gen.value; save(); });
  fsApp.append(lgApp, app, gen);
  root.append(fsApp);

  function text() {
    const out = [];
    out.push(`ParkStop spike results - ${pageTitle}`);
    out.push(`Date: ${new Date().toISOString()}`);
    out.push('');
    out.push('== Results ==');
    for (const t of tests) {
      out.push(`${t.label}: ${state['r-' + t.id] || 'not tested'}`);
      if ((state['n-' + t.id] || '').trim()) out.push(`   note: ${state['n-' + t.id].trim().replace(/\n/g, '\n         ')}`);
    }
    out.push(`Mail app used: ${(state.mailApp || '').trim() || '(not given)'}`);
    if ((state.general || '').trim()) out.push(`Remarks: ${state.general.trim()}`);
    out.push('');
    out.push('== Environment ==');
    out.push(getEnvText());
    out.push('');
    out.push('== Log ==');
    out.push(getLogText() || '(empty)');
    return out.join('\n');
  }

  copyBtn.addEventListener('click', async () => {
    const t = text();
    summaryEl.value = t;
    const r = await copyText(t);
    copyStatusEl.textContent = r.ok
      ? 'Copied. Paste it into the chat. (The text is also shown below.)'
      : `Copy failed (${r.error}). Select the text below and copy it manually.`;
  });

  return { text };
}
