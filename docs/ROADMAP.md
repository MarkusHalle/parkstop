# ParkStop — Roadmap

Status key: ☐ not started · ◐ in progress · ☑ done · ✖ dropped

Each task names the SPEC sections it implements and the recommended model and effort
(see [ORCHESTRATION.md](ORCHESTRATION.md) for the reasoning). "Est." is the estimate given
before the task; "Actual" is filled in afterwards so later estimates can be calibrated.
Estimates below are first guesses — there is no history for this project yet.

Usage is given as a share of the 5-hour limit on the current plan (Max).

## M0 — Foundations and spikes

Goal: remove the two biggest unknowns before building anything.

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 0.1 | Spec, roadmap, orchestration docs, agent definitions | all | Fable · medium | solo | — | ~11 min · ~6 % | ☑ |
| 0.2 | Mockups approved by the user — 12 screens on the design canvas: https://claude.ai/artifact/TGi7LWwGTjWmZ7eZ469cMt | 3, 9 | Fable · medium | solo | — | ~10 min · ~6 % | ☑ |
| 0.3 | `git init`, Vite + React + TS scaffold, lint, Vitest, CI workflow | 8 | Sonnet · low | agent + main-session check | 10 min · 3 % | ~3 min · ~2 % | ☑ |
| 0.4 | **Spike S1:** one-page test of Web Share with a photo on the owner's phone (which mail app, does the text land in the body) | 4.5, R2 | Sonnet · medium | agent + main-session check | 10 min · 2 % + user test | page built ~4 min · ~3 % (with 0.5); owner tested 2026-11-12 — Gmail ignores subject and recipient from the share sheet (D14) | ☑ |
| 0.5 | **Spike S2:** `mailto:` and `.eml` test on the owner's PC mail program | 4.5, R6 | Sonnet · medium | agent + main-session check | 10 min · 2 % + user test | page built (see 0.4); owner tested 2026-11-12 — `mailto:` works, `.eml` untestable without a desktop mail program (D11) | ☑ |
| 0.6 | **Spike S3:** run the fast-alpr ONNX models in the browser on ~20 of the owner's plate photos; measure exact-read rate, time on the phone, download size; confirm model licences | 4.9, R7 | Opus · high | agent + main-session browser check | 40 min · 12 % + user photos | page built ~25 min agent time (311k agent tokens) + ~7 min rework (378k); owner's 20 photos: 18/20 exact on PC and phone (D16), phone 0.76 s median (D19), opt-in instead of size limit (D17) — gate passed | ☑ |

Exit: scaffold builds; S1, S2 and S3 results recorded in [DECISIONS.md](DECISIONS.md); SPEC 4.5 adjusted if a hand-off does not work; SPEC 4.9 kept or replaced by the manual zoom helper according to the S3 gate.

## M1 — Data and legal ground truth

