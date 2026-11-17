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
- **Detector:** no formal licence. Trained and exported with a fork of WongKinYiu/yolov9, which is GPL-3.0; the maintainer writes he is "no legal expert to know whether that applies" and suggests retraining a detector if in doubt — github.com/ankandrew/open-image-models/issues/22, fast-alpr/issues/47. **Shipped as GPL-3.0 with its source (D45).**

### Detector licence, re-checked 2026-11-13 (O5 → D45)

Facts, each re-opened by a Fable sceptic:

- **No licence added since.** open-image-models: `LICENSE` is MIT (code); the `assets` release body is only "Model repository."; no model licence file — api.github.com/repos/ankandrew/open-image-models, accessed 2026-11-13.
- **The author's own part is MIT:** "from my end everything is MIT and you can use commercially … However, the YOLOv9 models here I guess depends if [WongKinYiu/yolov9's] license applies" — github.com/ankandrew/open-image-models/issues/20 (2026-06-08); "On my end code is MIT and data no problem" — issues/29 (2026-10-06).
- **Asked often, answered the same way:** 17 licence questions across his three repositories since June 2026; newer ones are closed as duplicates. The question "trained from scratch or fine-tuned from pretrained YOLOv9?" (issues/22, 2026-10-24; issues/28) has no answer.
- **The `.pt` checkpoint is published** in the same `assets` release (8,320,608 bytes). Read on 2026-11-13 as raw pickle opcodes, never loaded: model config `gelan-t.yaml`, class `models.yolo.DetectionModel`; `opt`, `git` and `date` are empty (stripped), so the starting weights are not recorded.
- **Training data:** about 11k images "mostly from free/open datasets" (issues/14); the LocalizadorPatentes set is "most of what I have used" (issues/9); UFPR-ALPR not used (issues/24). Not published as a set.
- **Upstream code:** github.com/ankandrew/yolov9 (GPL-3.0, last commit 2bac800, 2024-09-21) forks WongKinYiu/yolov9 (GPL-3.0), which contains Ultralytics YOLOv5 code. YOLOv9's authors also publish an MIT reimplementation, github.com/MultimediaTechLab/YOLO.
- **GPL-3.0 text** (gnu.org/licenses/gpl-3.0.txt): §2 — the output of running a covered work is covered only if the output itself constitutes a covered work; private use without conveying is unrestricted. §0 — serving files to visitors is conveying. §6(d) — object code served from a network place needs the source offered with clear directions. §8 — a first violation is cured within 30 days of notice.

Opinion and open law (not legal advice):

- No court has ruled that weights trained with GPL code are GPL, and no enforcement over such weights was found. The strongest argument that the GPL applies: the end2end ONNX graph is traced from the GPL model code. Untested.
- Whether weights are copyright works at all is unsettled: Hungarian Szjt. 1.§(3) and 4.§(1) protect a work from an author's own intellectual activity; Getty Images v Stability AI (UK) is on appeal, with no judgment yet as of 2026-11-13.

Alternatives looked at (2026-11-13): no ready-made browser plate detector is clean on weights, training code and data together. OpenCV Zoo LPD-YuNet has Apache-2.0 weights but undocumented Chinese training data; an Apache-2.0 RT-DETR plate model on Open Images is 80 MB with weak scores. The clean path, if ever needed: train YOLOv9-t with MultimediaTechLab/YOLO (MIT) on Open Images "Vehicle registration plate" (annotations CC BY 4.0, images CC BY 2.0 with attribution), about 2–3 working days.

## Authority directory (M1, verified 2026-11-12)

Source of truth: `src/data/authorities.json` (this table is generated from it). Every row was found
by a researcher and re-opened by a sceptic (Sonnet researchers, Fable sceptics, D18), except where
D23 says otherwise. All 23 districts run their own body. Notes in brackets are shown to the user.

Known weak spots, to watch at the yearly refresh:

