# ParkStop — Data sources and verification rules

The app is only as good as its bundled facts. This file says where each fact comes from and
how it is kept honest. Filled in during milestone M1.

## Rules

1. **Official sources only** for authority contacts: the body's own website, the district
   municipality's website, police.hu, fori.hu, or a published decree. Aggregators (Járókelő,
   directories, news) may point the way but are never the cited source.
2. **Every record carries `sourceUrl` and `verifiedOn`** (ISO date). No source → the field
   stays empty and the app shows "nincs ellenőrzött e-mail cím".
3. **Nothing is derived from a pattern.** An address such as `kozterulet@<district>.hu` is
   never assumed from other districts.
4. **Two passes.** A researcher collects; a sceptic re-opens every source and tries to
   prove the row wrong. Only rows that survive are committed.
5. **Staleness.** Records older than 12 months lower the confidence shown to the user.
   A script re-checks that each `sourceUrl` still loads and still contains the e-mail address.

## Sources found during planning (2026-11-11)

| Topic | Source | Note |
|---|---|---|
| Who patrols where | krk.kispest.hu/rolunk (Kispesti Rendészeti Központ) | States the general rule: FÖRI on capital-managed areas (mainly main roads, underpasses) and in districts without an own body; district bodies elsewhere; split set by agreements |
| Capital-managed roads | Government Decree 432/2012 (XII. 29.), annexes 1–2 — njt.jog.gov.hu/jogszabaly/2012-432-20-22 | In force version from 2024-11-01. Annexes list roads by name, some only between two junctions |
| Capital-managed network, map | budapestkozut.hu/kozut-figyelo | Budapest Közút's own map of the network it operates; useful to cross-check the built geometry |
| FÖRI | fori.hu | Central contact published on the site; the right channel for parking reports to be confirmed in M1 |
| District agreements | einfoszab.budapest.hu (Fővárosi Közgyűlés documents) | Four-party agreements per district (examples seen: V., VI., XIV.) change who acts where |
| Map tiles | openfreemap.org, openfreemap.org/tos | Free, no key, no limits; attribution to OpenStreetMap required |
| Address lookup | operations.osmfoundation.org/policies/nominatim | Max 1 request/second, identifying Referer, no bulk use, results cached |
| District boundaries, road geometry | OpenStreetMap via Overpass | ODbL; attribution "© OpenStreetMap contributors" |
| Plate reader models | github.com/ankandrew/fast-alpr, fast-plate-ocr, open-image-models (code: MIT) | See "Plate reader models" below |

## Plate reader models (spike S3, checked 2026-11-11)

| File | Source | Bytes | sha256 |
|---|---|---|---|
| Detector `yolo-v9-t-384-license-plates-end2end.onnx` | github.com/ankandrew/open-image-models/releases/download/assets/ | 7,771,218 | 888397b96d761c89db40bc9c305838e8652660f5e282c2cadebbe8d2951a77a8 |
| Reader `cct_xs_v2_global.onnx` | github.com/ankandrew/cnn-ocr-lp/releases/download/arg-plates/ (redirects to fast-plate-ocr) | 3,344,292 | 8031afb5fdc6b4d80462c9d542f1284ebd2cfddf5dbacd62609848d7e2855f44 |
| Reader config `cct_xs_v2_global_plate_config.yaml` | same release | 1,725 | 0335c74a305173bb6f393efed0fde03cadeaa0b649ed8e19f431016d8232d0a6 |
| Runtime `onnxruntime-web` 1.31.1 (WASM build) | npm, MIT (Microsoft) | 14,927,315 | — |

URLs were taken from the projects' own model-hub code by the spike agent; sizes and hashes are the agent's measurements.

Licence of the weights (read by the main session in the maintainer's own issue replies):

- **Reader:** "weights are MIT … you can use them commercially" — github.com/ankandrew/fast-plate-ocr/issues/99 (2026-10-20); "all custom fast-plate-ocr models weights are [MIT] too" — github.com/ankandrew/fast-alpr/issues/47.
- **Detector:** no formal licence. Trained and exported with a fork of WongKinYiu/yolov9, which is GPL-3.0; the maintainer writes he is "no legal expert to know whether that applies" and suggests retraining a detector if in doubt — github.com/ankandrew/open-image-models/issues/22, fast-alpr/issues/47. Training data: not formally documented. **Unresolved — see DECISIONS.md O5.**

## Authority directory (to be filled in M1)

| District | Body | E-mail | Source | Verified |
|---|---|---|---|---|
| I.–XXIII. | — | — | — | — |
| Capital | FÖRI | — | — | — |

## Legal references (to be filled in M1)

| Topic | Reference | Source | Verified |
|---|---|---|---|
| Stopping and waiting rules | KRESZ (1/1975. (II. 5.) KPM–BM) 40–41. § | — | — |
| Powers of public-space inspectors | 1999. évi LXIII. törvény | — | — |
| Petty-offence procedure, reports by citizens | 2012. évi II. törvény | — | — |