Goal: the facts the app stands on, each with a source.

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 1.1 | Legal research: who may act on a citizen's photo report, what the report must contain, correct addressee (resolves O1) | 4.2, R1 | Opus · high | researcher, then sceptic (Fable · high) | 25 min · 15 % | Workflow for 1.1–1.3 + 1.6 (10 agents, 2.48M agent tokens): ~31 min · ~40 % in total. O1 closed (D20) | ☑ |
| 1.2 | Authority directory: 23 districts + FÖRI + district police stations, with source and date | 5 | Sonnet · medium | 3 researchers in parallel (districts I–VIII, IX–XVI, XVII–XXIII), then sceptic spot-check (Opus · medium) | 30 min · 20 % | Shared workflow (see 1.1). 23 districts + FÖRI + 22 police records; sceptic corrections used for III, IX, XV, XXI; FÖRI confirmed by the owner (D23) | ☑ |
| 1.3 | District agreements: which districts have no own body, which also act on capital roads | 4.2, 5 | Opus · high | researcher + sceptic | 20 min · 10 % | Shared workflow (see 1.1) + VI/VII list researcher ~10 min (219k) + Fable sceptic ~12 min (262k), ~8 %. All 23 districts have an own body; capital-road rule per district (D21); VI (14) and VII (20) `districtActsOn` sections CONFIRMED on the agreement page images; 14 districts not read (O7) | ☑ |
| 1.4 | `districts.geojson` build script (OSM, simplified) | 5 | Sonnet · medium | implementer | 15 min · 4 % | ~17 min agent time over 3 rounds (105k agent tokens) · ~3 %; 47 KB → 57 KB with the Budapest outline; max border deviation 4.4 m. Margit-sziget and the Danube channels around it lie in Budapest but in no district (Mötv. 22. § (4)) — resolver rule decided: FÖRI (D21) | ☑ |
| 1.5 | `capital-roads.geojson`: parse Decree 432/2012 annexes, match to OSM geometry, flag partial sections | 5, R4 | Opus · high | implementer, reviewer (Fable · high) | 45 min · 20 % | Build ~26 min (327k) + Fable review ~17 min (286k) + fix round ~13 min: ~56 min agent time, ~1.1M agent tokens, ~18 %. 1332 decree rows (incl. 71a, 138a), 1297 matched (127 whole, 1070 cut of which 47 `cutApprox`, 100 uncut), 35 unmatched against a committed expected list; 727 KB. Review: accept with fixes — all applied except the 2/179 Kunigunda útja cut (stays uncut) | ☑ |
| 1.6 | Offence list with KRESZ references; final Hungarian e-mail wording | 6, 7 | Opus · medium | researcher; user reads the final text | 20 min · 8 % | Shared workflow (see 1.1). 15 offences + Egyéb (D22); owner read and approved e-mail templates A and B (D20) | ☑ |
| 1.7 | 30 human-reviewed test points (fixture for acceptance criterion 1) | 11 | Sonnet · medium | implementer; user confirms | 15 min · 4 % | ~3 min solo (Opus) · ~2 %: `scripts/make-test-points.mjs` → `tests/fixtures/authority-test-points.json` (30 points, 8 categories); `tests/data/test-points.test.ts` checks the data agrees (31 tests pass). Owner confirmed all 30 on 2026-11-12 | ☑ |

Tasks 1.1, 1.2, 1.3 and 1.6 run together as one workflow (D18): five researchers (Opus for 1.1, 1.3, 1.6; Sonnet for the two halves of 1.2), each followed by a Fable sceptic — 10 agents. Script ready, start after the 5-hour reset. The researchers only return data; the main session writes `src/data/` from the verified rows. Tasks 1.4, 1.5 and 1.7 follow afterwards.

Exit: data files pass the validation script; O1 closed in DECISIONS.md; user has read the e-mail template.

