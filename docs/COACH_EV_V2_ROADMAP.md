# Coach EV v2 — Adaptive Coaching Platform

**Status:** Roadmap (pre-implementation). Review each phase before proceeding.
**Thesis:** The product is *coaching decisions*. Workout prescriptions are outputs; **reasoning is the product.** Programming optimizes **adaptation per unit of fatigue** — never "because it's Tuesday."

---

## 1. Architecture audit — what exists today

The current app (`index.html`, ~11k lines, single-file PWA + `knowledge/*.mjs` build) already contains a nascent version of most of the target pipeline. The refactor is mostly **formalizing and re-wiring**, not building from zero.

| Target layer | Exists today | State | Gap to close |
|---|---|---|---|
| **Athlete State Engine** | `baselines`, `recoveryLog`, `savedProgram`, `ht-availability`, `_readinessToday()` | 🟡 Partial, **scattered** | No single canonical `AthleteState` object; state lives in ~15 localStorage keys with no schema/version |
| **Athlete Timeline** | `sessions[]` (with `ts`), `recoveryLog[]` | 🔴 Missing | No unified chronological event stream (sessions + recovery + notes + life events + equipment) |
| **Athlete Memory** | `ht-coach-memory` | 🟡 Partial | Exists for the chat coach; not structured for *programming* insight (preferred sessions, recovery duration, patterns) |
| **Objective Engine** | `objectivesByAdaptationValue()` | 🟡 Partial | Not a distinct layer; weekly objectives not surfaced as the primary unit |
| **Adaptation Engine** | `ADAPTATION_MODEL`, `translateSession()`, `adaptationStatus()` (decay), `rankAdaptationsByValue()` (value÷fatigue), `planTodayAdaptation()`, `_renderAdaptationPriority()` | 🟢 **Strong seed** | Model is thin; needs a full Adaptation Library (fatigue cost, recovery, compatible/conflicting, prescriptions) |
| **Constraint Engine** | `programBuilderConfig`, `buildFromSchedule()`, `suggestReschedule()` / `applyReschedule()`, `_composeHybridDayMap()` | 🟡 Partial | Uses fixed train-days + long-run day; not the Locked / Preferred / Available / Avoid multi-select-per-day model |
| **Prescription Engine** | `_progressEndurance()` (KB-driven), `_genericStrengthSession()`, `_enduranceCoaching()`, `_strengthCoaching()`, `_rxForRunType()` | 🟢 Good | Prescriptions are coupled to run-type, not a standalone Prescription Library keyed by adaptation |
| **Validation Engine** | `validateProgram()` | 🟢 Good | Validates programs, not per-decision (rest-day, fatigue ceiling, interference) |
| **Fitstop Intelligence** | `FITSTOP_BLOCK_C` detail, `buildFitstopHybrid()`, `fitstop_method` KB, partial `translateSession()` | 🟡 Partial | Fitstop treated as workout *content*; no explicit adaptation/load/recovery translation feeding the pipeline |
| **Fatigue Budget** | `translateSession()` returns a fatigue estimate; `rankAdaptationsByValue()` gates on it | 🟡 Partial | Single scalar fatigue; needs a vector (mechanical / metabolic / neuro / connective) + recovery-time + a weekly budget |
| **Decision Inspector** | `_renderAdaptationPriority()` shows value/fatigue ranking | 🟡 Partial | No record of *alternatives considered*, *why rejected*, *confidence* |
| **Sync Engine** | `_activityToSession()` (normalizer), `_parseGPX`/`_parseTCX`, `importActivityFiles()`, `syncActivitiesFromHealth()`, `syncFromStrava()`, worker `/activity` | 🟢 Good seed | Providers are ad-hoc functions, not a formal provider interface; no "state-change → recalculate" trigger |
| **Knowledge Repository** | `knowledge/`: running, strength, hyrox, deka, fitstop, recovery, nutrition, physiology, periodization, core → `RUNNING_KB` / `STRENGTH_KB` | 🟢 **Strong** | Adaptation-first indexing + versioning; wire more domains to the engine |
| **Weekly Adaptation Dashboard** | Plan tab (calendar-first) | 🔴 Missing | No adaptation-first weekly view (completed / scheduled / remaining / missed) |
| **Coach EV Weekly Review** | Daily digest (`ht-last-digest`) | 🔴 Missing | No automated weekly coaching review |
| **Shoe Intelligence** | — | 🔴 Missing | Not tracked |
| **Regression Athlete Framework** | Playwright tests (behavioral) | 🔴 Missing | No athlete personas to evaluate programming changes against |