- **Police mailboxes** (`NNrk@budapest.police.hu`) are each printed on their own police.hu page, but
  they are general mailboxes; e-mail acceptance of a *feljelentés* is unconfirmed (D20).
- **General addresses only:** X. (`hivatal@kobanya.hu` — the body asks for reports by phone),
  XVI. (`info@bp16.hu`), VIII. (`info@…`). Dedicated report/dispatcher addresses: V., VI., VII., IX., XIII.
- **Not 24 h:** XVI., XVII., XVIII., XIX. phone lines (hours in the phone note).
- **Hard to re-check automatically:** fori.hu (Cloudflare, 403), police.hu (timeouts),
  terezvaros.hu / bp18.hu / rakosmente.hu (JavaScript pages), cseri21.hu (HTTPS broken — http only),
  budafokteteny.hu (page "frissítés alatt"). The staleness script must allow a manual check for these.

| District | Type | Body | E-mail | Phone | Source | Verified |
|---|---|---|---|---|---|---|
| Capital | fori | Fővárosi Önkormányzati Rendészeti Igazgatóság (FÖRI) | fori@fori.hu (központi cím) | +36 1 301 7500 | [fori.hu](https://fori.hu/) | 2026-11-12 |
| I. | district | Budavári Rendészet | budavarirendeszet@budavar.hu (a rendészet általános címe) | +36 1 225 7271 | [budavar.hu](https://budavar.hu/institutions/kozterulet-felugyeleti-iroda/) | 2026-11-12 |
| II. | district | Városrendészeti Osztály (II. kerületi Polgármesteri Hivatal) | kozterulet@masodikkerulet.hu (szabálysértési, szabályszegési ügyek címe) | +36 80 204 965 | [masodikkerulet.hu](https://masodikkerulet.hu/varosuzemeltetes/kapcsolatfelvetel) | 2026-11-12 |
| III. | district | Óbuda-Békásmegyer Közterület-felügyelet | ugyfelszolgalat@obkf.hu (bejelentési cím) | +36 1 453 2618 | [obkf.hu](https://obkf.hu/kapcsolat/) | 2026-11-12 |
| IV. | district | Újpesti Önkormányzati Rendészet | ujpest.rendeszet@ujpest.hu (a rendészet hivatali címe) | +36 70 452 0590 | [ujpest.hu](https://ujpest.hu/szervezeti-egysegek/) | 2026-11-12 |
| V. | district | Belváros-Lipótváros Közterület-felügyelet | diszpecser@belvaros-lipotvaros.hu (diszpécserszolgálat, bejelentésekhez) | +36 1 872 7610 | [www.belvaros-lipotvaros.hu](https://www.belvaros-lipotvaros.hu/blkf_kapcsolat) | 2026-11-12 |
| VI. | district | Terézvárosi Rendészet (Terézvárosi Polgármesteri Hivatal) | ugyelet.kozter@terezvaros.hu (ügyeleti cím) | +36 1 279 2470 | [terezvaros.hu](https://terezvaros.hu/kapcsolat) | 2026-11-12 |
| VII. | district | Erzsébetváros Rendészeti Igazgatósága (ERI) | diszpecser@evkf.hu (diszpécserszolgálat, bejelentésekhez) | +36 1 461 9040 | [erzsebetvaros.hu](https://erzsebetvaros.hu/page/erzsebetvaros-rendeszeti-igazgatosaga) | 2026-11-12 |
| VIII. | district | Józsefvárosi Rendészet | info@jozsefvarosirendeszet.hu (általános cím) | +36 80 204 618 | [rendeszet.jozsefvaros.hu](https://rendeszet.jozsefvaros.hu/kapcsolat/) | 2026-11-12 |
| IX. | district | Ferencvárosi Közterület-felügyelet (Közterület-felügyeleti Iroda) | kozter@ferencvaros.hu (bejelentésekhez is használható cím) | +36 80 399 999 | [ferencvaros.hu](https://ferencvaros.hu/polgarmesteri-hivatal/szervezeti-egysegek/kozterulet-felugyeleti-iroda/22) | 2026-11-12 |
| X. | district | Kőbányai Közterület-felügyelet | hivatal@kobanya.hu (a polgármesteri hivatal általános címe; a felügyelet a lakossági bejelentéseket telefonon kéri) | +36 30 606 4712 | [www.kobanya.hu](https://www.kobanya.hu/?module=news&action=show&nid=180288) | 2026-11-12 |
| XI. | district | Újbudai Közterület-felügyelet | kozteruletfelugyelet@ujbudakf.hu (a felügyelet címe) | +36 70 684 8857 | [ubkf.ujbuda.hu](https://ubkf.ujbuda.hu/) | 2026-11-12 |
| XII. | district | Hegyvidéki Rendészet | kozteruletfelugyelet@hegyvidek.hu (a rendészet címe (parkolási ügyekben is)) | +36 30 623 9973 | [hegyvidek.hu](https://hegyvidek.hu/elet-a-hegyvideken/kozbiztonsag) | 2026-11-12 |
| XIII. | district | Budapest Főváros XIII. Kerületi Közterület-felügyelet | ktf-ugyelet@bp13.hu (ügyeleti cím) | +36 1 773 1313 | [www.budapest13.hu](https://www.budapest13.hu/kozterulet-felugyelet/) | 2026-11-12 |
| XIV. | district | Zuglói Önkormányzati Rendészet | ugyfelszolgalat@zugloirendeszet.hu (ügyfélszolgálati cím) | +36 1 211 2233 | [www.zuglo.hu](https://www.zuglo.hu/zugloi-onkormanyzati-rendeszet/) | 2026-11-12 |
| XV. | district | Önkormányzati Rendészet (XV. kerületi Polgármesteri Hivatal) | rendeszet@bpxv.hu (a rendészet címe) | +36 1 305 3147 | [www.bpxv.hu](https://www.bpxv.hu/varoshaza/polgarmesteri-hivatal/szervezeti-egysegek/onkormanyzati-rendeszet) | 2026-11-12 |
| XVI. | district | Közterület-felügyeleti Iroda (XVI. kerületi Polgármesteri Hivatal) | info@bp16.hu (a polgármesteri hivatal általános címe) | +36 1 401 1450 | [www.bp16.hu](https://www.bp16.hu/polgarmesteri-hivatal-elerhetosege-ugyfelfogadasi-rend) | 2026-11-12 |
| XVII. | district | Rákosmente Közterület-felügyelete | kozterulet-felugyelet@rakosmente.hu (a felügyelet címe) | +36 20 210 9625 | [www.rakosmente.hu](https://www.rakosmente.hu/static-pages/koezteruelet-feluegyelet-1) | 2026-11-12 |
| XVIII. | district | Városrendészet18 Osztály (Pestszentlőrinc-Pestszentimre) | varosrendeszet18@bp18.hu (a városrendészet címe (munkaidőben)) | +36 1 294 1011 | [www.bp18.hu](https://www.bp18.hu/pestszentlorincpestszentimre/a-hivatal/a_kozteruletfelugyelet_varosrendeszet18_osztaly) | 2026-11-12 |
| XIX. | district | Kispesti Rendészeti Központ | rendeszet@krk.kispest.hu (a központ általános címe) | +36 1 347 4900 | [krk.kispest.hu](https://krk.kispest.hu/kapcsolat/) | 2026-11-12 |
| XX. | district | Pesterzsébeti Közterület-felügyelet (Rendvédelmi Osztály) | kozterulet-felugyelet@pesterzsebet.hu (a járőrszolgálat címe) | +36 20 255 5842 | [pesterzsebet.hu](https://pesterzsebet.hu/hova-fordulhatunk/) | 2026-11-12 |
| XXI. | district | Csepeli Városrendészeti Igazgatóság | rendeszet@cseri21.hu (a városrendészet címe) | +36 70 795 7014 | [cseri21.hu](http://cseri21.hu/) | 2026-11-12 |
| XXII. | district | Budafok-Tétény Közterület-felügyeleti Csoport | kozter@bp22.hu (a csoport címe) | +36 20 386 5942 | [www.budafokteteny.hu](https://www.budafokteteny.hu/ugyintezes/kozterulet-felugyelet) | 2026-11-12 |
| XXIII. | district | Rendészeti és Mezőőri Osztály (Soroksári Polgármesteri Hivatal) | rendeszet@ph.soroksar.hu (az osztály címe) | +36 30 978 7798 | [soroksar.hu](https://soroksar.hu/rendeszeti-es-mezoori-osztaly-978/) | 2026-11-12 |
| I. | police | BRFK I. kerületi Rendőrkapitányság | 01rk@budapest.police.hu (a kapitányság általános címe) | +36 1 457 5600 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/i-keruleti) | 2026-11-12 |
| II. | police | BRFK II. kerületi Rendőrkapitányság | 02rk@budapest.police.hu (a kapitányság általános címe) | +36 1 346 1800 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/ii-keruleti) | 2026-11-12 |
| III. | police | BRFK III. kerületi Rendőrkapitányság | 03rk@budapest.police.hu (a kapitányság általános címe) | +36 1 430 4700 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/iii-keruleti) | 2026-11-12 |
| IV. | police | BRFK IV. kerületi Rendőrkapitányság | 04rk@budapest.police.hu (a kapitányság általános címe) | +36 1 231 3400 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/iv-keruleti) | 2026-11-12 |
| V. | police | BRFK V. kerületi Rendőrkapitányság | 05rk@budapest.police.hu (a kapitányság általános címe) | +36 1 373 1000 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/v-keruleti) | 2026-11-12 |
| VI. | police | BRFK VI. kerületi Rendőrkapitányság | 06rk@budapest.police.hu (a kapitányság általános címe) | +36 1 461 8141 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/vi-keruleti) | 2026-11-12 |
| VII. | police | BRFK VII. kerületi Rendőrkapitányság | 07rk@budapest.police.hu (a kapitányság általános címe) | +36 1 461 8100 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/vii-keruleti) | 2026-11-12 |
| VIII. | police | BRFK VIII. kerületi Rendőrkapitányság | 08rk@budapest.police.hu (a kapitányság általános címe) | +36 1 477 3700 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/viii-keruleti) | 2026-11-12 |
| IX. | police | BRFK IX. kerületi Rendőrkapitányság | 09rk@budapest.police.hu (a kapitányság általános címe) | +36 1 455 4800 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/ix-keruleti) | 2026-11-12 |
| X. | police | BRFK X. kerületi Rendőrkapitányság | 10rk@budapest.police.hu (a kapitányság általános címe) | +36 1 263 7200 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/x-keruleti) | 2026-11-12 |
| XI. | police | BRFK XI. kerületi Rendőrkapitányság | 11rk@budapest.police.hu (a kapitányság általános címe) | +36 1 381 4300 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xi-keruleti) | 2026-11-12 |
| XII. | police | BRFK XII. kerületi Rendőrkapitányság | 12rk@budapest.police.hu (a kapitányság általános címe) | +36 1 457 5650 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xii-keruleti) | 2026-11-12 |
| XIII. | police | BRFK XIII. kerületi Rendőrkapitányság | 13rk@budapest.police.hu (a kapitányság általános címe) | +36 1 236 2800 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xiii-keruleti) | 2026-11-12 |
| XIV. | police | BRFK XIV. kerületi Rendőrkapitányság | 14rk@budapest.police.hu (a kapitányság általános címe) | +36 1 461 8150 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xiv-keruleti) | 2026-11-12 |
| XV. | police | BRFK XV. kerületi Rendőrkapitányság | 15rk@budapest.police.hu (a kapitányság általános címe) | +36 1 231 3450 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xv-keruleti) | 2026-11-12 |
| XVI. | police | BRFK XVI. kerületi Rendőrkapitányság | 16rk@budapest.police.hu (a kapitányság általános címe) | +36 1 491 8400 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xvi-keruleti) | 2026-11-12 |
| XVII. | police | BRFK XVII. kerületi Rendőrkapitányság | 17rk@budapest.police.hu (a kapitányság általános címe) | +36 1 443 5000 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xvii-keruleti) | 2026-11-12 |
| XVIII. | police | BRFK XVIII. kerületi Rendőrkapitányság | 18rk@budapest.police.hu (a kapitányság általános címe) | +36 1 292 9200 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xviii-keruleti) | 2026-11-12 |
| XIX. | police | BRFK XIX. kerületi Rendőrkapitányság | 19rk@budapest.police.hu (a kapitányság általános címe) | +36 1 292 9250 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xix-keruleti) | 2026-11-12 |
| XX., XXIII. | police | BRFK XX. és XXIII. kerületi Rendőrkapitányság | 20rk@budapest.police.hu (a kapitányság általános címe (a Soroksári Rendőrőrsé is)) | +36 1 421 1800 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xx-es-xxiii-keruleti) | 2026-11-12 |
| XXI. | police | BRFK XXI. kerületi Rendőrkapitányság | 21rk@budapest.police.hu (a kapitányság általános címe) | +36 1 427 4600 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xxi-keruleti) | 2026-11-12 |
| XXII. | police | BRFK XXII. kerületi Rendőrkapitányság | 22rk@budapest.police.hu (a kapitányság általános címe) | +36 1 491 8300 | [www.police.hu](https://www.police.hu/hu/ugyintezes/szerv/orszagos-rendor-fokapitanysag/budapesti-rendor-fokapitanysag/xxii-keruleti) | 2026-11-12 |

### Who acts on capital-managed roads (task 1.3)

`capitalRoads` in `districtRules` = who handles parking enforcement on capital-managed roads in that
district (D21). `verified` = read in the agreement or termination text; `inferred` = read from the
agreement's task list or the body's own statement; `none` = agreement text not read (O7).

| District | capitalRoads | Basis | Agreement |
|---|---|---|---|
| I. | fori | inferred | FPH015/2-7/2014 (2014-05-21), approved 16/2014. (I. 29.) Főv. Kgy. h.; amended by 1626/2021. (X. 27.) (Vérmező, Tabán park to the district). II.1 subtasks on capital areas do not include KRESZ checks; FÖRI keeps annex 1 areas (Lánchíd, Alagút, Erzsébet híd, rakpart sections, Hegyalja út, underpasses). |
| II. | unknown | none | Agreement approved by 17/2014. (I. 29.) Főv. Kgy. h.; text not read. |
| III. | unknown | none | Agreement approved by 18/2014. (I. 29.) Főv. Kgy. h.; text not read. |
| IV. | unknown | none | Agreement approved by 4/2015. (I. 28.) Főv. Kgy. h.; text not read. |
| V. | fori | verified | FPH015/40-5/2014 terminated by the capital from 2022-01-01: 1206/2021. (VI. 14.) Főv. Kgy. határozat. No later agreement found. |
| VI. | both | verified | FPH015/36-5/2014, approved 142/2014. (II. 26.); amended by 676/2021. (III. 31.): the district body acts (incl. KRESZ checks, towing) only on an enumerated list of capital areas; FÖRI on all others. |
| VII. | both | verified | FPH015/44-6/2015, approved 249/2015. (III. 23.); amended by 677/2021. (III. 31.): the district body acts (incl. KRESZ checks) only on an enumerated list of capital areas; FÖRI on all others. 2025-05-21 district request for more FÖRI patrols: no outcome found. |
| VIII. | unknown | none | Agreement approved by 872/2014. (VI. 30.); text not read; body reorganised 2026-04-01. |
| IX. | both | verified | Approved by 230/2015. (II. 25.) (annex 2.c, einfoszab fileId 124440/124441); same list in Ferencváros decree 3/2014. (I. 28.) annex 1. II.1 l) KRESZ 40–41. § fines by the district body on 36 listed capital streets; 33 in `districtActsOn` (Ráday utca no longer a decree row; 2/441, 2/451 have no geometry); 2/431 Határ út and 2/466 Üllői út service road `narrower` (section ends not placed). Haller utca, Mester utca: subtasks only. FÖRI on all other capital roads. Checked 2026-11-17 (researcher + sceptic). |
| X. | fori | inferred | Approved by 143/2014. (II. 26.) (annex 3/c, fileId 118105): II.1 a)–l) subtasks incl. wheel clamps, no KRESZ sanctioning; excludes underpasses, Fehér út, airport road, Népliget. Checked 2026-11-17 (researcher + sceptic). |
| XI. | fori | inferred | Approved by 144/2014. (II. 26.) (annex 4/c, fileId 118110): II.1 a)–l) subtasks incl. wheel clamps on all capital areas, no KRESZ sanctioning; district decree 29/2015. (IV. 29.) 1. § (1) b) refers to it. Checked 2026-11-17 (researcher + sceptic). |
| XII. | fori | inferred | Approved by 145/2014. (II. 26.) (annex 5/c, fileId 118111): II.1 a)–l) subtasks incl. wheel clamps, no KRESZ sanctioning. Checked 2026-11-17 (researcher + sceptic). |
| XIII. | fori | inferred | FPH015/52-6/2014 (2014-10-10), approved 20/2014. (I. 29.). District performs II.1 a)–j) (incl. wheel clamps) on capital areas except underpasses, without KRESZ sanctioning; FÖRI tows. Amendment no. 1 approved 2026-10-30: from 2027-01-01 Carl Lutz rakpart and Szent István körút return fully to FÖRI. |
| XIV. | unknown | none | Agreement approved by 21/2014. (I. 29.); text not read. |
| XV. | unknown | none | Agreement approved by 873/2014. (VI. 30.); text not read. |
| XVI. | unknown | none | Agreement approved by 22/2014. (I. 29.); text not read. |
| XVII. | unknown | none | Agreement approved by 23/2014. (I. 29.); text not read. |
| XVIII. | unknown | none | Agreement approved by 24/2014. (I. 29.); district page says some capital tasks were taken over, not which. |
| XIX. | fori | inferred | Agreement approved by 874/2014. (VI. 30.); text not read. Kispesti Rendészeti Központ states its competence covers district-owned areas and FÖRI acts on capital-managed areas (krk.kispest.hu/rolunk). |
| XX. | unknown | none | Agreement approved by 25/2014. (I. 29.); text not read. |
| XXI. | unknown | none | Agreement approved by 146/2014. (II. 26.); text not read. |
| XXII. | unknown | none | Agreement approved by 26/2014. (I. 29.); local take-over decree 3/2014. (II. 11.) not read. |
| XXIII. | unknown | none | Agreement approved by 427/2014. (IV. 30.); text not read. |
Sources: the Fővárosi Közgyűlés approval decisions on net.jogtar.hu (Főv. Kgy. határozatok
2014–2015), agreement texts and proposals on einfoszab.budapest.hu (I, V, VI, VII, XIII read).
Margit-sziget belongs to no district: Mötv. 22. § (4), https://njt.jog.gov.hu/jogszabaly/2011-189-00-00.

