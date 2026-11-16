# ParkStop — handoff to the server session

Written 2026-11-16 by the main ParkStop session on the owner's Windows PC, for the main session
that continues on a server. Read this first, then the documents in "Read order". Everything the
work depends on is in this repository, except the files listed under "Files that are not in git".

This repository is **public**. Personal details (the owner's contact data, home network) are
deliberately left out of this file; they travel in the private bundle described below.

## 1. Start-up checklist (do these first, in order)

1. **Repository:** clone `https://github.com/justaguyulove/parkstop.git` (branch `main`). The last
   commit before this handoff is `1e02c02` ("Sheet fold: move text by its glyphs …"); the handoff
   commit itself follows it. `git log --oneline -1` must show the handoff commit or later.
2. **Toolchain:** Node 24 (what CI uses; the PC ran Node 25.2, npm 11.6.2), then `npm ci`.
   The lockfile must stay valid for npm 10/11.6.4: test with `npx npm@11.6.4 ci --dry-run` before
   committing dependency changes.
3. **Browsers for tests:** `npx playwright install --with-deps chromium` (Playwright 1.65).
4. **Checks — all must pass before any work:**
   `npm run typecheck`, `npm run lint`, `npm test` (407 unit tests),
   `npm run test:e2e` (10 passed, 2 skipped), `npm run check:deps`, `npm run validate:data`,
   `npm run build`.
5. **Dev server:** `npm run dev` (port 5173). `.claude/launch.json` has the named configs
   (`parkstop-dev` etc.) for the desktop app's `preview_start`.
6. **Smoke test of the latest work:** `node scripts/dev/sheet-fold.mjs start` and
   `node scripts/dev/sheet-fold.mjs pin` (see `scripts/dev/README.md`); both must end with
   `errors: none` and "morph layer left behind false".
7. **Private bundle:** put its files where its README says (owner's instructions and the
   project memory). Without it the session misses the owner's working preferences.
8. **GitHub access:** pushing needs the owner's GitHub credentials on the server. Never type a
   password; the owner signs in. Reading CI status works without a login (section 6).

## 2. Read order

1. [CLAUDE.md](../CLAUDE.md) — project rules, hard constraints, how to handle a task.
2. [SPEC.md](../SPEC.md) — what the app does; source of truth.
3. [docs/ROADMAP.md](ROADMAP.md) — every task, estimate vs actual. All rows are ☑; the latest
   are 6.9–6.14 (this session's work).
4. [docs/DECISIONS.md](DECISIONS.md) — D1–D53 and the open questions (O7, O8 still open).
5. [docs/ORCHESTRATION.md](ORCHESTRATION.md) — model and effort guide.
6. [docs/DATA-SOURCES.md](DATA-SOURCES.md) — every authority and legal fact with source and date.
7. [docs/DEPLOY.md](DEPLOY.md) — GitHub Pages; push to `main` = deploy.

## 3. Where things stand

- **Live:** https://justaguyulove.github.io/parkstop/ at commit `1e02c02`; CI and the Pages
  deploy were green for every push of this session.
- **Milestones M0–M5:** done. The work since then is owner feedback, tracked as roadmap rows
  6.x. Nothing is half-built or uncommitted.
- **Last changes (newest first):**
  - 6.14 Phone sheet fold: the grip drag follows the finger, a critically damped spring settles
    it, and the open card morphs into the folded summary (`src/app/useSheetMorph.ts`, driven
    from `App.tsx`, grip in `SheetHandle.tsx`). Text pairs move by their glyphs; identical
    texts (the start panel title) travel word by word so a left-aligned title re-centres
    smoothly (fixed after the owner's phone test showed a pop).
  - 6.13 Settings: postal address optional; hints state that an unidentifiable public-interest
    report is not investigated (2023. évi XXV. tv. 4. § (3)); a police report needs no reporter
    name (Szabs. tv. 78. § (3)). Sources in DATA-SOURCES, verified 2026-11-14.
  - 6.12 All 15 offence legal references re-checked on njt.jog.gov.hu (2026-11-14); label
    "Második sorban (parkoló autók mellett)".
  - 6.11 Authority notice names the kind of place (utca, tér, köz, körút …) via
    `src/authority/placeKind.ts` + `src/data/place-kinds.json`.
  - 6.10 PC Ctrl+drag / right-drag turns the same way anywhere (linear, `rotateSpeed: 0.8`;
    the owner had it flipped once and chose this direction).
  - 6.9 Dark-mode 3D buildings; PC map usable beside side pages.

## 4. Open threads — exactly where the owner stopped

In the order the owner is most likely to pick them up:

1. **Two animation mockups, awaiting the owner's choice.** The owner asked where else a
   continuous, finger-following animation would help, then asked for mockups of the top two
   and then said "commit and push what you've made so far" without choosing. Neither is built.
   The mockups were inline widgets and are not saved; rebuild them before building.
   - **Step 1 → 2 summary morph:** while swiping from the map to the photo page, the folded
     summary (authority name + address) travels up and becomes a small grey context line
     under the photo page's title, and stays there. Needs a new header line in step 2
     (SPEC section 9 update) and a morph layer like `useSheetMorph`. Estimate 30–45 min.
   - **Photo zoom from the thumbnail:** the zoom view (`src/plate/ZoomView.tsx`) grows out of
     the tapped thumbnail and shrinks back into it; dragging the photo down follows the
     finger, shrinks it and fades the backdrop; a short drag springs back. Pinch-zoom stays.
     Estimate about 30 min.
   - Both together: about 1–1.5 h and 10–15 % of the 5-hour limit. Next step: ask
     "Build both / only the photo zoom".
   - Two lower-priority ideas from the same answer: map search results unfolding from the
     search box; sheet content swaps (start panel → authority card) fading in with the height.
2. **The (i) credits button shows a blue focus ring** in the owner's phone screenshots
   (2026-11-15). Offered as a small fix (ring should only show for keyboard focus,
   `:focus-visible`); the owner has not answered. The owner also asked for an HD image of the
   (i); it was sent as screenshots (light and dark, 608 × 608 px); a transparent vector export
   was offered.
3. **Owner testing still outstanding on real devices:** camera button and option A (place-only
   step 1, photos in step 2), swipe between steps, the credits unfold, dark-mode 3D buildings,
   PC map beside side pages, Ctrl+drag direction, the sheet fold morph. The owner did test the
   fold and reported the title pop, now fixed (`1e02c02`), not yet re-tested by the owner.
4. **Yellow capital-road lines do not sit exactly on the base map's roads.** Earlier the owner
   said "Yes, check it" to this investigation, and it was interrupted and never done. The
   check: do OpenFreeMap's vector tiles keep the OSM way id (or another stable id) per road
   feature? If yes, colour the base map's own road features by id instead of drawing a second
   line (pixel-perfect; 1–2 h). If not, matching by name is unsafe (roads are capital-managed
   only on sections), so fall back to showing the band only when zoomed in, a little wider and
   softer (20–30 min). The check itself is 20–30 min.
5. **Data questions (DECISIONS):** O7 (14 district agreements not read for capital-road
   enforcement) and O8 (which police station covers Margit-sziget). Both wait for a data
   refresh with the researcher + sceptic agents.
6. **Observation, no action asked:** searching "Múzeum körút 10" puts the pin on the building,
   farther than the 15 m edge band from the capital-road line, so it resolves as a district
   street ("Kerületi kezelésű körút"). Behaviour predates 6.11. Moving the pin onto the road
   gives FÖRI.

## 5. How the owner likes to work (summary; the private bundle has the full text)

- **Commit and push only when the owner asks.** A push to `main` deploys the public site.
  The owner usually says "Commit and push"; then commit, push, and wait for CI + deploy
  (section 6) before reporting.
- **New feature → mockup first** (inline widget or screenshot of a prototype), then wait for a
  go-ahead. Bug fixes and small tweaks: just do them.
- **Real design choices → AskUserQuestion** with 2–4 options, the recommended one first and
  marked "(Recommended)", with previews where options look different.
- **Before each task:** one short block with recommended model, effort, subagents, and a time
  and usage estimate from the roadmap's estimate-vs-actual history. Record actuals in the
  roadmap row when done.
- **Replies in English** (the owner sometimes writes in Hungarian). All user-visible app text
  is Hungarian and lives in `src/i18n/hu.ts` or `src/data/`.
- **Usage line** at the end of every answer: `[Session: X% | Weekly: Y% | ~ Z]`, from the usage
  tool's percentUsed values, Z measured with `date +%s` at the start and end of the reply. The
  usage tool labels the plan "Pro"; it is actually Max — don't advise cheaper models to save
  usage.
- **Milestones and larger side tasks run in their own sessions** started from the main
  session, titled "ParkStop M<n>: <short name>", each with Remote Control enabled.
- **Verify, don't ask the owner to check:** previewable changes are verified in a browser
  (headless Playwright scripts like `scripts/dev/*` worked best) and shown with a screenshot.
- **Legal and authority facts:** never invented; each needs an official source URL and a
  verification date (DATA-SOURCES), or it ships as "not verified".

## 6. Practical how-tos

- **CI / deploy status without `gh`** (the PC had no `gh`; any machine can use the public API):

  ```bash
  curl -s "https://api.github.com/repos/justaguyulove/parkstop/actions/runs?head_sha=$(git rev-parse HEAD)" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log((j.workflow_runs||[]).map(r=>r.name+':'+r.status+':'+r.conclusion).join(';'))})"
  ```

  Poll every 15 s until neither run is queued or in progress; expect
  `CI:completed:success;Deploy to GitHub Pages:completed:success` (about 2–3 min).
  Job logs need a GitHub sign-in.
- **Phone testing:** the old route (`npm run dev:lan`, self-signed HTTPS on port 5443, reached
  from the phone over the home network) only works when the dev server runs on a machine in
  the owner's home network. From a server, test on the live site after a push, or ask the
  owner how they want to reach a dev build (tunnel, VPN). `vite --mode lan` binds 0.0.0.0 and
  adds the basic-ssl plugin.
- **Headless WebGL:** MapLibre needs
  `--use-angle=swiftshader --enable-unsafe-swiftshader` in headless Chromium (already in the
  scripts and Playwright config).
- **Owner signs in themselves** to GitHub or any site; never enter credentials.

## 7. Files that are not in git

| Path (repo-relative) | Size | Needed for | How to get it on the server |
|---|---|---|---|
| private bundle `handoff-private/` | small | owner's global instructions + project memory | the owner copies it over privately (it is gitignored); see its README |
| `spike-samples/` | 176 MB | only re-running the plate-reader accuracy spikes (D16, D19) | owner's own photos with real plates: copy privately if needed, **never commit or publish** |
| `scripts/.cache/` | 30 MB | only re-running `build:capital-roads`, `build:districts`, `make-test-points.mjs` | regenerable: the build scripts download it again (Overpass, njt.jog.gov.hu); or copy it |
| `node_modules/`, `dist/`, test outputs | — | — | recreated by `npm ci`, `npm run build`, the test runs |

Bundled data (`src/data/*.json`, `*.geojson`) and the ONNX plate models (`public/models/`) are in
git, so the app builds and runs without the two optional folders.

## 8. Environment notes from the PC

- The PC session ran on Windows with Git Bash and PowerShell; paths in old notes and roadmap
  rows (`F:\Egyéb\Claude\ParkStop`, a Windows scratchpad) do not exist on the server.
- An `rtk` command-output condenser was installed there and rewrote some shell commands
  (`rtk ls`, `rtk read`); it is optional. If the server has no `rtk`, ignore its mentions in
  the owner's instructions.
- Git converted LF to CRLF on checkout on Windows; files are committed with LF. On Linux no
  action is needed.