## M2 — Core flow

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 2.1 | App shell, layout (phone bottom sheet / PC side panel), theme tokens, `hu.ts` | 8, 9 | Sonnet · medium | implementer | 30 min · 8 % | ~12 min solo (Opus): `hu.ts` (all M2 strings), theme tokens light/dark, bundled fonts (D26), phone sheet / PC panel shell, step history for the back button, contracts for 2.2/2.3/2.6 | ☑ |
| 2.2 | Map, pin, geolocation, address search and reverse lookup | 4.1 | Sonnet · medium | implementer | 30 min · 8 % | Sonnet implementer ~4 min (101k agent tokens) + main-session fixes: MapLibre worker (D27), Hungarian map labels, phone padding/attribution. Hosts checked: only tiles.openfreemap.org and nominatim.openstreetmap.org | ☑ |
| 2.3 | Authority resolver (pure) + unit tests against the 30 test points. Inputs from M1: `budapest` outline + Margit-sziget rule, `districtActsOn` sections (VI, VII), confidence lowered when `partial && (!cutApplied \|\| cutApprox)`. To decide with the owner: the 1.5 reviewer's distance band — the 15 m snap catches ~4 % of residential street length at junctions, so beyond ~8 m keep FÖRI but lower confidence and name the district body | 4.2 | Opus · medium | implementer, sceptic (Fable · high) | 30 min · 10 % | Opus implementer ~4.5 min (112k): all 30 owner points pass, ~0.2 ms per resolve; band and border neighbour per D24/D25. Fable sceptic ~15 min (192k): 1 High (slivers between district polygons resolved as Margit-sziget), 2 Medium (same street listed under two districts; tunnel treated as surface road), 5 Low — all fixed by the main session (~5 min, D30), 6 regression tests added | ☑ |
| 2.4 | Authority result card with alternatives and manual override | 4.2 | Sonnet · medium | implementer | 20 min · 5 % | ~6 min solo (Opus), in `src/app/AuthorityCard.tsx` (D26) | ☑ |
| 2.5 | Report form and validation | 4.3 | Sonnet · medium | implementer | 20 min · 5 % | ~6 min solo (Opus), `src/report/` + 14 unit tests (plate format, validation) | ☑ |
| 2.6 | Mail module: template, `mailto:` with length fallback, photo download and reduced clipboard copy, copy buttons + unit tests; check on the owner's phone that saved photos appear in Gmail's attach dialog (D15) | 4.5 | Opus · medium | implementer, reviewer | 40 min · 12 % | Opus implementer ~3.5 min (102k) + Opus reviewer ~4 min (123k): no High; fixes applied (per-photo failure, honest save message, clipboard gesture, focus, lone surrogates, 1.5 MB target). Limit 4 000 (D29). M2 so far in total: ~25 min, ~20 % of the 5-hour window | ☑ |

Tasks 2.2, 2.3 and 2.6 touch separate folders and can run in parallel after 2.1.

Exit: a full report can be made end to end on PC and phone with one photo.

## M3 — Extras

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 3.1 | Photo EXIF: fill place and time | 4.4 | Sonnet · medium | implementer | 20 min · 5 % | Pulled into the M2 session at the owner's request, ~10 min solo (Opus), ~4 % with the foldable sheet. Position part dropped after the owner's phone test: Android removes GPS from photos a browser receives (D33, D34). What remains: the capture time fills Időpont („a fotóból”) | ☑ |
| 3.2 | Several photos, downscaling, size budget | 4.4 | Sonnet · medium | implementer | 20 min · 5 % | ~5 min solo (Opus) in the M3 session. 1–5 photos (most of it existed since M2), reorder with ‹ › buttons and order numbers, `.cr2`/HEIC left out with a message; e-mail set kept under a 7 MB budget (≈ 9.4 MB once encoded) by `reduceAll` stepping the largest photo down 2000 → 1600 → 1280 px; total size shown on the mail screen (D35) | ☑ |
| 3.3 | History in IndexedDB, list, duplicate, delete, export | 4.7 | Sonnet · medium | implementer | 30 min · 7 % | Sonnet implementer ~2 min (89k agent tokens) + main-session wiring ~5 min: `idb` store, list per mockup 06, open, duplicate, delete one/all, JSON export with photos and settings; autosave on step changes and when the page is hidden (D36). Checked in the browser: save, reload, reopen, duplicate, delete | ☑ |
| 3.4 | Settings: reporter details, address-lookup switch, plate-reader switch | 4.6, 4.9 | Sonnet · low | implementer | 15 min · 3 % | Sonnet implementer ~1.5 min (85k) + wiring: page per mockup 07, profile → e-mail signature, address-lookup switch turns off reverse lookup and search (F-MAP-4), plate-reader switch, export / delete everything. Batch 3.2–3.4 in total: ~10 min wall-clock, ~2 % of the 5-hour window (76 → 78 %) | ☑ |
| 3.5 | Plate reader: worker, model loading and caching, detect → crop (with margin, F-PLATE-9) → read, confidence gate, Hungarian format check (F-PLATE-8), pick-a-plate when several, confirm step in the form, fallback. Reuse `public/spikes/plate/pipeline.js` | 4.9 | Opus · high | implementer, reviewer (Opus · high) | 60 min · 18 % | Opus implementer ~22 min (295k agent tokens) with 3.6, ~6 % (78 → 84 %): TS port of the spike pipeline (identical outputs, tested against `pipeline.js`), module worker, models in `public/models/`, runtime vendored in `public/vendor/ort/` (moved with `git mv`), Cache Storage, opt-in, pick-a-plate, confirm gate, fallback (D37). Main-session browser check: nothing fetched before „Igen, kérem”, only localhost; IDD-373 suggested, three-plate picker, „Jó” → megerősítve. Opus reviewer ~6.5 min (181k): 0 High, 3 Medium, 10 Low — all fixed by the implementer (~11 min, 384k). Accuracy pass on the owner's 38 photos (~6 min solo): five crop widths, a read is offered only when two agree — 40 right / 0 wrong of 46 plates, DR VA-023 now read (D38); then empty detections ignored and a zoomed second search when nothing is found (~12 min solo): 42 right / 0 wrong, AI LN-271 and PAW-132 now read (D39) | ☑ |
| 3.6 | Zoomable plate crop helper next to the "Rendszám" field (needed with or without the reader) | 4.9 | Sonnet · medium | implementer | 20 min · 5 % | Built with 3.5 by the same agent (`src/plate/ZoomView.tsx`): pinch, drag, wheel, +/−, keyboard, photo switcher; starts on the detected crop | ☑ |

