# ParkStop — Product Specification

Version 0.11 · 2026-11-13 · M5: a handed report is copied on its first change (4.7), PC map locked after step 1 and panel 400 px (9), OSM credit visible at start (F-MAP-1); earlier, M4: update prompt and offline banner (4.8), appearance setting with a dark map (9), help and privacy screens (10); earlier, M3: plate read at several crop widths, offered only when two agree; zoomed second search; empty detections ignored (4.9 F-PLATE-9, D38, D39); earlier: resolver distance band and border neighbour (4.2), mailto limit 4 000 (4.5), witness sentence removed (7, D31), photo position not used (3, 4.4, 11; D34)

ParkStop helps a person in Budapest report an illegally parked car: mark the spot on a map,
see which authority is responsible, add photos, and get a ready-to-send Hungarian e-mail.

This file is the single source of truth for **what** the app does. How the work is split and
tracked lives in [docs/ROADMAP.md](docs/ROADMAP.md); who builds it and with which model in
[docs/ORCHESTRATION.md](docs/ORCHESTRATION.md); why choices were made in
[docs/DECISIONS.md](docs/DECISIONS.md); where the data comes from in
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

---

## 1. Hard constraints (never break these)

| # | Constraint |
|---|---|
| C1 | **No cloud AI, no generative AI.** No LLM, no AI API, nothing that sends data to a model on a server. The authority, the e-mail text and every other result come from fixed rules, bundled data and templates. **One permitted exception:** the on-device number-plate reader (section 4.9) — open-source models that run inside the browser and only suggest a value the user confirms. |
| C2 | **No bills.** No paid API, no API key tied to a billing account, no server to rent. Everything runs in the browser and is served as static files. |
| C3 | **Free map provider.** OpenStreetMap data only; tiles from a provider that is free without registration. |
| C4 | **Hungarian first.** All interface text and every generated e-mail is Hungarian. Code, comments and docs are English. |
| C5 | **One codebase** for PC browser and phone (installable web app / PWA). |
| C6 | **Private by design.** No account, no backend, no analytics, no cookies. Photos and personal details never leave the device except inside the e-mail the user sends themselves. |
| C7 | **The app never sends anything.** It only prepares a draft; the user reviews and sends it from their own mail app. |

## 2. Users and scope

- **Now:** the owner, for personal use on a Windows PC and a phone.
- **Later:** the public. Therefore nothing personal is hard-coded; the reporter's details are entered in Settings and stored only on the device.
- **Area:** Budapest's 23 districts. A pin outside Budapest gets a clear "not supported" message.

### Non-goals (v1)

- Anything outside Budapest; private car parks, shopping-centre garages, motorways.
- Unpaid parking fees (pótdíj) — a different process and a different body.
- Sending e-mail from a server, tracking the authority's answer, user accounts, sync between devices.
- Publishing or sharing reports publicly.
- English interface, native store apps (both are in the backlog).

## 3. Core flow

1. **Hol? (Where)** — the user drops or drags a pin on the map, taps "Saját helyzetem", or searches an address. A photo does not place the pin (D34).
2. **Ki az illetékes? (Who is responsible)** — the app shows the responsible authority, the reason in one sentence, how sure it is, an alternative recipient, and when the data was last verified.
3. **Mi történt? (What happened)** — the user adds 1–5 photos; the app suggests the number plate it read from the photo and the user confirms or corrects it; then the type of offence, the time, an optional note.
4. **E-mail** — the app shows the finished Hungarian e-mail, saves the reduced photos, and opens the user's mail app with recipient, subject and text filled in; the user attaches the photos and sends.
5. **Előzmények (History)** — the report is saved on the device and can be reopened.

## 4. Functional requirements

### 4.1 Map and location (F-MAP)

- F-MAP-1 Map of Budapest using MapLibre GL JS with OpenFreeMap vector tiles. Visible "© OpenStreetMap" attribution.
- F-MAP-2 One draggable pin. Tap/click places it; drag moves it.
- F-MAP-3 "Saját helyzetem" button uses the browser's geolocation (only on tap, never automatically).
- F-MAP-4 Address search box and reverse lookup (pin → street address) through Nominatim, at most 1 request per second, only on explicit user action or after the pin has rested for 1 s. If the lookup fails or is switched off in Settings, the user types the address by hand.
- F-MAP-5 The address is always editable; the coordinates are always included in the e-mail.

