# ADR-0004 — Fatigue Budget + Fitstop Intelligence (Coach EV v2, Phase 3)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-04
- **Phase:** 3 — Fatigue Budget + Fitstop Intelligence Engine
- **Builds on:** ADR-0001–0003, `docs/COACH_EV_V2_ROADMAP.md`

## Context

The roadmap called Phase 3 "replace scalar fatigue with a load vector." The
audit found the **vector already existed**: `FATIGUE_AXES` (mechanical /
metabolic / neurological / connective), `CATEGORY_FATIGUE` (per-category vectors
+ `recoveryHours`), and `Fatigue.sessionFatigue()` already return a 4-axis vector
for runs, strength and Fitstop. What was missing were the two things that make
the vector *actionable*: (1) a rolling **weekly budget** to compare accumulated
load against, and (2) a formalised **Fitstop Intelligence** layer (the Fitstop
translation lived as an inline `FITSTOP_LOAD` table with no adaptation mapping,
interference or evidence tags). And the ranker still gated on a scalar.

## Decision

Add the budget + intelligence layers on top of the existing vector, and let the
**planner** (not the generator) gate on the budget.

- **`knowledge/fitstop_translate.mjs`** (`FITSTOP_TRANSLATE`, v1, 4 archetypes) —
  inlined as `FITSTOP_KB`. Each Fitstop archetype (PERFORM / LIFT / CONDITION /
  SWEAT) maps to primary/secondary **adaptations**, a **load vector**, **run
  interference** (0–1), and **strength vs conditioning contribution**, with
  **evidence tags**: the *structure* and LIFT phase-progression are `verified`
  (user-provided BLOCK C 2026); the numeric *load* estimates are `assumed`
  (evidence-informed, not measured). Numbers preserve the app's existing
  `FITSTOP_LOAD` so behaviour is unchanged.
- **`fitstopIntel(session, phase)`** — reads `FITSTOP_KB`, applies the LIFT phase
  multiplier, returns the full signal object.
- **`sessionLoadVector(session, ctx)`** — one entry point that resolves *any*
  session (program **or** logged; run / strength / Fitstop) to a load vector,
  normalising logged sessions (`.cat`/name → `.type`/`.runType`).
- **`weeklyFatigueBudget(asOf)`** — sums the load vectors of the trailing 7 days
  of logged sessions and compares to `WEEKLY_FATIGUE_BUDGET` (per-axis recoverable
  ceilings; `assumed`, tunable). Returns `used / budget / remaining / pct /
  worstAxis / overBudget`.
- **Budget-aware ranker** — `rankAdaptationsByValue(..., {useBudget})` discounts
  an adaptation when its **dominant axis** is spent (≥0.75 → ×0.8, ≥0.9 → ×0.5)
  and raises **recovery** when the week is over budget. `planTodayAdaptation`
  enables it by default and returns the `fatigueBudget` snapshot;
  `AthleteState.fatigue` now carries the vector budget alongside acute/chronic/ACWR.

## Consequences

**Positive**
- Every session — run, strength, Fitstop, program or logged — resolves to a load
  vector, and the planner reasons about **per-axis weekly capacity**, not a single
  number. An over-budget week demonstrably flips the top recommendation to
  recovery (test-verified).
- Fitstop is now first-class coaching input (adaptations + interference +
  contribution), with verified/assumed provenance the athlete can trust
  appropriately.
- Zero behaviour change on the generation path: budget gating is **opt-in** and a
  test asserts the default ranker output is byte-identical with vs without the
  flag. All 12 suites green; `test-fatigue-budget.mjs` adds 17 checks.

**Costs / accepted trade-offs**
- **Budget ceilings are `assumed`.** `WEEKLY_FATIGUE_BUDGET` is a defensible
  starting estimate, not calibrated to the individual. A later phase should
  personalise it from the athlete's chronic load / tolerance history.
- **Two Fitstop load tables coexist.** The legacy `FITSTOP_LOAD` still backs
  `Fatigue.sessionFatigue` (untouched for parity); `FITSTOP_KB` backs the new
  `fitstopIntel`. Their numbers match by construction, but a future phase should
  retire `FITSTOP_LOAD` and source everything from `FITSTOP_KB`.
- **Generator doesn't gate on the budget yet.** Deliberate: program generation is
  owned by the Phase 4 pipeline. Enabling budget gating in generation now would
  change produced programs for no visible benefit; the planner path proves the
  mechanism.

## Alternatives considered

1. **Make budget gating the ranker default (affect generation now)** — rejected:
   would change generated programs and break the "sessions still generate
   identically" guarantee. Opt-in keeps generation stable until the pipeline
   owns it.
2. **Keep Fitstop translation inline (no knowledge module)** — rejected: leaves
   Fitstop as opaque numbers with no adaptation mapping or provenance; the brief
   explicitly wants verified-vs-assumed tagging and a translate engine.
3. **A single scalar "readiness-adjusted load"** — rejected: collapses exactly
   the per-axis distinctions (a neuro-heavy lift vs a metabolic-heavy engine
   session) that let the coach sequence stimuli intelligently.