**Takeaway:** The hard conceptual work — an adaptation model, value = adaptation ÷ fatigue, KB-driven prescription, constraint scheduling, a normalized sync layer — is already in place. Coach EV v2 is a **re-architecture around a canonical Athlete State + an explicit Decision Pipeline**, not a rewrite.

---

## 2. Target architecture

### The decision pipeline (canonical path for every recommendation)

```
Athlete
  → Athlete State Engine     (who is this athlete today?)
  → Objective Engine         (what adaptations remain? what matters now?)
  → Adaptation Engine        (highest-value adaptation per unit fatigue today)
  → Constraint Engine        (fit within availability / fatigue / equipment)
  → Prescription Engine      (best workout to create that adaptation)
  → Validation Engine        (safe? balanced? non-conflicting?)
  → Coach EV                 (decision + explanation)
```

Each layer has **one responsibility** and a **typed input/output**. No coaching logic is duplicated across layers — the calendar becomes a *view* of pipeline output, never a driver.

### Core data model (the three that don't exist yet)

- **`AthleteState`** — the canonical, versioned source of truth. Derived (recomputed) from raw inputs; never hand-edited. Fields: identity/goals, fitness baselines, current adaptation stock (per adaptation, with decay), current fatigue (vector), readiness, availability/preferences, equipment (shoes), upcoming events, Fitstop participation, trends.
- **`AthleteTimeline`** — an append-only chronological event stream (session, recovery, note, adaptation-achieved, fatigue-trend, travel, life-event, equipment-change, race). The athlete's *story*.
- **`AthleteMemory`** — learned, durable insights (preferred session types, typical recovery duration, injury history, patterns that worked, consistency, shoe/scheduling preferences).

### Engineering guardrails (ADRs)

1. **Stay single-file PWA.** Engines are clearly-bounded namespaces/IIFEs *within* `index.html` with documented interfaces — not a framework or build step for the app shell. Knowledge stays in `knowledge/*.mjs` → built into inline `*_KB` blocks.
2. **Everything is derived + versioned.** `AthleteState` has a schema version and a pure recompute function; raw inputs (sessions, recovery, prefs) remain the persisted truth so recompute is always possible. Backward-compatible migration from today's localStorage keys.
3. **The pipeline is pure and inspectable.** Given an `AthleteState` it returns a decision *and* a `DecisionRecord` (inputs, candidates, chosen, rejected + reasons, confidence). Same input → same output → testable against personas.
4. **Providers behind an interface.** Sync sources implement one `Provider` shape; the coaching engine reacts to normalized `state-change` events, not to any one provider.
5. **Separate verified / user-provided / evidence-informed.** Especially for Fitstop load estimates — tag every knowledge claim.

---

## 3. Phased roadmap

Each phase is **shippable, backward-compatible, and independently reviewable.** No phase removes working functionality; new engines run alongside the old path until proven, then the old path is retired.

### Phase 0 — Athlete State foundation  *(enabler; no visible change)*
- Introduce a canonical `AthleteState` object with a versioned schema and a pure `recomputeAthleteState()` that reads today's existing localStorage (`baselines`, `recoveryLog`, `savedProgram`, `ht-availability`, goals, sessions) via **adapters** — no data migration required.
- Wire the existing screens to *read through* `AthleteState` (Strangler pattern) without changing behavior.
- **Exit:** every current screen renders identically, now sourced from `AthleteState`; a `DecisionRecord` type is defined (empty for now).

### Phase 1 — Athlete Timeline  *(read-only)*
- Build `AthleteTimeline` by folding sessions + recovery + coach notes into a chronological stream.
- Add a simple timeline view (behind Stats/More) — the athlete's story.
- **Exit:** timeline reconstructs correctly for the regression personas (Phase 8 seed) and the live account.

### Phase 2 — Adaptation & Prescription libraries  *(formalize the "product")*
- Promote `ADAPTATION_MODEL` → a full **Adaptation Library** (`knowledge/adaptations.mjs`): purpose, primary/secondary adaptations, typical fatigue cost, recovery expectation, progression strategies, compatible/conflicting adaptations, candidate prescriptions.
- Split a standalone **Prescription Library** (`knowledge/prescriptions.mjs`): each adaptation → many prescriptions (`3×10 min`, `5×1 km`, tempo, cruise intervals, progression run…). Prescription varies by state; adaptation stays constant.
- Re-point `_progressEndurance` / `_genericStrengthSession` to consume the libraries.
- **Exit:** current sessions still generate; adaptation ↔ prescription is now a clean many-to-one the engine selects from.

