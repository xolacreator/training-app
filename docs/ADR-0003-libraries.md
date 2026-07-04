# ADR-0003 — Adaptation & Prescription Libraries (Coach EV v2, Phase 2)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-04
- **Phase:** 2 — Adaptation & Prescription libraries (formalize "the product")
- **Builds on:** ADR-0001 (Athlete State), ADR-0002 (Timeline), `docs/COACH_EV_V2_ROADMAP.md`

## Context

Coach EV v2's thesis is that **a coaching decision targets an *adaptation***; the
workout is merely the vehicle that creates it. But in the current code the two
are fused: `ADAPTATION_MODEL` holds engine numbers (fatigue vector, retention,
scheduler objective) with no coaching-facing description, and the "how" lives
inside generators (`_progressEndurance` reads a single `rx` per **run type**,
`_genericStrengthSession` reads the strength KB `rx`). There is exactly **one**
prescription per run-type — no notion that an adaptation (e.g. Lactate
Threshold) can be trained by *many* prescriptions (continuous tempo, cruise
intervals, threshold intervals, progression run) and that the right one depends
on athlete **state** (phase, readiness, experience).

## Decision

Split knowledge into two versioned, source-tagged libraries and add a pure
selection layer that makes adaptation → prescription an explicit **many-to-one
the engine selects from**.

- **`knowledge/adaptations.mjs`** (`ADAPTATION_LIBRARY`, v1, 10 entries) — the
  descriptive "what": purpose, primary/secondary adaptations, coarse fatigue
  cost, recovery expectation, progression strategies, compatible/conflicting
  adaptations, backing KB domain, and candidate prescription ids. Ids match
  `ADAPTATION_MODEL` **1:1** so the two merge; no numbers are duplicated here.
- **`knowledge/prescriptions.mjs`** (`PRESCRIPTION_LIBRARY`, v1, 28 entries) —
  the catalogue of "how": each prescription names the adaptation it creates, a
  plain-language structure, a `mode`/`rxRunType` link back to the generator, and
  soft `select` hints (`phase[]`, `readinessMin`, `experience`, `default`).
- Both are inlined into `index.html` as `ADAPTATION_KB` / `PRESCRIPTION_KB` by
  the existing `scripts/build-knowledge.mjs` (extended with two more marker
  blocks — same mechanism as `RUNNING_KB`/`STRENGTH_KB`; `--check` guards
  staleness in CI).

### Runtime API (pure, no DOM)

- `adaptationLibrary(id)` / `adaptationInfo(id)` — the latter merges the numeric
  engine model with the descriptive library into one object.
- `prescription(id)`, `prescriptionsFor(adaptationId)` — the many candidates.
- `selectPrescription(adaptationId, state)` — deterministic pick: hard-gate on
  `readinessMin` and `experience`, score by `phase` fit, tie-break by list
  order, and **always** fall back to the adaptation's `default` template so it
  never returns null for a known adaptation.

### Wiring (additive — output unchanged)

- `_progressEndurance` and `_genericStrengthSession` now **tag** their output
  with `adaptationId` + `prescriptionId` (which library entities they realise).
  The concrete volume/pace/reps still come from the existing progression maths —
  only new metadata keys were added.
- `planTodayAdaptation()` now also returns `prescriptionOptions` (the candidates)
  and `selectedPrescription` (the state-appropriate pick), while keeping the
  existing `prescription` (scheduler objective) key for back-compat.

## Consequences

**Positive**
- Adaptation ↔ prescription is now a clean, inspectable many-to-one — the
  substrate the Phase 4 Decision Pipeline selects from and the Decision
  Inspector explains.
- Knowledge is authored as data (versioned, source-tagged, evidence-informed)
  rather than buried in generator control flow; editing a library changes what
  the engine can prescribe.
- Zero behaviour change: generators still emit identical sessions
  (`test-session-detail` 25/25 unchanged); all 11 suites green;
  `test-libraries.mjs` adds 21 checks incl. referential integrity (every
  prescription→real adaptation, every adaptation→real prescriptions).

**Costs / accepted trade-offs**
- **Two sources of adaptation truth to keep aligned.** `ADAPTATION_MODEL`
  (numbers) and `ADAPTATION_LIBRARY` (description) are separate; a test asserts
  their ids match 1:1, but a future phase should collapse them into one built
  artefact so they can't drift.
- **Prescriptions are templates, not the progression maths.** `selectPrescription`
  chooses *which* session; `_progressEndurance` still computes the concrete
  numbers. Full re-pointing of the generators to drive parameters *from* the
  chosen template is deferred to Phase 4, where the pipeline owns generation —
  doing it now would risk changing current output for no visible gain.
- The `select` hints are coarse (phase/readiness/experience). Richer constraints
  (equipment, interference with recent sessions, fatigue budget) arrive with
  Phases 3 & 5; the scorer is structured to extend.

## Alternatives considered

1. **Enrich `ADAPTATION_MODEL` in place, no separate libraries** — rejected:
   keeps knowledge fused to the engine and gives no home for many prescriptions
   per adaptation or for source-tier tagging.
2. **Fully re-point generators to build from the selected template now** —
   rejected for this phase: high risk of changing generated sessions with no
   user-visible benefit until the pipeline (Phase 4) lands. Additive tagging
   proves consumption without the risk.
3. **One combined library file** — rejected: "what to train" and "how to train
   it" have different authors, cadence and source tiers; separating them mirrors
   the roadmap's data model and keeps each file focused.
