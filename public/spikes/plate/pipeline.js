// ParkStop spike S3: number-plate reading pipeline.
//
// Pure module: no DOM, no fetch, no ONNX Runtime import. Image decoding happens in the
// caller; the ONNX Runtime `Tensor` class and the two sessions are injected. The same file
// runs in a browser worker and headless in Node.
//
// It mirrors the Python reference exactly as published by ankandrew:
//   open-image-models 0.6.0  detection/core/yolo_v9/{preprocess,postprocess,inference}.py
//   fast-plate-ocr 1.1.0     core/process.py, inference/plate_recognizer.py
//   fast-alpr 0.4.0          alpr.py, default_ocr.py (crop clamping, BGR->RGB for the OCR)
// The Python code works on BGR images from OpenCV; we work on RGBA and produce the same
// channel order the models receive (RGB).

/** Python 3 round(): ties go to the even integer. */
export function pyRound(x) {
  const r = Math.round(x);
  if (Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0) return r - 1;
  return r;
}

/**
 * Bilinear resize of a rectangle of an RGBA image into a packed RGB (3 bytes/pixel) buffer,
 * using OpenCV's INTER_LINEAR sampling: half-pixel centres, edge clamping inside the
 * rectangle, no anti-aliasing when shrinking. Output is rounded to uint8 like cv2.resize on
 * a uint8 image (OpenCV uses fixed-point maths, so a pixel may differ by 1).
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} img RGBA
 * @param {{x: number, y: number, w: number, h: number}} rect source rectangle (integers)
 * @param {number} dw output width
 * @param {number} dh output height
 * @returns {Uint8Array} RGB, length dw*dh*3
 */