### Phase 3 — Fatigue Budget + Fitstop Intelligence Engine
- Replace scalar fatigue with a **load vector** per session: mechanical, metabolic, neurological, connective-tissue, expected-recovery-time. Add a rolling **weekly fatigue budget**.
- Build the **Fitstop Intelligence Engine** (`knowledge/fitstop_translate.mjs` + engine): translate a Fitstop session → estimated primary/secondary adaptations + load vector + recovery + run interference + strength/conditioning contribution. Clearly tag verified vs assumed.
- **Exit:** every session (run, strength, Fitstop) resolves to a load vector; the ranker gates on the budget, not a scalar.

### Phase 4 — Decision Pipeline + Decision Inspector  *(the thesis lands here)*
- Assemble the pipeline as the **canonical planner**: State → Objective → Adaptation → Constraint → Prescription → Validation. Today/Plan render its output.
- **Decision Inspector**: every recommendation emits a `DecisionRecord` — athlete state snapshot, objectives, adaptation chosen, alternatives considered + why rejected, constraints applied, expected outcome, confidence. Surface a plain-language summary via Coach EV; keep the full record for QA.
- **Exit:** "why this session" answers all seven principle questions from a real `DecisionRecord`; the calendar is now purely a view.

### Phase 5 — Training Preferences (constraints v2)
- Replace fixed weekly schedules with a **Preferences model**: per day, multi-select **Locked / Preferred / Available / Avoid** (e.g. Sat = Locked Long Run; Mon = Preferred Run + Fitstop). Constraint Engine optimizes within it.
- **Exit:** the builder + rescheduler honor multi-tag day preferences; nothing is placed on an "Avoid" day; "Locked" is immovable.

### Phase 6 — Weekly Adaptation Dashboard + Weekly Review
- Adaptation-first weekly view: objectives (Aerobic Durability, Threshold, Strength Maintenance, Economy, Power, Recovery, Race Specificity) with Completed / Scheduled / Remaining / Missed.
- **Coach EV Weekly Review** generator: adaptations achieved, objectives completed, recovery/consistency/fatigue trends, strength & running progression, next-week recommendations.
- **Exit:** the athlete's primary weekly surface is adaptations, not checkboxes.

### Phase 7 — Sync Engine v2 + Memory + Shoes
- Formalize a `Provider` interface (Apple Health, Garmin-via-Health, FIT/GPX import, manual) behind one Sync Engine; imports normalize → detect state change → trigger `recomputeAthleteState()` → notify Coach EV. Reduce hard Strava dependency.
- **Athlete Memory** learning loop (preferred sessions, recovery duration, patterns) feeding future decisions.
- **Shoe Intelligence**: per-shoe mileage/purpose/surface/plate/wear; recommend a shoe per prescribed session.
- **Exit:** adding a provider needs no coaching-engine change; state recalculation is event-driven.

### Phase 8 — Regression Athlete Framework  *(cross-cutting; seed early, enforce here)*
- Representative personas: Beginner, Half, Marathon, HYROX Open, HYROX Pro, Fitstop Member, Hybrid, Busy Professional, Masters.
- Every major programming change runs the pipeline against all personas; snapshot the `DecisionRecord`s and diff.
- **Exit:** CI-style persona suite guards all future coaching changes.

### Cross-cutting (throughout)
- **Knowledge Repository** expansion (evidence-informed, versioned; verified/user/assumed tags).
- **Documentation**: one short ADR per phase in `docs/`.

---

## 4. Suggested sequencing rationale

- **0 → 1 → 2 → 3** build the *substrate* (state, story, libraries, fatigue) that everything else consumes — low user-visible risk, high leverage.
- **4** is where "reasoning is the product" becomes real and visible; it depends on 0–3.
- **5 → 6** are the UX expression of the new spine (preferences in, adaptations out).
- **7 → 8** harden data-in and quality.

Recommended first review gate: **Phases 0–2** as a batch (foundation), since they're invisible to the user but unblock everything. Then review 3 and 4 individually — those change coaching behavior.

---

*Prepared as an audit + plan only. No implementation performed. Awaiting go-ahead on Phase 0 (or a re-prioritization).*