## M4 — Installable app and polish

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 4.0 | Restyle away from the generic AI-app look: font, palette, cards (D40) | 9 | Opus · medium | solo | 30–45 min · 8–12 % | Added at the owner's request before 4.1. Main session, solo: research, three directions, BudapestGO study, six colour combinations, three button variants, then tokens and styles; ~17 min · ~2 % | ☑ |
| 4.0b | Branding: logo mark, wordmark, favicon, app icons, interface icons redrawn (D41) | 9 | Opus · medium | solo | 30–40 min · ~5 % | Side session from the main session. Research, then five rounds of previews (4 directions → 4 no-stopping-sign variants → 10 iterations → 6 sign-and-pin hybrids → 10 illegal-parking ideas → 10 ideas from the inconvenienced person's side → 4 refinements of M3); masters in `docs/brand/`, PNGs in `public/icons/` by `scripts/render-icons.mjs`; ~24 min wall-clock including the owner's answers; 5-hour window at 8 % at the end | ☑ |
| 4.1 | Manifest (icons ready in `public/icons/`, 4.0b), service worker, update prompt, offline shell | 4.8 | Sonnet · medium | implementer | 20 min · 5 % | Sonnet implementer ~3 min (96k agent tokens): `vite-plugin-pwa` (prompt updates), manifest with relative scope, precache = app shell (26 files, ~3.1 MB; no models/vendor/spikes), update toast, offline banner, `preview:lan`. Review fixes by the main session: toast clears the phone page buttons, hourly and on-foreground update check, explicit 4 MiB precache limit, manifest text from `hu.ts` (D42). Browser check: service worker active, app opens with the server stopped, update toast → "Frissítés" loads the new version. Owner's phone (Brave, 2026-11-13): installs and opens in Airplane mode with the offline banner — over plain http with Brave's "insecure origins treated as secure" flag, because Chromium refuses a service worker on a self-signed certificate (no issue on GitHub Pages) | ☑ |
| 4.2 | "Adatkezelés" and help screens (Hungarian copy); help opened from a ? icon in the header (owner) | 10 | Opus · low | solo | 15 min · 4 % | ~10 min solo (Opus): `src/help/` — Súgó (7 sections, oldest data date) and Adatkezelés (own host shown at runtime + the two SPEC 10 hosts); wired into the header and Settings (D44). Opus reviewer checked the privacy text against every network call and store: true | ☑ |
| 4.3 | Accessibility and responsive pass, error and empty states | 9 | Sonnet · medium | implementer, reviewer (Opus · medium) | 30 min · 8 % | Sonnet implementer ~9 min (239k): one `main` per view, h1 per view with focus moved to it, live regions, Escape for sheet and zoom, 44 px targets, `aria-describedby` on errors, reduced motion, 3 contrast fixes, map-failure and search-unavailable empty states, history empty state. Opus reviewer ~3 min (125k): 0 High, 2 Medium, 4 Low — all fixed by the main session (~4 min). Lighthouse not installed; own DOM audit at 375 px / 1280 px in both themes | ☑ |
| 4.4 | Light / Dark / Automatic selector at the top of Settings; the map switches to OpenFreeMap's `dark` style (same host) — added at the owner's request with the M4 mockups | 9 | Sonnet · medium | implementer | 10 min · 3 % | Sonnet implementer ~3 min (109k): `theme` setting, `data-theme` on `<html>` before first render, segmented radio group, `setStyle` liberty ↔ dark with capital roads re-added on `style.load` (D43); review fix: no style swap while offline | ☑ |

## M5 — Release

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 5.0 | Settle O5, the plate detector's licence, before any public deploy: research, options, owner's decision, licence files (D45) | 4.9 | Opus · high + Fable sceptic | 2 research agents (Opus), sceptic | not given in advance | Side session from the main session. ~29 min wall-clock incl. the owner's answers; 3 agents (~495k agent tokens: legal 143k, alternatives 149k, sceptic 203k); 5-hour window at 38 % at the end. Sceptic refuted the first recommendation (manual framing). Owner chose: keep the detector as GPL-3.0 with its source, ParkStop GPL-3.0-or-later. Added `LICENSE`, `THIRD-PARTY-NOTICES.md`, `public/models/LICENSE-GPL-3.0.txt`, `LICENSE-fast-alpr.txt`, `public/models/source/` (fork code + `.pt`, ~10.7 MB, not precached) | ☑ |
| 5.0b | Licence on the live site: a "Licenc és forráskód" line in Help linking the source repository and `THIRD-PARTY-NOTICES`; repository link in `public/models/README.md`; check whether OpenFreeMap's styles need an OpenMapTiles credit next to the OSM one | 9, 10 | Sonnet · low | solo | Done in the M5 session, solo, ~5 min: Help has a "Licenc és forráskód" section and links to the repository and THIRD-PARTY-NOTICES; repository link in `public/models/README.md`; OpenMapTiles credit added to THIRD-PARTY-NOTICES (the map credit already names it) | ☑ |
| 5.1 | Playwright end-to-end tests incl. network allow-list check | 11 | Sonnet · medium | implementer | 1 Sonnet implementer, ~9 min, 163k agent tokens (~5 % of the window). 6 tests (main flow, offline start, network allow-list × phone and PC), all third-party hosts mocked, `e2e` CI job; later a 7th/8th test for the handed-report copy (D47). ~25 s per run, no flakes in 4 runs | ☑ |
| 5.2 | Whole-project review against the acceptance criteria | 11 | Opus · high + Fable sceptic | reviewer per area, sceptic per reviewer | Workflow run over two windows (paused overnight): 5 Opus reviewers, 5 Fable sceptics, 5 Sonnet fixers = 15 agents, ~920k agent tokens, ~22 min agent time; plus an Opus reviewer on the resolver changes (77k, no regressions). 32 findings: 27 confirmed, all fixed or decided by the owner (D47); 4 plausible (2 fixed: update reload, copy announcements; 2 left: plate-cache notice, persistent storage); 1 refuted. Usage ~30 % of a 5-hour window, ~6 % weekly, ~8 % Fable weekly. Then authority-1 (owner: map them now): Opus researcher ~20 min, 630k tokens over two rounds, placed 10 of 35 rows; Fable sceptic ~9 min, 201k, refuted 2 rows and the 15 m spill around areas; fixed (areas count only inside or within 2 m). Whole 5.2 incl. follow-ups: ~2.3M agent tokens, ~45 % of a 5-hour window over two windows, weekly 22 % → ~31 % | ☑ |
| 5.3 | GitHub repository, Pages deploy workflow, README | 8 | Sonnet · low | solo | Prepared, solo, ~10 min: `.github/workflows/deploy.yml`, README, `docs/DEPLOY.md`; base-path build checked; git history checked for personal data (clean). D46. Waiting for the owner to create the repository | ◐ |
| 5.4 | Device test on the owner's phone and PC; fix what it finds | 11 | Sonnet · medium | solo | open | | ☐ |

## Backlog

- Hyphens for Dutch plates read by the plate reader (VS608S → VS-608-S); only separators, from the Dutch side-code patterns
- English interface toggle
- Android app (Capacitor) for complete drafts with recipient
- Ready-made draft file (`.eml`) for desktop mail programs — builder and self-check kept in `public/spikes/mail/`
- Public launch: first-run intro, extended privacy notice
- Yearly authority-data check script wired into CI
- Follow-up reminder for unanswered reports

## Change log

| Date | Change |
|---|---|
| 2026-11-11 | Roadmap created. Decisions D1–D8 recorded. |
| 2026-11-11 | On-device plate reader added (D9): spike 0.6, tasks 3.5 and 3.6, settings switch in 3.4. |
| 2026-11-12 | Spike S2 done (D11). `.eml` draft file dropped from v1 and moved to the backlog (D13); task 2.6 adjusted. |
| 2026-11-12 | Spike S1 done (D14). Phone uses the complete `mailto:` draft plus manual photo attachment, no share sheet (D15); task 2.6 adjusted. |
| 2026-11-12 | Spike S3 done: plate reader passes its gate and stays in v1 as opt-in (D16, D17, D19). **M0 complete.** M1 workflow ready, waiting for the owner (D18). |
| 2026-11-12 | **M1 complete.** Data files pass `validate:data`; O1 closed (D20); owner read the e-mail templates and confirmed the 30 test points. Decisions D20–D23; new open points O7, O8. |
| 2026-11-12 | **M2 complete.** Owner made a full report end to end on PC and phone with one photo; saved photos appear in Gmail's attach dialog (D15). Whole M2: ~35 min wall-clock, ~25 % of the 5-hour window (39 % → ~64 %), 5 agents (~630k agent tokens). Decisions D24–D31; witness sentence removed from both e-mails (D31). |
| 2026-11-12 | Photo position dropped (D34): Android strips GPS from photos given to a browser. 3.1 reduced to the capture time. SPEC 0.7. |
| 2026-11-12 | M3: plate reader reads each plate at several crop widths and offers a read only when two agree (D38); SPEC 0.8 F-PLATE-9, owner approved. Then D39 (zoomed second search, empty detections ignored), SPEC 0.9. |
| 2026-11-12 | **M3 complete.** Owner tested on the phone: several photos, history, settings, plate reader from opt-in to confirmed plate ("works"). Whole M3: ~55 min of main-session time over two 5-hour windows, ~15 % in total (batch 3.2–3.4 ~2 %, plate reader + review + fixes ~10 %, accuracy work ~3 %); 5 agents (~1.1M agent tokens). Decisions D35–D39; SPEC 0.9. Blocker before public release: O5 (detector weights licence). |
| 2026-11-13 | M4 built (4.1–4.4, 4.4 added at the owner's request: Light / Dark / Automatic and a dark map). Decisions D42–D44; SPEC 0.10. ~75 min wall-clock incl. the owner's answers, 5-hour window 4 % → ~17 % (~13 %), 5 agents (~690k agent tokens). **M4 complete:** owner installed it on the phone and opened it offline. Fix from the phone test: the map hint sat over the legend (centred on the visible map now) |
| 2026-11-13 | O5 closed (D45): the plate detector stays and ships as GPL-3.0 with its source in `public/models/source/`; ParkStop is GPL-3.0-or-later (`LICENSE`, `THIRD-PARTY-NOTICES.md`). Task 5.0 done; 5.0b added (licence line and source link on the site). O3 notes that the source must be public for a public site. |
