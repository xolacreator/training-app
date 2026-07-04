# ADR-0001 — Canonical Athlete State (Coach EV v2, Phase 0)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-04
- **Phase:** 0 — Athlete State foundation (enabler; no visible change)
- **Supersedes / relates to:** `docs/COACH_EV_V2_ROADMAP.md`

## Context

Coach EV v2 reframes the product: **the primary output is a coaching
*decision*, and the reasoning behind it is the product** — workout
prescriptions are just the surface. Every recommendation must be able to answer
*Who is this athlete today?*, *What fatigue exists?*, *What's the
highest-value adaptation available?*, and *Why is this the best decision?*

Today those facts are scattered. Readiness is recomputed ad-hoc in
`_readinessToday()`, training load lives inside `renderTrainingLoad()` (coupled
to the DOM), the program week is derived on demand by `_progActualWeek()`,
adaptation decay comes from `adaptationStatus()`, baselines/goals sit in
disparate `localStorage` keys, and the next race is re-scanned inside
`renderToday()`. There is no single object that says "here is the athlete,
right now." Without one, the decision pipeline planned for later phases would
have to re-derive the same facts inconsistently in each screen.

## Decision

Introduce a single, **versioned, read-only** `AthleteState` snapshot, built by
a pure `recomputeAthleteState()` that reads the *existing* state via
**adapters** — **no data migration, no schema change to `localStorage`**.

- `ATHLETE_STATE_VERSION = 1` — snapshot carries `v` so later phases can evolve
  the shape without breaking readers.
- `recomputeAthleteState()` — assembles the snapshot from current app state
  (reads only; never mutates state or the DOM) and returns it.
- `athleteState()` — accessor that returns the current snapshot, building it
  lazily on first use.
- `makeDecisionRecord()` + `DECISION_LOG` — the `DecisionRecord` type is
  **defined now but left empty**; Phase 4's decision pipeline will populate it.

### Snapshot shape (v1)

| Field | Source adapter | Notes |
|-------|----------------|-------|
| `identity.goal` | `ht-goal*` keys + `trainGoal` | text, category, raceType, strength* |
| `fitness.baselines` | `baselines` | read-only reference |
| `adaptations` | `adaptationStatus(required)` | `[{id,name,status,since,urgency}]` |
| `topAdaptation` | `rankAdaptationsByValue(...)` | highest value today |
| `fatigue` | `computeSessionLoad` over `sessions` | `{acute,chronic,acwr}` (mirrors Stats) |
| `readiness` | `_readinessToday()` | 0–100 or null |
| `program` | `savedProgram` + `_progActualWeek` + `_programPhases` | `{id,name,type,week,totalWeeks,phase}` |
| `availability` | `athleteAvailability` / `ht-availability` | raw for now |
| `equipment.shoes` | — | placeholder (Phase 7) |
| `events.nextRace` | `PLAN` calendar scan | `{label,day,daysTo}` or null |
| `sessionCount` | `sessions.length` | |
| `trends` | — | placeholder (Phase 1 timeline) |

### Freshness (Strangler pattern)

The snapshot is rebuilt on the three writes that can change the athlete
picture — `saveData()` (sessions), `saveProgramData()` (program), and
`saveRecovery()` (readiness) — plus once at init after data loads. Each trigger
is wrapped in a guarded `try/catch` so it can never break an existing save
path.

`AthleteState` sits **alongside** the current screens, not in front of them.
No screen was rewired in this phase, so rendering is byte-for-byte unchanged.
Screens migrate to *read through* the snapshot incrementally in later phases —
the Strangler fig grows around the legacy code before replacing it.

## Consequences

**Positive**
- One authoritative answer to "who is this athlete today," ready for the
  Objective → Adaptation → Constraint → Prescription pipeline.
- Versioned + additive → safe to evolve; readers can gate on `v`.
- Pure and DOM-free → unit-testable (see `tests/test-athlete-state.mjs`, 17
  checks) and reusable across screens, the Decision Inspector, and exports.
- Zero behaviour change: all 9 existing Playwright suites still pass.

**Costs / accepted trade-offs**
- **Duplicated load maths.** `_computeLoadMetrics()` re-derives acute/chronic
  load rather than refactoring `renderTrainingLoad()`, to guarantee Stats
  renders identically this phase. The two must stay in sync until a later phase
  converges them onto the shared helper. (A test asserts acute load is positive
  and ACWR is numeric; a future phase should assert equality with the Stats
  figure.)
- `recomputeAthleteState()` recomputes the whole snapshot on each trigger.
  Cheap at current data volumes; if it ever isn't, memoize by a state hash.
- Placeholders (`equipment`, `trends`) are intentionally empty until their
  owning phases.

## Alternatives considered

1. **Migrate `localStorage` to a new athlete schema now** — rejected: high risk
   to existing users' data for no user-visible benefit this phase. Adapters
   give the same read model with none of the migration risk.
2. **Compute state lazily per screen (no shared object)** — rejected: that is
   the status quo that causes inconsistency; it doesn't give the pipeline a
   single source of truth.
3. **Reactive store / observer layer** — rejected as premature. Explicit
   recompute-on-write is sufficient, trivial to reason about, and adds no
   framework. Can revisit if read-through fan-out demands it.
