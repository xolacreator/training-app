# Knowledge Repository

The coaching knowledge layer. Structured, versioned, modular coaching science that the
Reasoning + Programming engines draw on — so recommendations are **explainable and
scientifically defensible**, not improvised inside a prompt.

> Status: **scaffold / proposal**. These modules are inert — not yet loaded by the app.
> They define the schema and sourcing policy and provide one fully-worked domain
> (`running`) so the structure can be reviewed before the full corpus is authored.

## Why a repository (not prompt strings)

Today coaching "knowledge" is hard-coded as map literals inside prompt-builder
functions (`goalMap`, `methodMap`, `splitMap`, …), duplicated across several functions.
That is unversionable, untestable, and unexplainable. The repository replaces it with
structured data that:

- is **versioned** (each entry has a `version`; the repo has a `repoVersion`),
- is **modular** (one file per domain),
- is **retrievable** (engines pull only the relevant slices — knowledge is never dumped
  wholesale into a prompt),
- is **sourced** (every entry cites the science or the verified provider it came from).

## Domains

`core` · `running` · `strength` · `hyrox` · `fitstop` · `deka` · `nutrition` ·
`recovery` · `periodization` · `physiology` · `exercise_library`

Each domain is a module exporting an array of **knowledge entries**.

## Entry schema

```js
{
  id: 'running.threshold',          // unique, `<domain>.<slug>`
  domain: 'running',
  version: 1,
  title: 'Threshold / Lactate-Threshold Development',
  summary: 'One-to-two sentence essence a coach could say out loud.',
  principles: [ 'coaching principles, bullet form' ],
  prescription: {                   // how to actually program it
    intensity: '...', duration: '...', frequency: '...', progression: '...'
  },
  cautions: [ 'failure modes / contraindications' ],
  appliesTo: ['running','hyrox','hybrid'],   // which program types this informs
  tags: ['threshold','aerobic'],
  sources: [ 'Established science: ... (public framework)' ]
}
```

## Sourcing policy (non-negotiable)

1. **Established coaching science** — authored with reference to public, citable
   frameworks (e.g. Seiler polarised intensity distribution, Daniels' VDOT, Coggan
   training zones, ACSM guidance, RIR/RPE autoregulation, Helms/Israetel volume
   landmarks, Bompa/periodisation literature). Sources are named in each entry.
2. **Proprietary methodology is never fabricated.** Fitstop (and any proprietary DEKA
   coaching method) is encoded **only from verified, user-provided material**. Until
   provided, those domains hold a clearly-marked placeholder and the engine falls back
   to established conditioning science — it does **not** invent a methodology.
3. **Public event formats** (HYROX's 8×1km + 8 stations; DEKA's zone format) are
   factual and may be encoded as event *demands*; the *coaching method* for them still
   follows policy 1/2.

## Retrieval

`index.mjs` exposes the read API the engines use:

```js
Knowledge.get('running.threshold')        // one entry
Knowledge.byDomain('running')             // all entries in a domain
Knowledge.select({ programType, goal, phase, tags })  // relevant slice for reasoning
Knowledge.repoVersion                     // bump on any change
```

`select()` is deliberately narrow: it returns a small, relevant set for the Programming
Engine to reason over and (compactly) inject — never the whole corpus.

## Integration (later, deliberate step)

How this reaches the running app (a single-file PWA) is an open decision — inline at a
small build/concat step, or a separate cached script. That is decided before wiring;
authoring the content here is independent of it.
