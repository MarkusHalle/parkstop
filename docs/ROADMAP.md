# ParkStop —| workflow (10 agents, 2.48M agent tokens) ~31 min · ~40 % shared by 1.1, 1.2, 1.3, 1.6; O1 closed (D20) | ☑| workflow (10 agents, 2.48M agent tokens) ~31 min · ~40 % shared by 1.1, 1.2, 1.3, 1.6; 23 districts + FÖRI + 22 police records; 4 refuted rows taken from the sceptic's official corrections; FÖRI confirmed by the owner (D23) | ☑| workflow (10 agents, 2.48M agent tokens) ~31 min · ~40 % shared by 1.1, 1.2, 1.3, 1.6; 15 offences + Egyéb (D22); owner approved templates A and B (D20) | ☑ |||Roadmap

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
| 2.1 | App shell, layout (phone bottom sheet / PC side panel), theme tokens, `hu.ts` | 8, 9 | Sonnet · medium | implementer | 30 min · 8 % | | ☐ |
| 2.2 | Map, pin, geolocation, address search and reverse lookup | 4.1 | Sonnet · medium | implementer | 30 min · 8 % | | ☐ |
| 2.3 | Authority resolver (pure) + unit tests against the 30 test points. Inputs from M1: `budapest` outline + Margit-sziget rule, `districtActsOn` sections (VI, VII), confidence lowered when `partial && (!cutApplied \|\| cutApprox)`. To decide with the owner: the 1.5 reviewer's distance band — the 15 m snap catches ~4 % of residential street length at junctions, so beyond ~8 m keep FÖRI but lower confidence and name the district body | 4.2 | Opus · medium | implementer, sceptic (Fable · high) | 30 min · 10 % | | ☐ |
| 2.4 | Authority result card with alternatives and manual override | 4.2 | Sonnet · medium | implementer | 20 min · 5 % | | ☐ |
| 2.5 | Report form and validation | 4.3 | Sonnet · medium | implementer | 20 min · 5 % | | ☐ |
| 2.6 | Mail module: template, `mailto:` with length fallback, photo download and reduced clipboard copy, copy buttons + unit tests; check on the owner's phone that saved photos appear in Gmail's attach dialog (D15) | 4.5 | Opus · medium | implementer, reviewer | 40 min · 12 % | | ☐ |

Tasks 2.2, 2.3 and 2.6 touch separate folders and can run in parallel after 2.1.

Exit: a full report can be made end to end on PC and phone with one photo.

## M3 — Extras

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 3.1 | Photo EXIF: fill place and time | 4.4 | Sonnet · medium | implementer | 20 min · 5 % | | ☐ |
| 3.2 | Several photos, downscaling, size budget | 4.4 | Sonnet · medium | implementer | 20 min · 5 % | | ☐ |
| 3.3 | History in IndexedDB, list, duplicate, delete, export | 4.7 | Sonnet · medium | implementer | 30 min · 7 % | | ☐ |
| 3.4 | Settings: reporter details, address-lookup switch, plate-reader switch | 4.6, 4.9 | Sonnet · low | implementer | 15 min · 3 % | | ☐ |
| 3.5 | Plate reader: worker, model loading and caching, detect → crop (with margin, F-PLATE-9) → read, confidence gate, Hungarian format check (F-PLATE-8), pick-a-plate when several, confirm step in the form, fallback. Reuse `public/spikes/plate/pipeline.js` | 4.9 | Opus · high | implementer, reviewer (Opus · high) | 60 min · 18 % | | ☐ |
| 3.6 | Zoomable plate crop helper next to the "Rendszám" field (needed with or without the reader) | 4.9 | Sonnet · medium | implementer | 20 min · 5 % | | ☐ |

## M4 — Installable app and polish

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 4.1 | Manifest, icons, service worker, update prompt, offline shell | 4.8 | Sonnet · medium | implementer | 30 min · 7 % | | ☐ |
| 4.2 | "Adatkezelés" and help screens (Hungarian copy) | 10 | Opus · low | solo | 15 min · 4 % | | ☐ |
| 4.3 | Accessibility and responsive pass, error and empty states | 9 | Sonnet · medium | implementer, reviewer (Opus · medium) | 30 min · 8 % | | ☐ |

## M5 — Release

| # | Task | SPEC | Model · effort | Agents | Est. | Actual | Status |
|---|---|---|---|---|---|---|---|
| 5.1 | Playwright end-to-end tests incl. network allow-list check | 11 | Sonnet · medium | implementer | 30 min · 8 % | | ☐ |
| 5.2 | Whole-project review against the acceptance criteria | 11 | Opus · high + Fable sceptic | reviewer per area, sceptic per reviewer | 40 min · 25 % | | ☐ |
| 5.3 | GitHub repository, Pages deploy workflow, README | 8 | Sonnet · low | solo | 15 min · 3 % | | ☐ |
| 5.4 | Device test on the owner's phone and PC; fix what it finds | 11 | Sonnet · medium | solo | open | | ☐ |

## Backlog

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
