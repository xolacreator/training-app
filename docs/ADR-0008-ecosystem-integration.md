# ADR-0008 — Ecosystem Integration: one shared context; sessions ↔ plan

- **Status:** Accepted (implemented)
- **Date:** 2026-07-06
- **Theme:** Interconnect the Coach Chat, Session Builder and Plan
- **Builds on:** ADR-0001–0007

## Context

The three athlete-facing surfaces were siloed:

- **Plan** (`savedProgram`) is the structured program the whole Coach EV engine
  analyses (adaptations, weekly dashboard, decisions).
- **Session Builder** (`saveSession`) only ever wrote to the **log** (`sessions[]`).
  It could *link* a log to an existing plan slot, but could **not add a session
  into the plan** — so "build a session → it shows up in the plan" was impossible.
- **Coach Chat** built its own context from **raw** sessions/recovery and, worse,
  referenced the **old static 12-week `PLAN`** (`currentPlanWeek/12`) — blind to
  the real program, adaptation status, weekly progress, fatigue budget and
  AthleteState.

The engine was already unified (Phases 0–6); only the *surfaces* were fragmented.

## Decision

Add one shared context and a write-path from sessions into the plan.

- **`coachingContext()` / `coachingContextText()`** — a single ecosystem snapshot
  every surface reads: AthleteState (who), the **real program** (week/phase/this
  week's sessions), **weekly adaptation progress** (completed/scheduled/missed),
  **fatigue budget**, **today's decision + why** (the pipeline), and recent
  results. The text form is a compact prompt block.
- **Coach Chat → consumes it.** `buildCoachSystemPrompt` now embeds a
  "COACH EV ANALYSIS" block from `coachingContextText()` and **drops the stale
  `Plan week: N/12`** line. The coach now reasons from the *same* view the app's
  engine does ("you and the app are one system"); review/programming modes align
  advice to the real plan and adaptation progress.
- **`addSessionToProgram(sessionDef, day)`** — loads a session **into the plan**
  as a real slot (appended to `prog.sessions`, mapped onto a day, de-duplicated
  id), then recomputes AthleteState + re-renders so the engine immediately tracks
  it.
- **`coachSuggestSession()` + `coachAddSuggestedToPlan(day)`** — Coach EV's
  deterministic pick for today (from `runDecisionPipeline` → a concrete session
  via the prescription library), one-tap added to the plan. Surfaced as an
  **"＋ Add this session to today's plan"** action in the Decision Inspector.

**Scope guardrail (chosen default):** the coach **analyses + proposes**; anything
that changes the plan is an explicit action the athlete triggers (the Inspector
button / builder). No silent AI writes to the plan.

## Consequences

**Positive**
- The three surfaces are now one system: the coach sees the real plan/progress,
  the plan is analysed by the engine, and sessions can flow **into** the plan
  from the builder or from Coach EV's recommendation.
- All context derives from the existing engine (no new source of truth); the
  coach prompt can never again drift from the real program.
- Additive + guardrailed: `test-ecosystem.mjs` (18 checks) + full suite green.
  Also fixed a latent time-of-day bug in `weeklyFatigueUsed` (window now ends at
  end-of-today so a session logged today always counts).

**Costs / accepted trade-offs**
- **Prompt size.** The ecosystem block adds tokens to every coach call; it's
  compact (a handful of lines) and replaces some ad-hoc context, so net growth is
  small.
- **Deterministic suggestion, not generative.** `coachSuggestSession` builds the
  session from the decision pipeline + prescription library (safe, explainable),
  not from free-form AI — so it won't invent novel structures. The AI coach can
  still *describe* a bespoke session in chat; wiring that free-text into a
  one-tap add would need structured AI output and is deferred.
- The manual Session Builder form still writes a **log** entry by default; a
  "send this to the plan" affordance on that form is a natural follow-up now that
  `addSessionToProgram` exists.

## Alternatives considered

1. **Let the AI coach write to the plan directly (full autonomy)** — rejected as
   the default: too little guardrail for a destructive, outward-feeling action.
   The plumbing (`addSessionToProgram`) supports it, so it can be enabled later
   behind a setting.
2. **Give each surface its own tailored context** — rejected: that is exactly the
   drift that caused the coach to reference a stale plan. One shared context is
   the point.
