# Regression Harness (Phase 0)

The coaching-quality safety net. It lets us prove that every future change to the
coaching pipeline (knowledge extraction, reasoning, validation, specialist modules)
**improves or holds** the output for a fixed set of benchmark athletes — with the
app staying fully functional throughout.

## What it does

For nine benchmark athletes (`benchmarks/athletes.mjs`) it loads the **real
`index.html`** headlessly, seeds the athlete, and records three things per athlete
into `snapshots/<key>.json`:

1. **`prompt`** — the exact system + user generation prompt our coaching logic
   produces today. This is the real, deterministic output of the coaching logic and
   the thing future phases (knowledge repo, reasoning engine) will change. Snapshots
   make those changes visible and intentional.
2. **`program`** — the program after the real post-processing pipeline
   (`_normalizeProgram` → `savedProgram`), with volatile fields (`id`, `startDate`)
   stripped so snapshots are stable.
3. **`metrics`** — a coaching-quality analysis (`analyzeProgram`): discipline mix,
   intensity distribution (easy vs quality), progression/deload, structural validity,
   and **concurrent-training flags** (hard run adjacent to a strength day). These
   metrics double as the seed checks for the future Validation Engine.

## How the AI is handled

Program *generation* is non-deterministic and needs an API key, so the harness
**stubs `aiAPI`**: it captures the real prompt and returns a deterministic, type-
appropriate fixture program (`synthProgram`). This keeps the harness reproducible and
keyless. The deterministic pipeline + the prompt are what we regression-test.

> An optional live mode (`LIVE=1`, with a key configured) to run real generation
> through the same analyzer is planned but not required for regression.

## Usage

```bash
node tests/run.mjs            # update snapshots + print the metrics table
node tests/run.mjs --check    # compare against committed snapshots; non-zero exit on any change
```

Run `--check` before/after a change. Any intended change should be reviewed in the
snapshot diff, then committed by re-running without `--check`.

## Benchmark athletes

Beginner · Weight loss · Half marathon · Marathon · HYROX Open · HYROX Pro ·
Hybrid athlete · Masters · Busy professional.

Each is a realistic profile + baselines + program-builder config. Add a new archetype
by appending to `BENCHMARKS` in `benchmarks/athletes.mjs`.

## Files

| Path | Role |
|------|------|
| `benchmarks/athletes.mjs` | The nine benchmark athlete fixtures |
| `lib/harness.mjs` | Browser control, AI stub, fixture synthesis, metrics analyzer |
| `run.mjs` | Runner (update / `--check`) |
| `snapshots/*.json` | Committed baselines |

## Requirements

Node 22 + Playwright (Chromium). The harness auto-resolves Chromium via
`CHROME_PATH`, then `PLAYWRIGHT_BROWSERS_PATH`, then Playwright's default.
