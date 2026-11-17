# Dev check scripts

Headless Playwright checks used to verify motion and map changes without a phone. They expect
the dev server on http://localhost:5173 (`npm run dev`, or `preview_start parkstop-dev`); set
`DEV_URL` to use another one, e.g. `DEV_URL=https://localhost:5443/` for `npm run dev:lan`
(its self-signed certificate is accepted). Screenshots go to `test-results-e2e/dev/`
(gitignored). Run from the repository root:

| Script | What it checks |
|---|---|
| `node scripts/dev/sheet-fold.mjs [pin\|start]` | Phone sheet fold (roadmap 6.14): holds the grip at 25/50/75/100 % of a fold drag and screenshots each, releases, taps open again; prints sheet heights and page errors. `pin` searches "Hunyadi tér" first (authority card), `start` folds the start panel |
| `node scripts/dev/place-notice.mjs "Hunyadi tér" "Váci utca 10"` | PC layout: searches each place, picks the first hit, prints the authority notice (roadmap 6.11) |
| `node scripts/dev/photo-zoom.mjs [phone\|pc]` | Full-screen photo from a step-2 thumbnail (roadmap 6.18): open, short drag (springs back), long drag and flick (close into the thumbnail), Escape, pinch or wheel zoom then close, thumbnail scrolled away (fades), reduced motion, focus and console errors. Map tiles and the search are answered from `tests/e2e/fixtures`, so it makes no outside requests. Screenshots `zoom-<phone\|pc>-*.png`; exits 1 on a failed check |
| `node scripts/dev/ctrl-drag.mjs` | PC: Ctrl+drags right in the top and bottom half of the map and prints the compass needle angle (roadmap 6.10: both drags must turn the same way) |

The search scripts call the public Nominatim instance (an allowed host, SPEC 10); keep runs
occasional (1 request per second policy).