## Capital-managed roads (task 1.5)

| Item | Source | Note |
|---|---|---|
| Road list | Korm. rendelet 432/2012. (XII. 29.) annexes 1–2, consolidated version in force from 2024-11-01 — https://njt.jog.gov.hu/jogszabaly/2012-432-20-22 (retrieved 2026-11-12) | Parsed verbatim to `scripts/data/decree-432-2012-roads.json` (1330 rows); 2. § 1.: both annexes are "fővárosi közutak" |
| Geometry | OpenStreetMap via Overpass (ODbL) | `scripts/build-capital-roads.mjs`; 1307 of 1332 rows matched (10 of them hand-placed, below), 25 listed as `unmatched` in the output (reviewed list: `scripts/data/capital-roads-expected-unmatched.json`); audit trail in `scripts/data/capital-roads-report.json` |
| Geometry completion (display only) | Same OSM data (cache of 2026-11-12), no new query | Written as separate `kind: 'link'` features that the map draws and the resolver ignores: they are **not used for responsibility** (D49). Where OSM gives a short stretch of a listed road another name or none (roundabout, square, bridge, junction piece), the row's pieces are joined over the shortest OSM carriageway path of at most 150 m that continues the road in line, stays in the district and follows no other street for more than 25 m (D49). Every added stretch is listed with its OSM way ids under `bridges` in the report (53 in 35 rows, 2.4 km, longest 120 m on 2026-11-13). Junction links: a row end that stops short of another capital row is joined to it over at most 25 m of OSM carriageway (`junctionLinks`, 186, 2.4 km). A section end "X úti felüljáró" on road X is the start of X's own bridge ways |

