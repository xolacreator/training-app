# ADR-0007 — Weekly Adaptation Dashboard + Weekly Review (Coach EV v2, Phase 6)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-05
- **Phase:** 6 — Weekly Adaptation Dashboard + Coach EV Weekly Review
- **Builds on:** ADR-0001–0006, `docs/COACH_EV_V2_ROADMAP.md`

## Context

Phases 0–5 built the adaptation-first engine, but the athlete's weekly surface
was still a **calendar of checkboxes** (the Plan tab) plus a generic Sun/Mon
digest (session count / volume / load / feel). The roadmap's Phase 6 goal is to
make **adaptations the primary weekly surface**: for the week, what has been
*achieved*, what's still *scheduled*, what's *remaining*, and what was *missed* —
and a Coach EV weekly review that folds that together with consistency, recovery,
fatigue and next-week priorities.

## Decision

Add a pure engine + a thin, restyleable view (the UI is deliberately minimal —
a design pass will follow).

- **`weeklyAdaptationDashboard(week)`** — for the program week's Mon-Sun window
  (or the trailing 7 days if no program), classify each **required adaptation**
  as:
  - **Completed** — a logged session this week created it (`translateSession`);
  - **Scheduled** — a not-yet-done program slot *later this week* would create it;
  - **Missed** — a program slot earlier this week is past and undone;
  - **Remaining** — no session this week targets it.
- **`weeklyReview(opts)`** — folds the dashboard together with consistency
  (done vs planned), a **recovery trend** (this week's avg readiness vs last),
  the **fatigue budget** (Phase 3), volume/load, achieved + missed adaptations,
  and **next-week priorities** (`rankAdaptationsByValue`, budget-gated).
- **View** — `renderWeekAdaptations(week)` draws a tappable "This week ·
  adaptations" card at the top of the Plan tab (objectives hit + status chips);
  `openWeeklyDashboard(week)` opens the full dashboard + review in the insight
  sheet. Both are thin renderers over the engine.

## Consequences

**Positive**
- The weekly surface now leads with **adaptations, not checkboxes** — the
  athlete sees "2/6 objectives hit", which adaptation is missed, and what next
  week prioritises, instead of a bare completion grid.
- Reuses the whole stack: `requiredAdaptationsFor`, `translateSession`,
  `_progWeekSessions`/`_progSessionDone`, `weeklyFatigueBudget`,
  `rankAdaptationsByValue` — no new coaching logic, just aggregation.
- Pure engine → testable (`test-weekly-dashboard.mjs`, 16 checks) and reusable
  by a future weekly-review notification. Additive and safe: the whole suite
  stays green (Plan/scheduler tests unaffected).

**Costs / accepted trade-offs**
- **Coverage, not dosing.** An adaptation is "Completed" if *any* qualifying
  session touched it this week — it doesn't yet check whether the *dose* met the
  adaptation's `weeklyDoses`. Volume-aware completion is a later refinement.
- **Minimal UI on purpose.** The card + sheet are intentionally plain so the
  upcoming design pass can restyle them without reworking logic; the data
  contract (dashboard/review objects) is the stable part.
- The existing Sun/Mon digest is left in place; a follow-up can either retire it
  or have it open this dashboard so there's a single weekly surface.

## Alternatives considered

1. **Replace the Plan calendar entirely with the dashboard** — deferred: the
   calendar is still useful for *what's on which day*; the dashboard sits above
   it as the adaptation lens. Full "calendar is just a view" convergence is
   tracked from Phase 4.
2. **Fold the review into the AI digest note** — rejected: the review is
   deterministic, always-available product (works with no AI key); the AI note
   can summarise it, but the data must not depend on a key.
3. **Volume-weighted completion now** — deferred to keep this phase an
   aggregation layer; needs per-adaptation weekly-dose targets wired through
   first.
