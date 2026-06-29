# Running Knowledge Library

A modular, evidence-informed running coaching library the Programming Engine consults
to reason about adaptations and programming — instead of a monolithic prompt.

> Not copied from any book, course, or proprietary program. Each domain summarises
> major coaching principles, physiological concepts, and programming frameworks from
> established endurance science and publicly available coaching methodology.

## Domains (18)

Exercise Physiology · Energy Systems · Aerobic Development · Lactate Threshold ·
VO₂max · Running Economy · Speed Development · Long Runs · Race-Specific Programming ·
Concurrent Training · Recovery Science · Biomechanics · Injury Prevention ·
Treadmill Training · Track Training · Trail Running · HYROX Running · DEKA Running.

## Source tiers (every domain is tagged)

| Tier | Meaning |
|------|---------|
| `established` | Exercise-science consensus (peer-reviewed physiology) |
| `accepted` | Widely accepted coaching practice |
| `methodology` | A named, public methodology's concept (cited by name) |
| `synthesis` | Coach EV's synthesised coaching philosophy (clearly labelled, not a source) |

## Domain schema

```js
{
  id, title, sourceTier, summary,
  coreConcepts[], adaptations[], programming[], progression[],
  recovery[], contraindications[], relatedTo[]   // related domain ids
}
```

## How it reaches the app (build step)

The single-file PWA can't import these modules at runtime, so the build step bridges them:

```bash
node scripts/build-knowledge.mjs        # regenerates the inline RUNNING_KB in index.html
node scripts/build-knowledge.mjs --check # CI: fail if index.html is out of date
```

It serialises `RUNNING_DOMAINS` + `COACH_EV_PHILOSOPHY` into an inline `RUNNING_KB`
constant in `index.html` between `/* RUNNING_KB:START */` and `/* RUNNING_KB:END */`
markers. **Edit the library here, never the generated block.** The engine
(`getKnowledgeContext`, endurance progression/reasoning) queries `RUNNING_KB` by domain.

## Extending

Add or edit a domain object in `library.mjs`, bump `RUNNING_KB_VERSION`, run the build
step, and run the regression harness (`node tests/run.mjs --check`).
