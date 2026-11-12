# ParkStop — Orchestration guide

How work is split between the main session and subagents, and which model and effort
level fits which kind of task. The main session reads this before every task and tells the
user its recommendation first (see [CLAUDE.md](../CLAUDE.md), "How to handle a task request").

## Models

| Model | Strength | Cost on the plan | Use for |
|---|---|---|---|
| Haiku 5.5 | Fast, cheap | lowest | Mechanical edits, renames, copy tweaks, running a script and reporting |
| Sonnet 5.5 | Solid everyday coding | low | Most implementation: UI, forms, storage, tests, scaffolding |
| Opus 5.5 | Careful reasoning, good Hungarian | medium | Logic where a mistake is costly (resolver, mail encoding), legal and data research, code review |
| Fable 5.2 | Strongest judgement | highest, with its own weekly limit | Sceptic passes on facts and core logic, whole-project review, planning a milestone |

The plan is Max, so there is headroom: pick the model by what the task needs, not to save
usage. Sonnet stays the default for routine UI work because it is fast and good enough;
use Opus wherever a mistake is costly, and Fable for sceptic passes, reviews and planning.
(The usage tool may label the plan "Pro"; the owner confirmed Max on 2026-11-11. The
percentages it reports are still the ones to plan with.)

## Effort levels

| Effort | When |
|---|---|
| low | The change is obvious and local: config, copy, a one-file fix |
| medium | Normal feature work with a clear spec section |
| high | Several interacting rules, edge cases matter, or facts must be cross-checked |
| xhigh / max | Not planned for this project. Use only if a high-effort attempt has failed and the user agrees |

## Task type → recommendation

| Task type | Model · effort | Subagents |
|---|---|---|
| Typo, wording, colour, spacing | Haiku or Sonnet · low | none |
| Bug with a clear reproduction | Sonnet · medium | none |
| Bug with unknown cause | Opus · high | none; add an Explore agent if the search is wide |
| UI component or screen | Sonnet · medium | implementer |
| Authority resolver, mail module, data build scripts | Opus · medium–high | implementer + reviewer or sceptic |
| On-device plate reader (ONNX models in the browser) | Opus · high | implementer + reviewer; read the current onnxruntime-web docs before coding rather than relying on memory |
| Legal or authority-contact research | Opus · high | researcher, then sceptic |
| Bulk data collection (23 districts) | Sonnet · medium | 3 researchers in parallel + sceptic spot-check |
| Hungarian e-mail and help text | Opus · medium | none; the user reads the result |
| Code review of a milestone | Opus · high | reviewer per folder |
| Sceptic pass on findings or data | Fable · high | sceptic, one per reviewer or data batch |
| Milestone planning, spec changes | Fable · medium | none |

## Agents

Defined in `.claude/agents/`. Each brief must name the roadmap task number, the SPEC
sections, the files or folder the agent owns, and what "done" looks like.

| Agent | Model · effort | Job | May edit |
|---|---|---|---|
| `researcher` | Opus · high | Finds facts on official sources; returns each with URL and date | `src/data/`, `docs/DATA-SOURCES.md` |
| `implementer` | Sonnet · medium | Builds one roadmap task in its own folder, with tests | its assigned folder only |
| `reviewer` | Opus · high | Reviews a diff or folder against the SPEC and acceptance criteria | nothing (reports only) |
| `sceptic` | Fable · high | Tries to refute each finding or data row; keeps only what survives | nothing (reports only) |

The model or effort in the table can be overridden per call when the roadmap says so
(for example a Sonnet researcher for bulk contact collection).

## Rules for running agents

1. **Parallel only when files do not overlap.** One writer per folder at a time. Roadmap notes say which tasks can run side by side.
2. **Facts get a second pair of eyes.** Anything in `src/data/` is produced by a researcher and checked by a sceptic before it is committed.
3. **Core logic gets a second pair of eyes.** `src/authority/` and `src/mail/` changes are reviewed before the task is marked done.
4. **Agents that run tests in parallel** use their own port (`--port 5174`, `5175`, …) and their own Playwright output folder.
5. **The main session verifies.** An agent's report is a claim; the main session runs the checks and reads the diff before telling the user it is done.
6. **Small daily fixes stay solo.** No agents for UI tweaks, questions or one-file fixes.

## Multi-agent workflow (ultracode)

Only for the two jobs big enough to earn it, and only after the user says go:

| Job | Shape | Rough cost (uncalibrated) |
|---|---|---|
| M1 data batch (tasks 1.1–1.3) | 4 researchers by area → 1 sceptic per researcher → 1 merger | ~30 min, ~40 % of a 5-hour window, ~8 % weekly |
| M5 whole-project review (task 5.2) | reviewer per folder (map, authority, mail, report/history, PWA) → Fable sceptic per reviewer → parallel fix agents | ~40 min, ~50 % of a 5-hour window, ~10 % weekly |

Before offering either: check current usage. If the 5-hour limit is above ~50 %, suggest
waiting for the reset or splitting by area, one batch per window. After a review batch, give
the user a two-column "Bug / Fix" table in plain language.

## Estimates

Every task gets an estimate (time, share of the 5-hour limit) before it starts and the
actual figures afterwards, both in [ROADMAP.md](ROADMAP.md). New estimates start from the
actuals of similar finished tasks, not from the first guesses.