### 4.2 Responsible authority (F-AUTH)

Deterministic resolver, pure function, fully unit-tested. Input: coordinates. Output: primary authority, alternatives, reason, confidence.

1. Not inside the Budapest outline → `outside` result.
2. District = point-in-polygon against the bundled district boundaries. A point inside the Budapest outline but in no district (Margit-sziget and the Danube channels around it, which the capital administers directly — Mötv. 22. § (4)) → primary **FÖRI**, confidence `valószínű`.
3. If the pin is within the snap distance (15 m) of a **capital-managed road** (roads listed in the annexes of Government Decree 432/2012 (XII. 29.)) → primary is **FÖRI**, unless the pin's road section is on the district's `districtActsOn` list (in v1: the sections the VI and VII agreements hand to the district body, which since 2021 includes KRESZ enforcement). Three listed entries cover only part of their decree row (VI Király utca even side, VI Nyugati tér street level, VII Erzsébet körút Dohány utca – Rákóczi út): there FÖRI stays primary, the district body is the first alternative and confidence is `bizonytalan`. The district agreements checked in M1 leave parking enforcement on capital roads with FÖRI everywhere else (DECISIONS D21). Distance band (owner, D24): when the nearest capital road is more than 8 m but at most 15 m away, FÖRI stays primary but confidence is `bizonytalan` and the card says a side-street car belongs to the district body (the first alternative). When several capital roads are equally near (within 1 m of the nearest), FÖRI wins if any of them is not on the `districtActsOn` list.
4. Otherwise → the district's own public-space enforcement body (közterület-felügyelet / önkormányzati rendészet). If the district has none → FÖRI. (In M1 all 23 districts have one.)
5. Always list the district police station as an alternative, and FÖRI or the district body as the other alternative. Within 30 m of a border with another district, that district's body is listed too (owner, D25).
6. Confidence is `biztos` (clear district street), `valószínű` (capital road within 8 m, Margit-sziget, or within 30 m of a district border), or `bizonytalan` (capital road 8–15 m away, capital-road section whose ends could not be placed on the map, square/park, data older than 12 months). The lowest applicable level wins.
7. The user can always switch to any alternative, or type a different address by hand.

The result card shows: name of the authority, one-sentence reason, confidence, e-mail address, phone, link to the official source, "utoljára ellenőrizve" date. When the car may still be there, the card suggests phoning the body's (dispatcher) number as the faster route; a patrol can only act while the car is on the spot. Where a body asks for reports by phone (X. district), the phone is shown first.

**Default recipient and what the e-mail is (O1, resolved in M1 — DECISIONS D20).** No authority can
fine on the strength of a citizen's photo alone: an on-the-spot fine (also in the driver's absence)
needs the enforcement officer's or police officer's own observation (Szabs. tv. 39. § (2), 99–100. §),
and the keeper's strict liability does not cover stopping or waiting (Kkt. 21. § (1)). Therefore:

- The **default recipient is the enforcement body** chosen above (district body or FÖRI). The e-mail
  is a *bejelentés*: a request to check and act (template A in section 7).
- The **district police station** is always offered as the alternative. Choosing it switches the
  e-mail to a formal *szabálysértési feljelentés* against an unknown offender (template B), the legal
  route for an after-the-fact report (Szabs. tv. 78. §). The app states that the police's formal
  electronic channel is form IN-100100 on ugyintezes.police.hu and that e-mail acceptance is not
  confirmed; BRFK itself is never the addressee.
- The app never promises or asks for a fine, never calls a message to an enforcement body a
  *feljelentés*, and never claims the keeper is liable.

### 4.3 Report form (F-FORM)

