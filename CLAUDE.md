# ParkStop — project rules

Web app (PWA) for reporting illegally parked cars in Budapest: map pin → responsible
authority → Hungarian e-mail draft with photos. Read [SPEC.md](SPEC.md) before any work.

## Documents

| File | Purpose | Update when |
|---|---|---|
| [SPEC.md](SPEC.md) | What the app does. Source of truth. | Behaviour or scope changes (ask the user first) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones, tasks, status, estimates vs actuals | A task starts or finishes |
| [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md) | Agent roles, model and effort guide | The guide proves wrong in practice |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why choices were made | A real design choice is made |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | Where authority and map data comes from, verification rules | Data is added or re-verified |
| [docs/HANDOFF.md](docs/HANDOFF.md) | State and open threads when the main session moved to the server (2026-11-16) | The main session moves again, or an open thread there is closed |

## Hard constraints (from SPEC section 1)

- No cloud AI and no generative AI: no LLM, no AI API, nothing that sends data to a model on
  a server. The one permitted exception is the on-device plate reader in `src/plate/`
  (`onnxruntime-web` + bundled ONNX models, SPEC 4.9), whose output is only a suggestion the
  user confirms. Do not add any other ML dependency.
- No paid service, no API key tied to billing, no backend. Static files only.
- Map data and tiles: OpenStreetMap / OpenFreeMap only.
- Interface text and generated e-mails are Hungarian; all user-visible strings live in `src/i18n/hu.ts` or `src/data/`. Code, comments, commits and docs are English.
- The app never sends e-mail and never uploads photos or personal details.
- Never invent an authority's e-mail address, phone number or legal reference. Every such
  fact needs an official source URL and a verification date, or it ships as "not verified".

## How to handle a task request

When the user asks for a feature, fix or other task:

1. Find it in [docs/ROADMAP.md](docs/ROADMAP.md) (add it if it is new) and read the SPEC sections it names.
2. **Before starting, tell the user in one short block:** recommended model, effort level,
   whether to use subagents (and which), and a rough time and usage estimate — taken from the
   guide in [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md) and the estimate-vs-actual history in the roadmap.
3. New feature → show a mockup first and wait for a go-ahead. Bug fix or small tweak → just do it.
4. Do the work (delegate per the orchestration guide), run the checks below, then update the
   roadmap status and record the actual time and usage next to the estimate.
5. If the work changes behaviour described in the SPEC, update the SPEC in the same change.

## Milestones run in their own sessions

Each milestone (M1, M2, …) runs in its own session titled "ParkStop M<n>: <short name>",
started from the main ParkStop session with a fresh brief. The milestone session does the
work, keeps [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/DECISIONS.md](docs/DECISIONS.md)
current, and reports back; the main session coordinates, checks the result and starts the next
milestone. Side tasks that come up inside a milestone may get their own sessions too.

## Checks before calling a task done

- `npm run typecheck`, `npm run lint`, `npm test` pass (once the project is scaffolded).
- New logic in `src/authority/` or `src/mail/` has unit tests.
- No new network host beyond those in SPEC section 10.
- User-visible text is Hungarian and comes from `i18n/hu.ts`.
- Works at phone width (375 px) and PC width.

## Conventions

- TypeScript strict. `src/authority/` and `src/mail/` are pure: no UI imports, no network.
- Small commits, English messages, one roadmap task per commit where practical.
- Commit or push only when the user asks.