### Hand-placed rows (review finding authority-1, checked 2026-11-13)

Rows with no usable OSM name are placed on reviewed OSM element ids in
`scripts/data/capital-roads-osm-places.json` (each entry quotes the decree row and says why the
geometry is that place); the build fetches exactly those ids (Overpass, data of
2026-11-13). Squares and areas are written as their closed outline rings with kind `square` and
`area: true`; the resolver counts them only for a pin inside the polygon or within 2 m of its
outline (`AREA_SNAP_M`, so they do not spill 15 m into side streets) and gives FÖRI,
`bizonytalan` (SPEC 4.2.6). Unnamed connector roads
placed by judgement carry `cutApprox`, so they are `bizonytalan` too. Row 2/598 is matched by
the name rules through the alias "Feltáró út" (the Savoya Park access road).

| Row | Decree name (section) | OSM | How it is identified |
|---|---|---|---|
| 2/37 | Krisztina körút átkötő útjai (Krisztina körút – Sarló utca) | ways 24302455, 24302437 | the two ways ("útjai") from the node where Sarló utca begins to Krisztina körút |
| 2/364 | Blaha Lujza tér | relation 18790970 | multipolygon highway=pedestrian name=Blaha Lujza tér |
| 2/587 | Balatoni út - Budaörsi út átkötő útja (Budaörsi út – Balatoni út) | 19 ways, unnamed primary ref=7 | both carriageways from Balatoni út's north end to Budaörsi út |
| 2/598 | Savoya park feltáró útja (Hunyadi János út – Fehérvári út) | ways named "Feltáró út" | alias; runs beside OSM "Savoya Park" (building=retail, Hunyadi János út 19) |
| 2/705 | Lehel téri összekötő út (Lehel utca – Váci út) | 6 secondary ways named "Lehel tér" | link Lehel utca to Váci út; no separate Lehel tér row in XIII (sceptic correction) |
| 2/812 | Hubay Jenő tér | way 126097532 | area=yes highway=pedestrian name=Hubay Jenő tér |
| 2/890 | Ostoros út parkolója | 6 amenity=parking ways of site relation 21464148 | "Cinkota parkoló" P+R on Ostoros út, operator Budapest Közút Zrt. (name differs: judgement) |
| 2/1042 | Kőbánya-Kispest buszpályaudvar csatlakozó útjai (Lehel utca – Liszt Ferenc Repülőtérre vezető út) | ways 29893991, 133299535 | unclassified road from Lehel utca past the terminal to the airport road (sceptic correction) |
| 2/1198 | Híd utca (Bányalég utca – 6. sz. főút) | 7 ways, unnamed tertiary incl. bridge 27404790 | the only road from the Bányalég utca junction to road 6; no OSM way is named Híd utca |
| 2/1246 | Dózsa György utca (Majori út – Ültetvény utca) | 5 ways, unnamed tertiary | from the end of Majori út to Ültetvény utca, where OSM's named Dózsa György utca continues into XVIII |

