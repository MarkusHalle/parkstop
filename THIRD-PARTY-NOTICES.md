# Third-party notices

ParkStop is free software under the GNU General Public License, version 3 or (at your option)
any later version; see [LICENSE](LICENSE). Copyright (C) 2026 the ParkStop authors.

ParkStop ships or uses the following third-party works. Each keeps its own licence.

## Plate reader models (`public/models/`, SPEC 4.9)

| Part | Author | Licence | Notes |
|---|---|---|---|
| Plate detector `yolo-v9-t-384-license-plates-end2end.onnx` | ankandrew ([open-image-models](https://github.com/ankandrew/open-image-models)); built on YOLOv9 by Chien-Yao Wang, I-Hau Yeh and Hong-Yuan Mark Liao ([WongKinYiu/yolov9](https://github.com/WongKinYiu/yolov9)), which contains code from Ultralytics YOLOv5 | Treated as **GPL-3.0** (D45) | No licence file from the author, who calls his own part MIT. Trained with a GPL-3.0 YOLOv9 fork. Source (training and export code, and the `.pt` checkpoint) in `public/models/source/`, GPL text in `public/models/LICENSE-GPL-3.0.txt`; details in `public/models/README.md` |
| Plate reader `cct_xs_v2_global.onnx` and its config | ankandrew ([fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr)) | MIT (maintainer's statement) | `public/models/LICENSE-fast-plate-ocr.txt` |
| Pre- and post-processing ported to `src/plate/pipeline.ts` | ankandrew (open-image-models, fast-plate-ocr, [fast-alpr](https://github.com/ankandrew/fast-alpr)) | MIT | `public/models/LICENSE-open-image-models.txt`, `LICENSE-fast-plate-ocr.txt`, `LICENSE-fast-alpr.txt` |

## ONNX Runtime Web (`public/vendor/ort/`)

ONNX Runtime Web 1.31.1 (WASM build), Copyright (c) Microsoft Corporation. MIT; see
`public/vendor/ort/LICENSE`.

## Fonts

Source Sans 3 (variable), by Adobe, bundled through `@fontsource-variable/source-sans-3` 5.3.1.
SIL Open Font License 1.1; the full text is in that package's `LICENSE` file.

## Map and geographic data

- **Map data:** © OpenStreetMap contributors, available under the Open Database License (ODbL)
  1.0, <https://www.openstreetmap.org/copyright>. The app shows "© OpenStreetMap közreműködők".
- **Map tiles and styles:** served by [OpenFreeMap](https://openfreemap.org) (`liberty` and `dark`
  styles), built from OpenStreetMap data in the [OpenMapTiles](https://openmaptiles.org) schema;
  the map credit names "© OpenMapTiles" next to OpenStreetMap and OpenFreeMap.
- **Bundled district boundaries and capital-road geometry** (`src/data/`): extracted from
  OpenStreetMap through Overpass (`scripts/build-districts.mjs`, `scripts/build-capital-roads.mjs`).
  © OpenStreetMap contributors, ODbL 1.0; as a derived database they stay under the ODbL.
- **Address lookup:** OpenStreetMap Nominatim, used live and optionally (not bundled).

## JavaScript libraries bundled into the app

| Package | Version | Licence |
|---|---|---|
| react, react-dom | 19.3.1 | MIT |
| maplibre-gl | 6.18.0 | BSD-3-Clause |
| exifr | 7.1.3 | MIT |
| idb | 8.0.4 | ISC |
| @turf/boolean-point-in-polygon, @turf/helpers, @turf/point-to-line-distance | 7.4.0 | MIT |
| workbox-window (and the Workbox service-worker runtime from vite-plugin-pwa) | 7.4.1 | MIT |

Full licence texts are in each package under `node_modules/`.

## Own work

The authority data in `src/data/` is compiled by ParkStop from the official sources listed in
`docs/DATA-SOURCES.md`. The "Leszúrva" brand mark and the icons are ParkStop's own drawings (D41).
