// ParkStop spike S3: inference worker (module worker).
// Loads ONNX Runtime Web from ../../vendor/ort/ (no third-party requests) and the models from
// ../../models/ (the app's own copies, public/vendor/ort and public/models, shared with
// src/plate/ so the ~26 MB exist once), then runs pipeline.js on RGBA buffers sent by the page.
//
// Runtime: onnxruntime-web 1.31.1 (MIT, Microsoft), CPU/WASM build only:
//   ort.wasm.min.mjs + ort-wasm-simd-threaded.mjs + ort-wasm-simd-threaded.wasm
//
// Protocol
//   page -> {type:'load'}                                   worker -> {type:'loaded', info}
//   page -> {type:'read', id, width, height, buffer, confThresh, wideMargin?}
//                                                           worker -> {type:'result', id, plates, timings,
//                                                                      platesWide?, wideMs?}
//   With wideMargin ({x, y}) the same image is read a second time with the wider crop
//   (F-PLATE-9) so both can be compared on the same photos; `timings` cover the first read only.
//   any failure                                             worker -> {type:'error', id?, message}

import { readPlates } from './pipeline.js';

const DETECTOR = { file: 'yolo-v9-t-384-license-plates-end2end.onnx', size: 384 };
const OCR = { file: 'cct_xs_v2_global.onnx' };
const OCR_CONFIG = 'cct_v2_global_plate_config.json';
const BUNDLE = 'ort.wasm.min.mjs';

const base = new URL('../../', import.meta.url); // the site root that holds models/ and vendor/
let ort = null;
let sessions = null;

async function loadRuntime() {
  if (ort) return;
  ort = await import(new URL('vendor/ort/' + BUNDLE, base).href);
  ort.env.wasm.wasmPaths = new URL('vendor/ort/', base).href;
  // Multi-threaded WASM needs SharedArrayBuffer, i.e. a cross-origin-isolated page
  // (COOP/COEP headers), which GitHub Pages cannot send. Without it: one thread.
  ort.env.wasm.numThreads = self.crossOriginIsolated
    ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
    : 1;
  ort.env.wasm.proxy = false; // already off the main thread
}

async function fetchModel(file) {
  const url = new URL('models/' + file, base).href;
  const t = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { url, buf, fetchMs: performance.now() - t };
}

async function createSession(buf) {
  const t = performance.now();
  const s = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return { s, initMs: performance.now() - t };
}

async function load() {
  await loadRuntime();
  const cfgRes = await fetch(new URL('models/' + OCR_CONFIG, base).href);
  if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status} for ${OCR_CONFIG}`);
  const ocrConfig = await cfgRes.json();
  const detFile = await fetchModel(DETECTOR.file);
  const ocrFile = await fetchModel(OCR.file);
  const detS = await createSession(detFile.buf);
  const ocrS = await createSession(ocrFile.buf);
  sessions = { detector: detS.s, ocr: ocrS.s, Tensor: ort.Tensor, detSize: DETECTOR.size, ocrConfig };

  // Warm-up: the first run includes kernel preparation; measure it separately.
  const w = performance.now();
  const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(128), width: 64, height: 64 };
  await readPlates(blank, sessions, { confThresh: 0.4 });
  const c = ocrConfig;
  const ch = c.image_color_mode === 'grayscale' ? 1 : 3;
  const zeros = new Uint8Array(c.img_height * c.img_width * ch);
  const warmOut = await ocrS.s.run({ [ocrS.s.inputNames[0]]: new ort.Tensor('uint8', zeros, [1, c.img_height, c.img_width, ch]) });
  for (const k of Object.keys(warmOut)) warmOut[k].dispose?.();
  const warmupMs = performance.now() - w;

  const resources = performance
    .getEntriesByType('resource')
    .filter((r) => r.name.includes('/vendor/ort/') || r.name.includes('/models/'))
    .map((r) => ({
      name: r.name.split('/').pop(),
      transferSize: r.transferSize,
      encodedBodySize: r.encodedBodySize,
      decodedBodySize: r.decodedBodySize,
      durationMs: r.duration,
    }));

  return {
    ortVersion: ort.env.versions?.web ?? ort.env.versions?.common ?? 'unknown',
    bundle: BUNDLE,
    epRequested: 'wasm',
    epUsed: 'wasm',
    epNote: '',
    numThreads: ort.env.wasm.numThreads,
    crossOriginIsolated: self.crossOriginIsolated === true,
    models: [
      { role: 'detector', name: DETECTOR.file, bytes: detFile.buf.byteLength, fetchMs: detFile.fetchMs, initMs: detS.initMs, inputSize: DETECTOR.size },
      { role: 'ocr', name: OCR.file, bytes: ocrFile.buf.byteLength, fetchMs: ocrFile.fetchMs, initMs: ocrS.initMs },
    ],
    resources,
    warmupMs,
  };
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      const info = await load();
      self.postMessage({ type: 'loaded', info });
    } else if (msg.type === 'read') {
      if (!sessions) throw new Error('Models are not loaded');
      const image = { data: new Uint8ClampedArray(msg.buffer), width: msg.width, height: msg.height };
      const timings = {};
      const plates = await readPlates(image, sessions, { confThresh: msg.confThresh, timings });
      let platesWide = null;
      let wideMs = 0;
      if (msg.wideMargin) {
        const t = performance.now();
        platesWide = await readPlates(image, sessions, { confThresh: msg.confThresh, cropMargin: msg.wideMargin });
        wideMs = performance.now() - t;
      }
      self.postMessage({ type: 'result', id: msg.id, plates, timings, platesWide, wideMs });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: msg.id, message: e && e.message ? e.message : String(e) });
  }
};
