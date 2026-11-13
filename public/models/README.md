# Plate reader model files

Used by the app's plate reader (`src/plate/worker.ts`, SPEC 4.9) and by the spike page
(`public/spikes/plate/`). Moved here from `public/spikes/plate/models/` in roadmap task 3.5.
The ONNX Runtime Web build they run on is in `public/vendor/ort/` (1.31.1, CPU/WASM, MIT).

Downloaded 2026-11-11 from the URLs the projects' own model-hub code uses
(`open_image_models/detection/core/hub.py`, `fast_plate_ocr/inference/hub.py`). Not modified,
except that the reader config is also stored as JSON for the browser.

| File | Source URL | Bytes | sha256 |
|---|---|---|---|
| `yolo-v9-t-384-license-plates-end2end.onnx` (plate detector) | https://github.com/ankandrew/open-image-models/releases/download/assets/yolo-v9-t-384-license-plates-end2end.onnx | 7771218 | 888397b96d761c89db40bc9c305838e8652660f5e282c2cadebbe8d2951a77a8 |
| `cct_xs_v2_global.onnx` (plate reader) | https://github.com/ankandrew/cnn-ocr-lp/releases/download/arg-plates/cct_xs_v2_global.onnx (redirects to the fast-plate-ocr releases) | 3344292 | 8031afb5fdc6b4d80462c9d542f1284ebd2cfddf5dbacd62609848d7e2855f44 |
| `cct_v2_global_plate_config.yaml` (reader config) | https://github.com/ankandrew/cnn-ocr-lp/releases/download/arg-plates/cct_xs_v2_global_plate_config.yaml | 1725 | 0335c74a305173bb6f393efed0fde03cadeaa0b649ed8e19f431016d8232d0a6 |
| `cct_v2_global_plate_config.json` | the YAML above converted with `yaml.safe_load` + `json.dump` | 1250 | (derived) |

## Plate detector: GPL-3.0 and its source (D45)

ParkStop treats the detector `yolo-v9-t-384-license-plates-end2end.onnx` as covered by the
**GNU General Public License v3** (full text: `LICENSE-GPL-3.0.txt` in this folder). It was trained
and exported by ankandrew with [ankandrew/yolov9](https://github.com/ankandrew/yolov9), a fork of
[WongKinYiu/yolov9](https://github.com/WongKinYiu/yolov9) (GPL-3.0, which itself contains code from
Ultralytics YOLOv5, GPL-3.0 at the time). Whether the GPL reaches trained weights is legally
untested; ParkStop follows it anyway.

The source of the detector is kept here, next to the model, as GPL-3.0 section 6 asks. ParkStop's
own source, these files included, is public at <https://github.com/justaguyulove/parkstop> (D46):

| File in `source/` | What it is | Source URL | Bytes | sha256 |
|---|---|---|---|---|
| `ankandrew-yolov9-2bac800.zip` | The training and export code (fork at commit `2bac800489567ad3f078cbdc161f51904c15c255`, 2024-09-21, its latest) | https://github.com/ankandrew/yolov9/archive/2bac800489567ad3f078cbdc161f51904c15c255.zip | 2344472 (see note) | 0b375ead71bd674aa85ed704812c08c9510911124b77bb09455091a2c7aa88ee |
| `yolo-v9-t-384-license-plates.pt` | The trained PyTorch checkpoint the ONNX file was exported from (training options stripped before release, so the starting weights are not recorded) | https://github.com/ankandrew/open-image-models/releases/download/assets/yolo-v9-t-384-license-plates.pt | 8320608 | 4d525da3ebe44fb6e6bfe8b05ca717b777db3feb2b44b472250f8b32f4754fdb |

Note: GitHub builds archive zips on request; a fresh download of the same commit can differ in
bytes. The sha256 above is of the copy kept here (downloaded 2026-11-13).

The training data is described only in the maintainer's issue replies and is not published as
a set: about 11k images "mostly from free/open datasets" ([#14](https://github.com/ankandrew/open-image-models/issues/14)); the set of
[ankandrew/LocalizadorPatentes](https://github.com/ankandrew/LocalizadorPatentes) is "most of what I have used"
([#9](https://github.com/ankandrew/open-image-models/issues/9)); UFPR-ALPR was not used ([#24](https://github.com/ankandrew/open-image-models/issues/24)).

## Licences

- **Detector weights** (`yolo-v9-t-384-…onnx`): no licence file from the author. His own part:
  "from my end everything is MIT and you can use commercially" ([open-image-models#20](https://github.com/ankandrew/open-image-models/issues/20)),
  "On my end code is MIT and data no problem" ([#29](https://github.com/ankandrew/open-image-models/issues/29)); on the GPL question he
  is "no legal expert" ([#22](https://github.com/ankandrew/open-image-models/issues/22)). Shipped under GPL-3.0 as above.
- **Reader weights** (`cct_xs_v2_global.onnx`): MIT, according to the maintainer in
  [fast-plate-ocr#99](https://github.com/ankandrew/fast-plate-ocr/issues/99), [fast-alpr#47](https://github.com/ankandrew/fast-alpr/issues/47) and [open-image-models#20](https://github.com/ankandrew/open-image-models/issues/20); the training data is
  a custom set plus synthetic plates, not published.
- **Code** of open-image-models, fast-plate-ocr and fast-alpr (whose pre- and post-processing
  `src/plate/pipeline.ts` ports): MIT, see `LICENSE-open-image-models.txt`,
  `LICENSE-fast-plate-ocr.txt` and `LICENSE-fast-alpr.txt`.

All third-party parts of ParkStop are listed in `THIRD-PARTY-NOTICES.md` at the root of the
source repository.
