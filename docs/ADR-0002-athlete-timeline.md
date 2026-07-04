# ADR-0002 — Athlete Timeline (Coach EV v2, Phase 1)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-04
- **Phase:** 1 — Athlete Timeline (read-only)
- **Builds on:** ADR-0001 (Athlete State), `docs/COACH_EV_V2_ROADMAP.md`

## Context

`AthleteState` (Phase 0) answers *"who is this athlete **today**?"* — a
point-in-time snapshot. It deliberately holds no history. But a coach reasons
from the athlete's **story**: the recent sequence of what was trained and how
the body responded. That chronological record is the substrate for later phases
(fatigue trends in Phase 3, the weekly review in Phase 6, memory/pattern
learning in Phase 7).

Today that history is split across two dated stores that are never read
together: `sessions[]` (completed training, each with a `ts`/`date`) and
`recoveryLog[]` (morning check-ins, each with a `date`). Nothing folds them
into one timeline.

## Decision

Add `AthleteTimeline` — an **append-only, read-only** chronological event
stream built by a pure `buildAthleteTimeline()` that folds the existing dated
sources into one newest-first list. No new persistence, no migration; it is
**derived** from `sessions` + `recoveryLog` exactly as ADR-0001 prescribes
(raw inputs stay the truth; the stream is recomputed on demand).

### Event model

Each event is a plain object:

```
{ ts, date, kind:'session'|'recovery', title, subtitle, note, meta:[], tone }
```

- **Session events** (`_tlSessionEvent`) — title = session name; subtitle =
  dist · dur · pace · HR; `note` = the athlete's own note; `meta` = feel + program
  week; `tone` encodes run intensity (easy→green, moderate→blue, hard→red) or
  strength (accent/gold).
- **Recovery events** (`_tlRecoveryEvent`) — title = `Readiness N` (reusing
  `computeRecoveryScore` when the stored score is absent); subtitle = sleep ·
  RHR · HRV · battery; `tone` from the score band (≥67 green, ≥45 accent, else
  red).

`buildAthleteTimeline({limit})` sorts by `ts` descending and caps length.
`timelineSummary()` returns counts + date span for other surfaces.

### View

A simple read-only view lives behind **Stats → "Your story" → Athlete
Timeline**, rendered inside the existing insight bottom-sheet
(`openInsight`). Events are grouped by day with relative headers
(Today / Yesterday / weekday / date) on a vertical rail. No new overlay
plumbing was added.

## Consequences

**Positive**
- One chronological account of the athlete's training + recovery, ready to feed
  trend analysis and the weekly review without each surface re-joining the two
  stores.
- Pure and DOM-free core (`buildAthleteTimeline` / `timelineSummary`) →
  unit-testable and reusable; the view is a thin renderer over it.
- Zero risk to existing behaviour: additive engine + one new, self-contained
  Stats entry point. All 9 prior Playwright suites still pass; the new
  `tests/test-athlete-timeline.mjs` adds 15 checks.

**Costs / accepted trade-offs**
- **Two sources only for now.** Coach-chat memory (`ht-coach-memory`) is a
  single evolving text blob with no per-note timestamps, so it isn't folded in
  as dated events yet; the roadmap's richer event kinds
  (adaptation-achieved, travel, life-event, equipment-change, race) arrive with
  the phases that own them. The event model already has room for them (just more
  `kind`s).
- Built on demand rather than cached. Cheap at current volumes; if it ever
  isn't, memoize keyed off `sessions.length`/`recoveryLog.length`.

## Alternatives considered

1. **Persist a materialized timeline** — rejected: violates ADR-0001's
   "everything is derived." A rebuild from raw inputs is always correct and
   avoids a second source of truth to keep in sync.
2. **Fold the timeline into `AthleteState`** — rejected: the snapshot is
   intentionally point-in-time. History is a separate concern with its own
   growth characteristics; keeping them separate matches the roadmap's data
   model (State vs Timeline vs Memory).
3. **A dedicated full-screen timeline** — deferred: the insight sheet is
   sufficient for a read-only story and adds no navigation surface to maintain.
   Can promote to its own screen if it grows interactive (filters, editing).
