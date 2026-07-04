# ADR-0006 — Training Preferences / Constraints v2 (Coach EV v2, Phase 5)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-04
- **Phase:** 5 — Training Preferences (constraints v2)
- **Builds on:** ADR-0001–0005, `docs/COACH_EV_V2_ROADMAP.md`

## Context

The roadmap asked Phase 5 to replace fixed weekly schedules with a per-day,
multi-select **Locked / Preferred / Available / Avoid** model that the Constraint
Engine optimises within. The audit found the **data model, UI, and builder-side
constraint logic already existed**: `athleteAvailability` stores per-day /
per-category L/P/A/A tags (`AVAIL_STATUSES`, `AVAIL_META`, `TRAINING_CATEGORIES`),
`renderTrainingPreferences()` is a tap-to-cycle grid, `availabilityForDay()`
groups the tags, and `scheduleWeek()` already places Locked commitments first and
ranks Preferred > Available > none. So the gaps to the roadmap's **exit criteria**
were narrow but real:

1. *"Nothing is placed on an Avoid day."* — the builder's last-resort fallback
   could still **force-place** an objective onto an Avoid day when no other free
   day existed.
2. *"The rescheduler honours multi-tag preferences; Locked is immovable."* — the
   dynamic rescheduler (`suggestReschedule`) ignored preferences entirely: it
   could move a session onto an Avoid day and could move a Locked session.

## Decision

Close the two gaps and surface preferences in the canonical state.

- **Builder — Avoid is now a hard constraint.** `scheduleWeek()`'s fallback skips
  Avoid days; if the only remaining legal days are Avoid, the objective is left
  **unplaced** (and reported) rather than forced onto a day the athlete excluded.
- **Rescheduler — preference-aware.** `suggestReschedule()` now:
  - maps the session to its preference category (`_sessionCategoryId`);
  - returns `null` if that session sits on a **Locked** day (immovable);
  - never proposes a **target** day that is Avoid for the session's category, or
    that carries a Locked commitment (which must not be displaced);
  - among legal targets, prefers the athlete's **Preferred** then **Available**
    days, and says so in the explanation.
- **State — `AthleteState.preferences`** now carries the per-day grouped
  `{locked, preferred, available, avoid}` tags, so the Decision Pipeline / Inspector
  can cite them as applied constraints.

## Consequences

**Positive**
- The exit criteria are met and test-locked: nothing is placed on an Avoid day
  (an Avoid-only objective goes unplaced instead of being forced); a Locked
  session is immovable; the rescheduler prefers Preferred/Available days and never
  lands on Avoid. `test-preferences.mjs` adds 12 checks.
- The constraint model is now consistent across both entry points (builder and
  rescheduler) and visible in `AthleteState`.
- Additive and safe: the whole existing suite stays green
  (`test-reschedule` 10/10, `test-scheduler` 12/12) apart from one **pre-existing**
  `fitstop-hybrid` failure that predates this phase and is unrelated to
  preferences.

**Costs / accepted trade-offs**
- **Avoid can now reduce placement.** Making Avoid strict means a badly-constrained
  week (everything Avoid) yields unplaced objectives rather than a full week. That
  is the correct, honest behaviour — the athlete's constraint wins — and the
  unplaced list is surfaced, but it is a behaviour change for pathological setups.
- **Category granularity.** `_sessionCategoryId` maps a session to a single
  preference category (e.g. tempo → `workout-run`). Sessions that could satisfy
  several categories are checked against their primary one; richer multi-category
  matching is deferred.
- The UI grid was already shipped; this phase changed only the engine, so there is
  no new user-facing surface — the effect is that the existing grid now actually
  governs both scheduling paths.

## Alternatives considered

1. **Keep Avoid as a soft preference (force-place as last resort)** — rejected:
   the roadmap exit is explicit ("nothing is placed on an Avoid day"), and an
   athlete marking a day Avoid (travel, work, injury) means it, so honouring it
   strictly is correct.
2. **A separate preferences store distinct from `athleteAvailability`** — rejected:
   the existing store already models L/P/A/A per day/category; a parallel store
   would duplicate truth. This phase wired the engine to the store that exists.
