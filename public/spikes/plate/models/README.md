# Plate reader model files (spike S3)

Downloaded 2026-11-11 from the URLs the projects' own model-hub code uses
(`open_image_models/detection/core/hub.py`, `fast_plate_ocr/inference/hub.py`). Not modified,
except that the reader config is also stored as JSON for the browser.

| File | Source URL | Bytes | sha256 |
|---|---|---|---|
| `yolo-v9-t-384-license-plates-end2end.onnx` (plate detector) | https://github.com/ankandrew/open-image-models/releases/download/assets/yolo-v9-t-384-license-plates-end2end.onnx | 7771218 | 888397b96d761c89db40bc9c305838e8652660f5e282c2cadebbe8d2951a77a8 |
| `cct_xs_v2_global.onnx` (plate reader) | https://github.com/ankandrew/cnn-ocr-lp/releases/download/arg-plates/cct_xs_v2_global.onnx (redirects to the fast-plate-ocr releases) | 3344292 | 8031afb5fdc6b4d80462c9d542f1284ebd2cfddf5dbacd62609848d7e2855f44 |
| `cct_v2_global_plate_config.yaml` (reader config) | https://github.com/ankandrew/cnn-ocr-lp/releases/download/arg-plates/cct_xs_v2_global_plate_config.yaml | 1725 | 0335c74a305173bb6f393efed0fde03cadeaa0b649ed8e19f431016d8232d0a6 |
| `cct_v2_global_plate_config.json` | the YAML above converted with `yaml.safe_load` + `json.dump` | 1250 | (derived) |

## Licences

- **Reader weights** (`cct_xs_v2_global.onnx`): MIT, according to the maintainer's statements in
  [fast-plate-ocr#99](https://github.com/ankandrew/fast-plate-ocr/issues/99) and [fast-alpr#47](https://github.com/ankandrew/fast-alpr/issues/47); the training data is not documented.
- **Detector weights** (`yolo-v9-t-384-…onnx`): no formal licence. They were trained with a GPL-3.0 YOLOv9 fork
  ([open-image-models#22](https://github.com/ankandrew/open-image-models/issues/22)) on about 11k web images ([#14](https://github.com/ankandrew/open-image-models/issues/14)); whether GPL applies is unresolved.

The code of both projects is MIT: see `LICENSE-open-image-models.txt` and `LICENSE-fast-plate-ocr.txt`.
