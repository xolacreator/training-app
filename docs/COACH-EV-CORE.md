# Coach EV — Core Architecture & Living Roadmap

> The athlete should experience a coach, not software.
> Every change answers one question: **does this make Coach EV behave more like an elite human coach?**

This document is the living source of truth for the coaching-intelligence architecture.
Update it at the end of every development cycle (Step 7 of the flywheel).

---

## 1. Architecture at a glance

All coaching logic lives in `index.html` (single-file PWA). Knowledge is authored in
`knowledge/*.mjs` and compiled into inline `*_KB` constants by `scripts/build-knowledge.mjs`.

**Coach EV Core** (`index.html`, defined just before `// INIT`) is a thin, additive facade
over the existing engines. It moves/rewrites nothing — it gives the brain one API surface:

| Service | `CoachEV.*` | Delegates to (examples) |
|---|---|---|
| Athlete Model | `athlete` | `athleteState`, `buildAthleteTimeline`, `athleteProfile`, `_readinessToday`, `computeVO2maxComposite`, `computePersonalBests` |
| Knowledge Repository | `knowledge` | `adaptationInfo`, `ADAPTATION_MODEL`, `prescription(sFor)`, `runningDomain`, `strengthDomain` |
| Decision Engine | `decision` | `planTodayAdaptation`, `runDecisionPipeline`, `validateDecision`, `rankAdaptationsByValue`, `suggestReschedule` |
| Programming Engine | `programming` | `saveProgramData`, `buildAdaptiveWeek`, `scheduleWeek`, `addSessionToProgram`, `moveProgramSession` |
| Performance Intelligence | `performance` | `_progressTrends`, `raceEstimates`, `_computeLoadMetrics`, `_statsBuckets`, `weeklyFatigueBudget`, `Fatigue.sessionFatigue` |
| Explainability Engine | `explain` | `coachExplainToday`, `DECISION_LOG`, `_coachMissingData`, `coachingContext` |
| Learning Engine | `learning` | **stub** — awaits spec |
| Feedback Engine | `feedback` | **stub** — awaits spec |

Utility: `CoachEV.services()`, `CoachEV.diagnostics()` (developer transparency snapshot).

### Consumption principle
Features should read coaching intelligence through `CoachEV.*`, not by calling internals.
The UI renders; the Core reasons. Migrate call-sites opportunistically (evolution, not rewrite).

---

## 2. The Explainability Engine

`CoachEV.explain.today(opts)` runs the canonical decision pipeline and returns the structured
explanation an elite coach would give — one object answering every Developer-Mode question:

- `recommendation` — adaptation + status + prescription chosen
- `confidence` — 0–1
- `reason` — prose rationale
- `inputs` — the athlete data that influenced it (readiness, goal, phase, required adaptations, fatigue budget)
- `rulesFired` — validation checks + feasibility constraints, each `{rule, passed, detail, limiting}`
- `adaptationsRanked` — all candidates by value, exactly one `chosen`
- `alternatives` — runners-up with `whyNot`
- `stock` — achieved-vs-needed status of every required adaptation
- `missingData` — gaps that would sharpen the call, each with `impact` + a concrete `fix`
- provenance — `decisionId`, `athleteStateAt`, `at`, `asOf`

**Durability:** the reasoning trail (`DECISION_LOG`, last 50) now persists to `localStorage`
(`ht-decision-log`) and rehydrates on load — the coaching memory survives reloads.

---

## 3. Cycle history

**Cycle 1 — Coach EV Core + Explainability Engine** *(shipped, rev7)*
Additive `CoachEV` facade over the existing engines; `coachExplainToday` trace;
decision-log durability (`ht-decision-log`). `test-coach-ev-core` 26/26.

**Cycle 2 — Explainability in the UI** *(shipped, rev7)*
Decision Inspector now renders the trace: a value-ranking "why this one" bar view
and a "what would sharpen this call" missing-data section. Inspector routed through
`CoachEV` (first Core adoption). Added `CoachEV.explain.trace(record)`.

| Step (latest cycle) | Status |
|---|---|
| 1 Understand → 7 Reflect | ✅ complete; both cycles deployed to production |

---

## 4. Implementation progress

### Completed components
- **Coach EV Core facade** — 6 live services + 2 declared stubs; delegation-only, guarded, non-throwing.
- **Explainability Engine** — full decision trace, missing-data analysis, `diagnostics()`.
- **Decision-log durability** — `ht-decision-log` persistence + rehydration.
- Pre-existing engines (unchanged, now surfaced through Core): Athlete State/Timeline, Adaptation
  model + status + value ranking, Decision pipeline + validation + 7-question inspector, Fatigue
  budget, Constraint scheduler, Progress trends, Race estimator, VO₂max composite, Weekly review.

### Outstanding components
- **Route remaining call-sites through Core**: migrate `renderToday` coaching calls
  (`_renderAdaptationPriority`, `_coachInsights`, `_coachReadText`) to `CoachEV.*` (incremental).
- **Developer panel**: a hidden diagnostics view rendering `CoachEV.diagnostics()` + decision history.
- **Coaching-copy hygiene**: replace em dashes with hyphens in decision copy (`decisionQuestions`,
  pipeline `reason`, prescription `structure`) — standing product rule, now prominent in the inspector.
- **Learning Engine**: activate once the outcome→priority spec lands.
- **Feedback Engine**: activate once the post-session feedback schema lands.

---

## 5. Technical debt & risks

| Item | Notes |
|---|---|
| Two adaptation lists | `ADAPTATION_MODEL` (numeric engine) vs legacy `ADAPTATIONS` (scheduler). Converge over time. |
| `athleteStateRef` dangling | Decision records reference `AthleteState.computedAt` but no historical state is retained to dereference. Consider a small ring-buffer of past states. |
| Single-file size | `index.html` ~1.09 MB source; minified ~0.90 MB vs ~1 MB deploy cap. Margin is eroding — watch the minify size warning. |
| Bare-global coupling | UI still calls internals directly; Core adoption is opt-in until call-sites migrate. |

---

## 6. Knowledge gaps (knowledge-first — do not invent)

- **Learning**: how observed outcomes (PBs, session feel, HRV response to load) should update
  adaptation priority / retention / the fatigue model.
- **Feedback**: post-session feedback schema (RPE vs prescribed, pain flags, enjoyment) and how it
  feeds the decision engine.

When these specs land, the `learning` / `feedback` stubs become live services with no facade change.

---

## 7. Next highest-leverage opportunity (Cycle 3)

**Developer/Coach diagnostics panel + Core adoption.** Add a hidden diagnostics view (from More)
that renders `CoachEV.diagnostics()` and the persisted decision history — making the mandate's
"developer transparency" real and giving a window into the brain's state, confidence over time,
and data gaps. Bundle the low-risk coaching-copy em-dash hygiene while touching this surface, and
migrate one more `renderToday` call-site to `CoachEV.*`. High alignment with Developer Mode, low
risk, advances Core adoption.
