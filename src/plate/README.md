On-device plate reader (SPEC 4.9) and the zoomable photo (roadmap 3.5, 3.6).

- `pipeline.ts` - pure detect / crop (with margin) / read; port of `public/spikes/plate/pipeline.js`, checked by `pipeline.test.ts`.
- `decide.ts` - pure rules: fill-in threshold, Hungarian format check, picking, field reconciliation.
- `worker.ts` - module worker: loads `public/vendor/ort` and `public/models`, caches them (Cache Storage `parkstop-plate-v1`).
- `client.ts` - one worker per page, one photo at a time, falls back silently.
- `usePlateReader.ts`, `PlateField.tsx`, `ZoomView.tsx` - React side.

ONNX Runtime Web is vendored (not an npm dependency), as in the spike.