| Field | Rule |
|---|---|
| Photos | 1–5 images, from camera or gallery. Shown as thumbnails, removable, reorderable. On the phone they are added in step 2, not step 1: step 1 is the place only ("Saját helyzetem" as the main button), and step 2 opens with two large pictogram buttons, camera (opens the rear camera directly) and gallery, until the first photo is in; then small camera and "+" tiles follow the thumbnails (owner's option A, roadmap 6.5). The PC keeps its photo drop zone in step 1. |
| Rendszám | Required. Upper-cased, common Hungarian formats recognised (ABC-123, AA BB-123, AAAA-123), anything else accepted with a "külföldi / egyedi" note. Suggested by the plate reader (4.9) when available, always editable, and must be confirmed by the user before the e-mail step. |
| Szabálysértés típusa | Required. Fixed pick-list (section 6). |
| Időpont | Required. Defaults to the photo's timestamp, else now. |
| Jármű leírása | Optional (make, colour). |
| Megjegyzés | Optional free text, max 500 characters. |

### 4.4 Photos (F-PHOTO)

- F-PHOTO-1 Reads the capture time from EXIF on the device (library: `exifr`) and fills "Időpont" with it unless the user has changed the time. The GPS position is not used: Android removes it from photos a browser receives, from the gallery and the file manager alike (owner's test, D33/D34).
- F-PHOTO-2 Each photo is downscaled for the e-mail (long edge max 2000 px, JPEG ~85 %, target ≤ 1.5 MB each) so the whole message stays under 10 MB. The original file is never modified.
- F-PHOTO-3 Files the browser cannot decode (HEIC on some devices, camera RAW such as .cr2 — met in the owner's test) are left out with a clear message asking for a JPEG; the other photos carry on.
- F-PHOTO-4 Photos are stored only in the device's IndexedDB as part of the report.

### 4.5 E-mail draft (F-MAIL)

The message is built from a template (section 7) — recipient, subject, body, attachments — and shown in full before hand-off. Every part has its own "Másolás" button as a universal fallback.

| Platform | Primary hand-off | Fallbacks |
|---|---|---|
| Phone (Android, iPhone) | Two numbered steps on one screen: **1. "Fotók mentése"** saves the reduced photos to the phone; **2. "Megnyitás a levelezőben"** — `mailto:` with recipient, subject and body. The user then attaches the saved photos in the mail app (paperclip). | The "Másolás" buttons for every part |
| PC | **"Megnyitás a levelezőben"** — `mailto:` with recipient, subject, body. Photos: **"Fotók letöltése"** (the downscaled JPEGs, to attach or drag into the draft) is the main way; "Fotó másolása" (one photo to the clipboard, to paste into the draft) is a shortcut. | The "Másolás" buttons for every part |

- F-MAIL-1 If the encoded `mailto:` link would exceed 4 000 characters (raised from 1 800, D29), only recipient and subject go into the link and the body is copied to the clipboard, with a notice.
- F-MAIL-2 "Fotó másolása" copies a reduced image (long edge at most 1 280 px). Browsers can only put PNG on the clipboard, and a full-size PNG is several times larger than the JPEG (7.4 MB against 1 MB in the owner's test), which would hit webmail size limits.
- F-MAIL-3 After hand-off the report is marked "Átadva a levelezőnek" with a timestamp. The app cannot know whether it was really sent and must not claim it.

Known limits, to be stated in the app's help: on both phone and PC the user adds the photos to the draft themselves, because a web link cannot attach files — in all cases the copy buttons work.

Why not the phone's share sheet (spike S1, owner's Samsung with the Gmail app, 2026-11-12): it attaches the photo and fills the text, but Gmail fills neither the subject nor the recipient, so the user would have to paste both from two trips back to ParkStop. The owner chose the complete e-mail with manual photo attachment instead (DECISIONS D15).

Verified on the owner's PC (Chrome with Proton Mail and Gmail in the browser, 2026-11-12): `mailto:` fills recipient, subject and body with correct Hungarian letters, including a 2 634-character link; pasting a copied photo and saving photos both work. A ready-made draft file (`.eml`) was dropped from v1 because it needs a desktop mail program (see section 13).

### 4.6 Reporter details (F-PROFILE)

Settings screen: name, postal address, e-mail, phone (all optional). Stored in `localStorage`, inserted into the e-mail signature. A notice explains that authorities usually act only on reports with an identifiable reporter.

### 4.7 History (F-HIST)

List of reports on this device: date, address, plate, authority, status (`piszkozat` / `átadva`). Open, duplicate, delete one, delete all. Storage: IndexedDB. Export of all data as a JSON file.
An `átadva` report records what went to the mail app: the first change to it (pin, address, recipient, form or photos) continues in a new `piszkozat` and leaves the handed one unchanged (D47).

### 4.8 Installable app (F-PWA)

Web app manifest, icons, service worker that caches the app shell and the bundled data. The map and address lookup need a connection; everything else (form, resolver, history, draft) works offline. An "Új verzió érhető el — Frissítés" prompt replaces silent updates. Without a connection a banner says that address lookup does not work and the map shows only areas viewed before (the browser's own tile cache), while history and drafts work. The service worker never downloads the plate-reader files; they are cached by the reader itself only after the user opts in (4.9, D42).

### 4.9 Number-plate reader (F-PLATE)

Reads the plate from a photo on the device and offers it as a suggestion. Built on the
open-source fast-alpr model family (plate detector from `open-image-models`, text reader
from `fast-plate-ocr`), run in the browser with ONNX Runtime Web.

- F-PLATE-1 Runs entirely on the device. The model files are served from the app's own
  address (never fetched from a third party at runtime) and cached after first use. They are
  loaded only when the first photo is added, so the rest of the app starts without them.
- F-PLATE-2 Steps: find plate regions in the photo → crop → read the text → return text
  and a confidence value. With several plates in one photo the user picks from the crops;
  the app never picks the highest-scoring plate on its own. In the owner's test 5 of 20
  photos showed several plates, and across two runs of the same photos the owner meant a
  different car in 3 of them — only the user knows which car is being reported.
- F-PLATE-3 The result is a suggestion: it fills "Rendszám" marked "felismerve –
  ellenőrizd", and the cropped plate image is shown next to the field. The user must press
  "Jó" or edit the value before continuing.
- F-PLATE-4 Below the confidence threshold nothing is filled in; the app shows the crop
  (or a zoomable photo if no plate was found) and asks the user to type the plate.
- F-PLATE-5 The reader only formats (upper case, hyphens for Hungarian formats). It never
  "corrects" characters by guessing.
- F-PLATE-6 **Off by default, opt in.** The first time the user adds a photo, the app offers
  it once: "Felismerjük a rendszámot a fotóról? Egyszeri, kb. 26 MB-os letöltés – wifi
  ajánlott." with "Igen, kérem" / "Nem, beírom". The answer is remembered and can be changed
  in Settings ("Rendszámfelismerés"). Until the user says yes, no model is downloaded.
- F-PLATE-7 If the device cannot run it (no WebAssembly, out of memory, model fails to
  load), the app falls back to manual entry without an error screen.
- F-PLATE-8 Format check (fixed rules, no AI): a read that the reader labels as Hungarian
  but that matches no Hungarian plate format (ordinary old ABC-123 and new AA BB-123 to
  start with; other official formats added to a small table as they are met) is never
  pre-filled, however high its confidence. The crop is shown with "Nem teljes a rendszám?"
  and the user types it. Reason: in the owner's test a cut-off read ("DRVA02" for
  DR VA-023) had 0.9998 confidence. Foreign plates pass through unchanged.
- F-PLATE-9 Each detected plate is read at several crop widths (from the detector's box
  to a box widened by a quarter of its height), so edge characters are not cut off. A read
  is offered only when at least two widths agree on the same characters, each confident
  (F-PLATE-4) and plausible (F-PLATE-8); otherwise nothing is filled. A detection whose
  crops read no character at all is not a plate and is ignored. When the whole photo gives
  no plate, the reader searches four zoomed quarters of it; a plate found only there is
  offered only if it has a Hungarian format, and one cut by a quarter's edge is dropped.
  On the owner's 38 test photos this reads 42 plates right and none wrong; the Wikimedia
  samples stay 12 of 12 (DECISIONS D38, D39).

> **Gate (spike S3 in milestone M0):** the reader ships only if, on about 20 of the owner's
> own photos of Hungarian plates (old ABC-123 and new AA BB-123 formats), it reads at least
> 85 % exactly and takes at most 3 s per photo on the owner's phone. If it fails, v1 ships
> manual entry with the zoomable crop helper instead, and C1 returns to its strict form.
> Status 2026-11-12: **gate passed.** Accuracy 18 of 20 (D16); on the owner's phone a median
> 0.76 s and at most 1.0 s per photo (D19). The
> original 20 MB download limit was replaced by the opt-in in F-PLATE-6 (D17): the real
> download is 26 MB (11.1 MB models + 14.9 MB runtime).

## 5. Data (bundled, static, versioned)

| File | Content | Source |
|---|---|---|
| `data/districts.geojson` | 23 district polygons, simplified, plus the Budapest outline (top-level `budapest` member) | OpenStreetMap (ODbL) |
| `data/capital-roads.geojson` | Line geometry of capital-managed roads, with `partial` flag for roads listed only between two junctions; `kind: 'link'` features are short display-only stretches that close gaps on the map and are ignored when deciding responsibility (D49) | Names from Decree 432/2012 annexes 1–2, geometry from OpenStreetMap, built by script |
| `data/authorities.json` | One record per body: id, name, type (`district` / `fori` / `police`), district(s), e-mail, phone, web, `sourceUrl`, `verifiedOn`, per-district rule overrides | Official websites only |
| `data/violations.json` | Offence types, Hungarian label, template sentence, legal reference | KRESZ (1/1975 KPM–BM), verified in M1 |
| `public/models/*.onnx` | Plate detector and plate text reader | fast-alpr project (`open-image-models`, `fast-plate-ocr`); licence and exact files confirmed in spike S3 |

Rules for this data: every e-mail address has an official `sourceUrl` and a `verifiedOn` date; nothing is guessed or derived from a pattern; a record without a verified address is shipped as "nincs ellenőrzött e-mail cím" with the phone number and website instead. Details in [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

## 6. Offence types (final in M1 — DECISIONS D22)

Fifteen items plus free text, in this order. Each has a Hungarian e-mail sentence and a verified
legal reference in `src/data/violations.json`:

Járdán szabálytalanul · Gyalogos-átkelőhelyen vagy előtte · Kereszteződésben vagy 5 méteren belül ·
„Megállni tilos” tábla hatálya alatt · „Várakozni tilos” tábla hatálya alatt ·
Autóbusz-, villamos- vagy trolimegállóban · Buszsávban · Taxiállomáson ·
Kerékpársávon, kerékpárúton · Mozgáskorlátozott-helyen jogosulatlanul · Kapubejárat előtt ·
Második sorban · Villamospályán · Rakodóhelyen · Zöldterületen · Egyéb (saját leírás).

All except "Zöldterületen" and "Egyéb" are KRESZ stopping/waiting rules (1/1975. (II. 5.) KPM–BM),
which are petty offences under Szabs. tv. 224. §. "Zöldterületen" is a municipal ban
(10/2005. (III. 8.) Főv. Kgy. rendelet 6. § (13)) with no sanction in the decree; "Egyéb" cites nothing.

## 7. E-mail templates (final in M1 — read and approved by the owner 2026-11-12, DECISIONS D20)

Layout (D48): one space after each label, no padded label column, and a blank line between the fields, so the e-mail reads easily in a mail app's proportional font.

**A — to an enforcement body (district body or FÖRI), the default:**

```
Címzett:  <authority e-mail>
Tárgy:    Szabálytalan parkolás bejelentése – <RENDSZÁM> – <cím>

Tisztelt <authority name>!

<dátum>-én/-án <idő>-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:

Helyszín: <cím> (<kerület>. kerület), GPS: <lat>, <lon>

Rendszám: <RENDSZÁM>

Jármű: <leírás, ha van>

Szabálytalanság: <típus mondata> (<jogszabályi hivatkozás>)

Megjegyzés: <szabad szöveg, ha van>

A helyszínen készített <n> fényképet mellékelem. Kérem az ügy kivizsgálását és a
szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.

Tisztelettel:
<név>
<lakcím>
<e-mail, telefon>
```

**B — to the district police station (when the user picks the police alternative):**

```
Címzett:  <kapitányság e-mail>
Tárgy:    Szabálysértési feljelentés – <RENDSZÁM> – <cím>

Tisztelt <kapitányság neve>!

Szabálysértési feljelentést teszek ismeretlen elkövető ellen. <dátum>-én/-án <idő>-kor
az alábbi helyen szabálytalanul várakozó járművet észleltem:

<the same Helyszín … Megjegyzés block as template A>

A helyszínen készített <n> fényképet bizonyítékként mellékelem. Kérem az ügy
kivizsgálását és a szükséges intézkedés megtételét, valamint tájékoztatást az eljárás
menetéről.

Tisztelettel:
<név>
<lakcím>
<e-mail, telefon>
```

Rules for both:

- Plain text only. No promise or demand of a fine; no amounts; no claim that the keeper is liable.
- The block carries what Szabs. tv. 78. § (3) asks of a report: place, time, circumstances, the
  plate, and the photos named.
- For "Egyéb" the line reads `Szabálytalanság: <the user's text>` with no reference. Empty optional
  lines (Jármű, Megjegyzés) are left out.
- The "Megjegyzés" and help text may remind the user: report promptly (a patrol can only act while
  the car is there; petty-offence liability lapses after 6 months), and a witness may ask for their
  details to be handled confidentially (Szabs. tv. 63. § (1)).

## 8. Technical design

| Area | Choice |
|---|---|
| Language / build | TypeScript, Vite |
| UI | React, plain CSS with design tokens (light and dark) |
| Map | MapLibre GL JS + OpenFreeMap style; no API key |
| Address lookup | Nominatim public API, throttled, optional |
| Geometry | `@turf/boolean-point-in-polygon`, `@turf/point-to-line-distance` |
| Photos | `exifr` for EXIF; canvas for downscaling |
| Plate reader | `onnxruntime-web` (WebAssembly, WebGPU where available) in a web worker; ONNX models from the fast-alpr project |
| Storage | IndexedDB (`idb`) for reports and photos; `localStorage` for profile and settings |
| PWA | `vite-plugin-pwa` (Workbox) |
| Tests | Vitest (unit), Playwright (end-to-end, desktop + phone viewport) |
| Hosting | GitHub Pages, deployed by GitHub Actions on push to `main` |

Folder layout:

```
src/
  app/          shell, routing between the four steps, layout (phone / PC)
  map/          map view, pin, geolocation, address lookup
  authority/    resolver (pure), result card
  report/       form, validation, photo handling
  plate/        on-device plate reader (worker, pre- and post-processing)
  mail/         template, mailto, photo download and copy
  history/      IndexedDB storage, list
  settings/     profile, preferences
  i18n/         hu.ts — every interface string
  data/         bundled JSON / GeoJSON
scripts/        data build and verification scripts (run by the developer, not at runtime)
tests/          unit and end-to-end tests
```

Rules: `authority/` and `mail/` contain no UI imports and no network calls (pure, testable). No string literal shown to the user lives outside `i18n/hu.ts` and `data/`.

## 9. Layout

- **Phone:** full-screen map; a bottom sheet carries the current step (authority → form → e-mail). Large touch targets (min 44 px).
- **Phone navigation:** the phone's Back button goes one step back. Swiping left moves to the next step, the screen following the finger with the next step's header peeking in; it moves on when released past a third of the width or with a quick flick. While the next step is not allowed (a required field missing, no authority yet) the screen only stretches a little, springs back and the missing fields are marked, without opening the keyboard. Swiping right goes one step back. Step 1 swipes on its sheet (dragging the map moves the map); touches that start within 20 px of the screen edge are left to Android's own back gesture (D52).
- **PC (≥ 900 px):** left panel 400 px with the steps, map fills the rest. The map takes input only in step 1 (as on the phone).
- Light and dark theme: "Megjelenés" at the top of Settings — Világos, Sötét or Automatikus (follows the system; default). The map switches with it (OpenFreeMap `liberty` / `dark`, D43). WCAG AA contrast, full keyboard use, visible focus.
- A ? icon in the header ("Súgó" link on the PC) opens the help; "Adatkezelés" opens from the help and from Settings (D44).

## 10. Privacy and third parties

| Request | To | What is sent |
|---|---|---|
| Map tiles | tiles.openfreemap.org | IP address, viewed map area |
| Address lookup | nominatim.openstreetmap.org | IP address, the pin's coordinates or the typed address |

Nothing else leaves the device. The plate reader's model files come from the app's own
address and the photo is analysed locally. An "Adatkezelés" screen states this in Hungarian, naming the app's own host as well (it serves the app, the data and the plate-reader files). Photos may show other people and plates: the app reminds the user to send them only to the authority.

## 11. Acceptance criteria (v1)

1. Dropping a pin on any of 30 checked test points (district streets, capital roads, borders, outside Budapest) gives the expected authority — test fixture reviewed by a human.
2. All 23 districts plus FÖRI have a record with a verified source; no invented address ships.
3. On the owner's phone (Gmail app): "Megnyitás a levelezőben" opens a draft with recipient, subject and body filled in, and the photos saved by "Fotók mentése" can be picked from Gmail's attach dialog.
4. On the PC: `mailto:` opens a filled draft with correct Hungarian letters in the owner's webmail (Proton Mail, Gmail); the downloaded photos can be attached and a copied photo can be pasted into the draft.
5. A photo with a capture time fills "Időpont" (the position comes from the map, search or "Saját helyzetem", D34).
6. With the network off, the app opens, the form works, history is readable.
7. No request to any host other than the two in section 10 (checked in the end-to-end test).
8. The only ML dependency in `package.json` is `onnxruntime-web`, used only in `src/plate/`; no AI API or SDK of any kind (checked in CI).
9. Lighthouse: PWA installable, accessibility ≥ 95.
10. Every interface string is Hungarian and comes from `i18n/hu.ts`.
11. The plate reader passes the S3 gate on the owner's test photos, downloads nothing before the user opts in, never fills a value without the "ellenőrizd" mark, and the app works fully with the reader switched off.

## 12. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| R1 Authorities may not fine from a citizen's photo (confirmed in M1, D20) | The app's promise is weaker than the user expects | Honest wording (no fine promised); "phone if the car is still there" hint; police feljelentés offered as alternative |
| R2 The user forgets to attach the photos, or cannot find the saved ones in the mail app | Report arrives without evidence | Numbered steps on the e-mail screen; the "Átadva" checklist starts with attaching the photos; verify on the owner's phone in M2 that the saved photos appear in Gmail's attach dialog |
| R3 Authority contacts and agreements change | Mail goes to the wrong body | `verifiedOn` dates, yearly check script, "bizonytalan" when stale |
| R4 Capital-road matching is imperfect (partial road sections, squares) | Wrong primary authority | Sections are cut to their junctions; a section whose ends could not be placed (`partial` and not cut, or `cutApprox`) lowers confidence; alternatives always shown; human-reviewed test points |
| R5 Free services change terms or go down | Map or address lookup fails | Tile style URL and lookup URL are configuration; manual address entry always works |
| R6 `mailto:` length limits | Truncated body | F-MAIL-1 fallback |
| R7 Plate reader misreads a Hungarian plate, is slow on the phone, or the models are too large | A wrong plate in a report sent to an authority | Spike S3 gate before building; suggestion only, user must confirm; crop shown next to the field; switch in Settings |

## 13. Backlog (not in v1)

English interface · Android app (Capacitor wrapper) for complete drafts with recipient ·
ready-made draft file (`.eml`) for desktop mail programs (a tested builder exists in `public/spikes/mail/eml.js`) ·
public launch (first-run intro, extended privacy notice) · areas outside Budapest ·
follow-up reminder for unanswered reports.