export function resizeRectToRGB(img, rect, dw, dh) {
  const { data, width } = img;
  const { x: rx, y: ry, w: sw, h: sh } = rect;
  const out = new Uint8Array(dw * dh * 3);
  const sx = sw / dw;
  const sy = sh / dh;
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  const ax = new Float32Array(dw);
  for (let dx = 0; dx < dw; dx++) {
    let fx = (dx + 0.5) * sx - 0.5;
    let ix = Math.floor(fx);
    fx -= ix;
    if (ix < 0) { ix = 0; fx = 0; }
    if (ix >= sw - 1) { ix = sw - 1; fx = 0; }
    x0[dx] = (rx + ix) * 4;
    x1[dx] = (rx + Math.min(ix + 1, sw - 1)) * 4;
    ax[dx] = fx;
  }
  let o = 0;
  for (let dy = 0; dy < dh; dy++) {
    let fy = (dy + 0.5) * sy - 0.5;
    let iy = Math.floor(fy);
    fy -= iy;
    if (iy < 0) { iy = 0; fy = 0; }
    if (iy >= sh - 1) { iy = sh - 1; fy = 0; }
    const row0 = (ry + iy) * width * 4;
    const row1 = (ry + Math.min(iy + 1, sh - 1)) * width * 4;
    const by = fy;
    for (let dx = 0; dx < dw; dx++) {
      const a = ax[dx];
      const p00 = row0 + x0[dx], p01 = row0 + x1[dx];
      const p10 = row1 + x0[dx], p11 = row1 + x1[dx];
      for (let c = 0; c < 3; c++) {
        const top = data[p00 + c] + (data[p01 + c] - data[p00 + c]) * a;
        const bot = data[p10 + c] + (data[p11 + c] - data[p10 + c]) * a;
        const v = top + (bot - top) * by;
        out[o++] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Detector (open-image-models yolo-v9-*-license-plate-end2end)

/** Letterbox geometry exactly as open_image_models yolo_v9/preprocess.py letterbox(). */
export function letterboxParams(srcW, srcH, size) {
  const r = Math.min(size / srcH, size / srcW);
  const newW = pyRound(srcW * r);
  const newH = pyRound(srcH * r);
  const dw = (size - newW) / 2;
  const dh = (size - newH) / 2;
  const top = pyRound(dh - 0.1);
  const left = pyRound(dw - 0.1);
  return { r, newW, newH, dw, dh, top, left, size };
}

/**
 * Detector input: letterbox to size x size (pad value 114), RGB, /255, float32 NCHW.
 * @returns {{data: Float32Array, dims: number[], lb: object}}
 */
export function detectorPreprocess(img, size) {
  const lb = letterboxParams(img.width, img.height, size);
  const rgb = resizeRectToRGB(img, { x: 0, y: 0, w: img.width, h: img.height }, lb.newW, lb.newH);
  const plane = size * size;
  const data = new Float32Array(3 * plane).fill(114 / 255);
  for (let y = 0; y < lb.newH; y++) {
    for (let x = 0; x < lb.newW; x++) {
      const s = (y * lb.newW + x) * 3;
      const d = (y + lb.top) * size + (x + lb.left);
      data[d] = rgb[s] / 255;
      data[plane + d] = rgb[s + 1] / 255;
      data[2 * plane + d] = rgb[s + 2] / 255;
    }
  }
  return { data, dims: [1, 3, size, size], lb };
}

/**
 * Detector output "output0" has shape [N, 7]: [batch_index, x1, y1, x2, y2, class_id, score]
 * in letterboxed input pixels (NMS is inside the model, hence "end2end"). Boxes are mapped
 * back with (v - pad) / ratio and truncated to int, as yolo_v9/postprocess.py does.
 */
export function detectorPostprocess(output, dims, lb, confThresh) {
  const n = dims[0];
  const stride = dims[1];
  const f = Math.fround;
  const res = [];
  for (let i = 0; i < n; i++) {
    const o = i * stride;
    const score = output[o + 6];
    if (score < confThresh) continue;
    // Python writes the mapped values back into the float32 array before int().
    const x1 = Math.trunc(f((output[o + 1] - lb.dw) / lb.r));
    const y1 = Math.trunc(f((output[o + 2] - lb.dh) / lb.r));
    const x2 = Math.trunc(f((output[o + 3] - lb.dw) / lb.r));
    const y2 = Math.trunc(f((output[o + 4] - lb.dh) / lb.r));
    res.push({ box: { x1, y1, x2, y2 }, detScore: score, classId: Math.trunc(output[o + 5]) });
  }
  return res;
}

/** Crop rectangle as fast_alpr/alpr.py: clamp to the image, then img[y1:y2, x1:x2]. */
export function cropRect(box, width, height) {
  const x1 = Math.max(box.x1, 0);
  const y1 = Math.max(box.y1, 0);
  const x2 = Math.min(box.x2, width);
  const y2 = Math.min(box.y2, height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---------------------------------------------------------------------------------------
// OCR (fast-plate-ocr cct-*-v2-global-model)

/**
 * OCR input as fast_plate_ocr/core/process.py resize_image() + preprocess_image():
 * resize the crop to img_width x img_height (linear; letterbox with padding_color only if
 * keep_aspect_ratio), RGB or grayscale per config, uint8 NHWC [1, H, W, C].
 * No normalisation: the model rescales internally.
 */
export function ocrPreprocess(img, rect, cfg) {
  const H = cfg.img_height;
  const W = cfg.img_width;
  const gray = cfg.image_color_mode === 'grayscale';
  let rgb;
  if (!cfg.keep_aspect_ratio) {
    rgb = resizeRectToRGB(img, rect, W, H);
  } else {
    const r = Math.min(H / rect.h, W / rect.w);
    const nw = pyRound(rect.w * r);
    const nh = pyRound(rect.h * r);
    const inner = resizeRectToRGB(img, rect, nw, nh);
    const top = pyRound((H - nh) / 2 - 0.1);
    const left = pyRound((W - nw) / 2 - 0.1);
    const pc = cfg.padding_color ?? [114, 114, 114];
    const pad = Array.isArray(pc) ? pc : [pc, pc, pc];
    rgb = new Uint8Array(W * H * 3);
    for (let i = 0; i < W * H; i++) rgb.set(pad, i * 3);
    for (let y = 0; y < nh; y++) {
      rgb.set(inner.subarray(y * nw * 3, (y + 1) * nw * 3), ((y + top) * W + left) * 3);
    }
  }
  if (!gray) return { data: rgb, dims: [1, H, W, 3] };
  // cv2.COLOR_BGR2GRAY on the crop: 0.299 R + 0.587 G + 0.114 B, rounded.
  const g = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    g[i] = Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]);
  }
  return { data: g, dims: [1, H, W, 1] };
}

/**
 * Decode the "plate" output [1, max_plate_slots, alphabet_len] (already softmaxed by the
 * model): argmax per slot, strip trailing pad chars. Per-slot confidence = max probability,
 * reported for all slots (pad slots included), as fast-plate-ocr does.
 */
export function ocrDecode(plateOut, cfg, regionOut) {
  const slots = cfg.max_plate_slots;
  const alphabet = cfg.alphabet;
  const V = alphabet.length;
  let text = '';
  const charConfidences = [];
  for (let s = 0; s < slots; s++) {
    let best = 0;
    let bestP = -Infinity;
    for (let k = 0; k < V; k++) {
      const p = plateOut[s * V + k];
      if (p > bestP) { bestP = p; best = k; }
    }
    text += alphabet[best];
    charConfidences.push(bestP);
  }
  let end = text.length;
  while (end > 0 && text[end - 1] === cfg.pad_char) end--;
  text = text.slice(0, end);
  const meanConf = charConfidences.reduce((a, b) => a + b, 0) / charConfidences.length;
  const minConf = Math.min(...charConfidences);
  let region = null;
  let regionConf = null;
  if (regionOut && cfg.plate_regions && cfg.plate_regions.length) {
    let bi = 0;
    for (let k = 1; k < regionOut.length; k++) if (regionOut[k] > regionOut[bi]) bi = k;
    region = cfg.plate_regions[bi];
    regionConf = regionOut[bi];
  }
  return { text, charConfidences, meanConf, minConf, region, regionConf };
}

// ---------------------------------------------------------------------------------------
// Orchestrator

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Detect plates, crop, read each one.
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} image RGBA
 * @param {{detector: object, ocr: object, Tensor: Function, detSize: number, ocrConfig: object}} sessions
 *   detector/ocr are ONNX Runtime InferenceSession objects (web or node), Tensor is ort.Tensor.
 * @param {{confThresh?: number, timings?: object}} [opts] confThresh defaults to 0.4
 *   (fast-alpr's detector default). If `timings` is given it is filled with ms values.
 * @returns {Promise<Array<{box, detScore, text, charConfidences, meanConf, minConf, region, regionConf}>>}
 */
export async function readPlates(image, sessions, opts = {}) {
  const { detector, ocr, Tensor, detSize, ocrConfig } = sessions;
  const confThresh = opts.confThresh ?? 0.4;
  const t = opts.timings ?? {};
  if (!(image.width > 0 && image.height > 0) || image.data.length < image.width * image.height * 4) {
    throw new Error('readPlates: empty or truncated RGBA image');
  }
  const t0 = nowMs();

  const pre = detectorPreprocess(image, detSize);
  const t1 = nowMs();
  const detIn = detector.inputNames[0];
  const detOutName = detector.outputNames[0];
  const detOut = await detector.run({ [detIn]: new Tensor('float32', pre.data, pre.dims) });
  const out0 = detOut[detOutName];
  const t2 = nowMs();
  const dets = out0.dims[0] > 0 ? detectorPostprocess(out0.data, out0.dims, pre.lb, confThresh) : [];
  disposeAll(detOut);

  const results = [];
  let ocrMs = 0;
  for (const d of dets) {
    const rect = cropRect(d.box, image.width, image.height);
    if (!rect) continue;
    const s = nowMs();
    const inp = ocrPreprocess(image, rect, ocrConfig);
    const outs = await ocr.run({ [ocr.inputNames[0]]: new Tensor('uint8', inp.data, inp.dims) });
    const plateOut = (outs.plate ?? outs[ocr.outputNames[0]]).data;
    const regionOut = outs.region ? outs.region.data : null;
    const dec = ocrDecode(plateOut, ocrConfig, regionOut);
    disposeAll(outs);
    ocrMs += nowMs() - s;
    results.push({ box: d.box, crop: rect, detScore: d.detScore, ...dec });
  }
  const t3 = nowMs();
  t.detPre = t1 - t0;
  t.detRun = t2 - t1;
  t.detect = t2 - t0;
  t.ocr = ocrMs;
  t.total = t3 - t0;
  return results;
}

function disposeAll(outs) {
  for (const k of Object.keys(outs)) outs[k]?.dispose?.();
}

// ---------------------------------------------------------------------------------------
// Display helpers (never change characters, only add separators)

/** For comparisons: upper case, without spaces, hyphens and dots. */
export function normalizePlate(s) {
  return String(s ?? '').toUpperCase().replace(/[\s\-‐-―·.]/g, '');
}

/**
 * Hungarian display format: old ABC123 -> "ABC-123", new (2022-) ABCD123 -> "AB CD-123",
 * anything else unchanged. Only separators are inserted.
 */
export function formatHungarianPlate(text) {
  const t = String(text ?? '');
  if (/^[A-Z]{3}[0-9]{3}$/.test(t)) return `${t.slice(0, 3)}-${t.slice(3)}`;
  if (/^[A-Z]{4}[0-9]{3}$/.test(t)) return `${t.slice(0, 2)} ${t.slice(2, 4)}-${t.slice(4)}`;
  return t;
}