Still unmatched after the review (reasons in the reviewed list): no OSM object for the place
(2/190, 2/525 bus garages; 2/1041 Kőbánya-Kispest bus station, so also 2/1043, 2/1057;
2/522 housing-estate roads; 2/1001 no bridge on Méta utca; 2/1163 several access roads; 2/396
"Névtelen utca"), the connection runs over other named streets (2/376, 2/441, 2/1015, 2/1051,
2/1100, 2/1174; 2/36: Orvos utca does not reach Krisztina körút in OSM), several candidate ways and no way to choose (2/265, 2/451, 2/509, 2/519
Népliget park roads with access=no, 2/848, 2/970), unclear identity (2/854; 2/872: OSM's
"Csöbör utca" runs on the city boundary but joins Árpádföldi út only through Timur utca — needs a
human check), and 2/1048 (same geometry as 2/1047).

## Legal references (M1, verified 2026-11-12)

| Topic | Reference | Source | Verified |
|---|---|---|---|
| Stopping and waiting rules | KRESZ (1/1975. (II. 5.) KPM–BM) 15. §, 17. § (1), 40–41. §, 51/A. §; consolidated text in force from 2026-04-11 | https://njt.jog.gov.hu/jogszabaly/1975-1-20-24 (cross-checked on net.jogtar.hu) | 2026-11-12 |
| Breach of KRESZ is a petty offence; inspectors may fine for 40–41. § | 2012. évi II. törvény (Szabs. tv.) 224. § (1)–(2) | https://net.jogtar.hu/jogszabaly?docid=a1200002.tv (in force from 2026-10-01) | 2026-11-12 |
| On-the-spot fine, also with the driver absent; needs own observation | Szabs. tv. 39. § (1)–(2), 99. § (1), 100. § | same | 2026-11-12 |
| Report (feljelentés) by anyone, its content, witness | Szabs. tv. 58. §, 63. § (1), 78. § (1)–(3), 80. §, 83. § (1) b) bb) | same | 2026-11-12 |
| A feljelentés needs no reporter name: 78. § (3) lists place, time, circumstances, evidence and the offender's known data; 80. § rejection grounds do not include an unnamed reporter | Szabs. tv. 78. § (2)–(3), 80. § | https://njt.jog.gov.hu/jogszabaly/2012-2-00-00 (in force from 2026-10-01) | 2026-11-14 |
| A public-interest report (közérdekű bejelentés, template A) from an unidentifiable person is not investigated, unless serious harm underlies it | 2023. évi XXV. törvény (Panasztv.) 4. § (3)–(4) | https://njt.jog.gov.hu/jogszabaly/2023-25-00-00 (in force from 2026-07-29) | 2026-11-14 |
| Keeper's strict liability does not cover stopping/waiting | 1988. évi I. törvény (Kkt.) 21. § (1); 410/2007. (XII. 29.) Korm. rendelet annexes | https://net.jogtar.hu/jogszabaly?docid=98800001.tv (also the version from 2026-12-31); https://net.jogtar.hu/jogszabaly?docid=a0700410.kor | 2026-11-12 |
| Powers of public-space inspectors | 1999. évi LXIII. törvény (Kftv.) 1. § (5), 7. §, 17/A. §, 20. § | https://net.jogtar.hu/jogszabaly?docid=99900063.tv | 2026-11-12 |
| Police report channel | police.hu "Beadványtétel"; form IN-100100 (petty-offence report, portal login) | https://www.police.hu/hu/ugyintezes/beadvanytetel | 2026-11-12 |
| Capital and districts; Margit-sziget | 2011. évi CLXXXIX. törvény (Mötv.) 22. § (4), 23. § (4)–(7) | https://njt.jog.gov.hu/jogszabaly/2011-189-00-00 (in force from 2026-10-01) | 2026-11-12 |
| Green areas (not KRESZ) | 10/2005. (III. 8.) Főv. Kgy. rendelet 6. § (13) | https://njt.jog.gov.hu/jogszabaly/2005-10-SP-5Y4191 | 2026-11-12 |
