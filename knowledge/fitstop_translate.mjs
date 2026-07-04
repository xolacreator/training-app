// ─────────────────────────────────────────────────────────────────────────────
// FITSTOP INTELLIGENCE — translate a Fitstop session into coaching signal.
//
// Coach EV must reason about Fitstop sessions the same way it reasons about runs
// and lifts: what ADAPTATIONS does this session create, what LOAD does it cost
// (the 4-axis fatigue vector + recovery time), how much does it INTERFERE with
// hard running, and what does it contribute to STRENGTH vs CONDITIONING?
//
// EVIDENCE TAGGING (per the brief — separate verified from assumed):
//   verified — from the user-provided real methodology (Fitstop BLOCK C 2026):
//              the weekly split, the four session archetypes, the LIFT phase
//              progression (BASE→BUILD→PERFORMANCE→PEAK).
//   assumed  — Coach EV's evidence-informed LOAD ESTIMATES (the numeric fatigue
//              vectors, interference and contribution weights). These are
//              defensible physiological estimates, NOT measured, and are flagged
//              so the athlete/coach knows not to over-trust the exact numbers.
//
// The four Fitstop session archetypes (verified structure):
//   PERFORM   — interval / engine conditioning (R-EMOM/EMOM/AMRAP, on-off).
//   LIFT      — main lift + 3–4 round A/B/C accessory supersets (intensifies by phase).
//   CONDITION — a single longer conditioning piece.
//   SWEAT     — mixed conditioning + finisher.
//
// SCHEMA (per archetype):
//   session, structure, evidence:{structure, load},
//   primary[]/secondary[] — adaptation ids (see knowledge/adaptations.mjs),
//   load{ mechanical, metabolic, neurological, connective, recoveryHours },
//   runInterference (0–1), strengthContribution (0–1), conditioningContribution (0–1)
//
// Numbers preserve the app's existing FITSTOP_LOAD estimates so behaviour is
// unchanged; this module formalises + enriches + tags them.
// Built into index.html as inline FITSTOP_KB by scripts/build-knowledge.mjs.
// ─────────────────────────────────────────────────────────────────────────────

export const FITSTOP_TRANSLATE_VERSION = 1;

// LIFT intensifies across phases (PEAK = 1RM → max neuro/mechanical/recovery). Verified progression.
export const FITSTOP_PHASE_MULT = { BASE: 0.85, BUILD: 1.0, PERFORMANCE: 1.1, PEAK: 1.25 };

export const FITSTOP_TRANSLATE = [
  {
    session: 'PERFORM',
    structure: 'Interval / engine conditioning — R-EMOM / EMOM / AMRAP, on-off efforts, station rotations.',
    evidence: { structure: 'verified', load: 'assumed' },
    primary: ['work_capacity'],
    secondary: ['aerobic_durability', 'power'],
    load: { mechanical: 5, metabolic: 8, neurological: 4, connective: 4, recoveryHours: 36 },
    runInterference: 0.45,          // metabolic overlap with hard running; legs moderately taxed
    strengthContribution: 0.25,
    conditioningContribution: 0.75,
  },
  {
    session: 'LIFT',
    structure: 'Main lift (Squat/Deadlift/Bench/Chin-Up) + 3–4 round A/B/C accessory supersets; RM progresses by phase.',
    evidence: { structure: 'verified', load: 'assumed' },
    primary: ['force_production'],
    secondary: ['strength_maintenance', 'power'],
    load: { mechanical: 6, metabolic: 3, neurological: 7, connective: 4, recoveryHours: 48 },
    phaseScaled: true,              // mechanical / neurological / recoveryHours scale by FITSTOP_PHASE_MULT
    runInterference: 0.7,           // heavy lower-body work interferes most with leg-driven running
    strengthContribution: 0.8,
    conditioningContribution: 0.2,
  },
  {
    session: 'CONDITION',
    structure: 'A single longer conditioning piece (sustained engine work).',
    evidence: { structure: 'verified', load: 'assumed' },
    primary: ['work_capacity'],
    secondary: ['aerobic_durability'],
    load: { mechanical: 5, metabolic: 9, neurological: 3, connective: 4, recoveryHours: 36 },
    runInterference: 0.4,
    strengthContribution: 0.2,
    conditioningContribution: 0.8,
  },
  {
    session: 'SWEAT',
    structure: 'Mixed conditioning + finisher.',
    evidence: { structure: 'verified', load: 'assumed' },
    primary: ['work_capacity'],
    secondary: ['aerobic_durability', 'strength_maintenance'],
    load: { mechanical: 5, metabolic: 8, neurological: 4, connective: 4, recoveryHours: 36 },
    runInterference: 0.4,
    strengthContribution: 0.3,
    conditioningContribution: 0.7,
  },
];
