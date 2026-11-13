# ParkStop

> **Magyarul:** A ParkStop egy ingyenes, telepíthető webalkalmazás szabálytalanul parkoló autók
> bejelentésére Budapesten. Jelöld meg a helyet a térképen, és az app megmutatja, melyik hatóság
> illetékes (kerületi közterület-felügyelet, FÖRI vagy rendőrség), majd elkészíti a magyar nyelvű
> e-mail-piszkozatot a fotóiddal. Az e-mailt te küldöd el a saját leveleződből; az app semmit nem
> küld és semmit nem tölt fel. Nincs szerver, nincs regisztráció, nincs mesterséges intelligencia a
> felhőben.
>
> **Megnyitás:** <https://justaguyulove.github.io/parkstop/>

ParkStop is a static progressive web app (PWA) for reporting illegally parked cars in Budapest:
drop a pin on the map, see which authority is responsible, add photos, and get a ready-to-send
Hungarian e-mail draft. The interface is Hungarian.

## What it does

1. **Map pin** – tap the map, search an address, or use your own position.
2. **Responsible authority** – resolved on the device from bundled district boundaries,
   capital-managed roads and verified authority contacts (each with an official source and a
   verification date).
3. **Report** – offence type, plate, time, photos. An optional on-device plate reader suggests the
   plate; you always confirm it.
4. **E-mail draft** – opens your mail app with recipient, subject and body filled in; you attach
   the saved photos and send it yourself.
5. **History** – your reports stay in the browser (IndexedDB), on your device only.

It installs to the home screen and starts offline.

## Privacy

- No backend, no account, no analytics. Nothing is uploaded and no e-mail is sent by the app.
- The only third-party requests are map tiles from `tiles.openfreemap.org` and, if switched on,
  address lookup from `nominatim.openstreetmap.org` (see the in-app "Adatkezelés" screen and
  [SPEC.md](SPEC.md) section 10).
- The plate reader runs in the browser (ONNX Runtime Web). Its model files come from this site,
  only after you switch the reader on.

## Development

Requires Node.js 22.

```bash
npm ci
npm run dev            # http://localhost:5173
npm run dev:lan        # https on the local network, for testing on a phone
npm run typecheck && npm run lint && npm test
npm run check:deps     # no AI/ML packages except onnxruntime-web
npm run validate:data  # bundled authority data
npm run test:e2e       # Playwright end-to-end tests (built app, mocked map and lookup)
npm run build          # static site in dist/
```

`BASE_PATH=/parkstop/ npm run build` builds for a sub-path such as GitHub Pages. Pushing to
`main` deploys automatically through [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

Project documents: [SPEC.md](SPEC.md) (what the app does), [docs/ROADMAP.md](docs/ROADMAP.md),
[docs/DECISIONS.md](docs/DECISIONS.md), [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

## Licence

ParkStop is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License, version 3 or (at your option) any later version**. See
[LICENSE](LICENSE).

The plate detector model is treated as GPL-3.0; its training and export source is in
[public/models/source/](public/models/source/). Every third-party part and its licence is listed
in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Attribution

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.
  The bundled district boundaries and road geometry are derived from OpenStreetMap and stay
  under the ODbL.
- Map tiles and styles by [OpenFreeMap](https://openfreemap.org).
- Address lookup by [Nominatim](https://nominatim.org) (OpenStreetMap).
- Plate reader models by ankandrew ([open-image-models](https://github.com/ankandrew/open-image-models),
  [fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr)), built on
  [YOLOv9](https://github.com/WongKinYiu/yolov9).
- [ONNX Runtime Web](https://onnxruntime.ai) (MIT), [MapLibre GL JS](https://maplibre.org)
  (BSD-3-Clause), Source Sans 3 font (SIL OFL 1.1).

Authority contacts are compiled from official sources listed in
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md). If one is out of date, please open an issue.
