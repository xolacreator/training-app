# ADR-0005 — Decision Pipeline + Decision Inspector (Coach EV v2, Phase 4)

- **Status:** Accepted (implemented)
- **Date:** 2026-07-04
- **Phase:** 4 — Decision Pipeline + Decision Inspector ("the thesis lands here")
- **Builds on:** ADR-0001–0004, `docs/COACH_EV_V2_ROADMAP.md`

## Context

Phases 0–3 built the substrate: a canonical `AthleteState`, an adaptation
timeline, adaptation/prescription libraries, and a per-axis fatigue budget. Each
piece already existed as a callable function, but nothing **assembled** them into
a single, inspectable decision — and, crucially, nothing **explained** the
decision to the athlete. The product thesis ("the product is coaching decisions;
reasoning is the product") had no surface.

## Decision

Assemble the canonical planner and make its reasoning visible.

- **`runDecisionPipeline(opts)`** — one function that runs the pipeline in order
  and returns a **populated `DecisionRecord`** (the type defined empty in
  ADR-0001):
  1. **State** — `athleteState()` snapshot (who is this athlete today).
  2. **Objective** — `requiredAdaptationsFor` + `adaptationStatus` (achieved vs
     remaining).
  3. **Adaptation** — `rankAdaptationsByValue(..., {useBudget:true})` → the
     highest-value adaptation, budget-gated.
  4. **Constraint** — readiness, fatigue budget (worst axis / over-budget),
     availability, recorded as applied constraints.
  5. **Prescription** — `selectPrescription` for the athlete's state + the
     candidate options.
  6. **Validation** — `validateDecision` (new): a per-decision check (distinct
     from the program-wide `validateProgram`) — is a hard adaptation being
     pushed at low readiness / over budget?
  7. → a `DecisionRecord` with chosen adaptation, **alternatives + why rejected**,
     constraints, validation, a plain-language `reason`, and a `confidence`
     score; pushed to `DECISION_LOG` (bounded to 50).
- **`decisionQuestions(record)`** — maps a record to the **seven** coaching
  questions, answered in plain language.
- **Decision Inspector** — `openDecisionInspector()` renders those seven answers
  + a confidence bar in the insight sheet, titled **"Why this session?"**. The
  existing Today "priority adaptation" card is now tappable into it (`Why? ›`).

## Consequences

**Positive**
- The thesis is now real and **visible**: every recommendation can answer *who is
  this athlete, what's achieved/remaining, what fatigue exists, the highest-value
  adaptation, the prescription that creates it, the alternatives considered + why
  rejected, and why this is the best call* — all from one real `DecisionRecord`,
  not hand-wavy copy.
- The record is inspectable and logged (`DECISION_LOG`) → the substrate for QA and
  the Phase 8 persona regression suite (snapshot + diff decisions).
- Correct behaviour under stress is test-verified: an over-budget week at low
  readiness flips the decision to **recovery** and validation passes; a hard
  adaptation at low readiness + over budget raises two validation warnings.
- Additive and safe: all 13 suites green; `test-decision-pipeline.mjs` adds 20
  checks. The only UI change is making an existing card tappable + a new sheet.

**Costs / accepted trade-offs**
- **The calendar is not yet "purely a view" of the pipeline.** Today/Plan still
  render sessions via the existing generators; the pipeline drives the *decision +
  explanation* surfaced in the Inspector, and it *references* the same
  libraries/generators the calendar uses. Fully re-pointing generation through
  the pipeline (so the prescribed session content is emitted by the pipeline) is
  deferred — doing it now would change what the calendar shows for no added
  explanatory value. The exit criterion "why this session answers all seven
  questions from a real DecisionRecord" **is** met; "calendar is purely a view"
  is partially realised and tracked as follow-up.
- **Confidence is a heuristic** (readiness, budget headroom, adaptation urgency,
  validation warnings), not a calibrated probability. It communicates relative
  certainty; treat it as such.

## Alternatives considered

1. **Render the pipeline as the Today session generator now** — rejected for this
   phase: high risk of changing produced sessions, and the explanatory win (the
   actual Phase 4 goal) is fully achieved via the Inspector without it.
2. **Show the reasoning only in the AI chat coach** — rejected: the reasoning is
   core product, not a chat feature; it belongs on a deterministic, always-present
   surface the athlete can open for any day.
3. **A terse "because it's threshold day" line** — rejected: that is exactly the
   day-of-week thinking the thesis forbids. The seven-question record forces the
   decision to justify itself from athlete state.
