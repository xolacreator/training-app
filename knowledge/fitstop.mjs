// Knowledge domain: FITSTOP — encoded from VERIFIED USER-PROVIDED material
// (Fitstop "BLOCK C 2026" programming). This is the real methodology, not a generic
// fallback. Sources are cited as user-provided. The concrete dated 12-week block
// itself lives in ./fitstop_block_c_2026.mjs.

export const fitstopMeta = {
  provided: true,
  source: 'Fitstop BLOCK C 2026 (user-provided)',
  note: 'Encoded from official BLOCK C 2026 programming supplied by the user.',
};

export const fitstop = [
  {
    id: 'fitstop.block_structure',
    domain: 'fitstop', version: 1,
    title: 'Block Structure & Periodisation',
    summary: 'A Fitstop training block runs 12 weeks as four 3-week phases — BASE → BUILD → PERFORMANCE → PEAK — intensifying strength and sharpening fitness toward a peak.',
    principles: [
      'Four phases, 3 weeks each: BASE (foundation/variations), BUILD (strength), PERFORMANCE (heavier/sharper), PEAK (max expression).',
      'Each 3-week phase progresses week to week (1.0 → 2.0 → 3.0), then the next phase steps up intensity.',
      'Strength intent climbs across the block; fitness work shifts from capacity to peak efforts.',
    ],
    prescription: { progression: 'BASE→BUILD→PERFORMANCE→PEAK over 12 weeks; each phase = 3 progressive weeks.' },
    cautions: ['Blocks are dated and run on a fixed schedule — align the athlete to the current block dates rather than restarting arbitrarily.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','periodisation','phases','block'],
    sources: ['User-provided: Fitstop BLOCK C 2026.'],
  },
  {
    id: 'fitstop.weekly_split',
    domain: 'fitstop', version: 1,
    title: 'Weekly Split (Main Lift Flow)',
    summary: 'The Fitstop week is fixed: Mon PERFORM, Tue LIFT, Wed CONDITION, Thu PERFORM, Fri LIFT, Sat SWEAT, Sun rest.',
    principles: [
      'Two LIFT days (Tue/Fri) anchor strength; two PERFORM days (Mon/Thu) drive fitness.',
      'CONDITION (Wed) is the mid-week conditioning piece; SWEAT (Sat) is a mixed conditioning session.',
      'Sunday is rest. Members attend class days; endurance training is layered around this fixed split.',
    ],
    prescription: { frequency: 'Mon PERFORM · Tue LIFT · Wed CONDITION · Thu PERFORM · Fri LIFT · Sat SWEAT · Sun rest.' },
    cautions: ['When combining with running, schedule hard runs away from LIFT/PERFORM intensity to limit interference.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','split','schedule','weekly'],
    sources: ['User-provided: Fitstop BLOCK C 2026 (Main Lift Flow).'],
  },
  {
    id: 'fitstop.session_types',
    domain: 'fitstop', version: 1,
    title: 'Session Types (PERFORM / LIFT / CONDITION / SWEAT)',
    summary: 'Four class formats with distinct jobs: PERFORM (fitness/intervals), LIFT (strength), CONDITION (sustained conditioning), SWEAT (mixed conditioning).',
    principles: [
      'PERFORM: interval/engine work — R-EMOM, EMOM, AMRAP, on/off efforts in station rotations (Individual / Pairs / Teams). Carries the weekly fitness progression.',
      'LIFT: strength via the 4 main lifts plus 3–4 round A/B/C accessory supersets, programmed RIR-based.',
      'CONDITION: a longer single conditioning effort (e.g. 2×18, 36-min AMRAP, WFT/E3MOM pacing).',
      'SWEAT: shorter mixed-modal conditioning, often with a finisher.',
    ],
    prescription: { intensity: 'PERFORM/CONDITION/SWEAT submaximal-to-hard intervals; LIFT main work at prescribed RIR/RM.', frequency: 'PERFORM ×2, LIFT ×2, CONDITION ×1, SWEAT ×1 per week.' },
    cautions: ['Format and loading are fixed by the published block — do not invent substitutions.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','perform','lift','condition','sweat','session-types'],
    sources: ['User-provided: Fitstop BLOCK C 2026 daily sessions.'],
  },
  {
    id: 'fitstop.strength_progression',
    domain: 'fitstop', version: 1,
    title: 'Strength Progression (Main Lifts)',
    summary: 'The four main lifts — Squat, Deadlift, Bench, Chin-Up — intensify by phase: BASE variations → BUILD 5RM → PERFORMANCE 3RM → PEAK 1RM.',
    principles: [
      'BASE: train accessory variations of each lift (e.g. Squat → Barbell Reverse Lunge + Cyclist Squat; Deadlift → Power Clean + Split-Stance RDL) at RIR 1–3 to build base and quality.',
      'BUILD: work the main lift toward a 5RM by week 3.',
      'PERFORMANCE: work toward a 3RM by week 3.',
      'PEAK: work toward a 1RM by week 3 — maximal strength expression.',
      'Hang Clean (squat or power) is developed alongside as a power lift.',
    ],
    prescription: { intensity: 'BASE RIR 1–3 on variations → BUILD 5RM → PERFORMANCE 3RM → PEAK 1RM.', progression: 'Within each phase, progress the top set across weeks 1→3 to the phase RM.' },
    cautions: ['1RM/3RM work in PEAK/PERFORMANCE demands full recovery and quality — manage fatigue from concurrent running.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','strength','progression','rm','main-lifts'],
    sources: ['User-provided: Fitstop BLOCK C 2026 (Strength Progression table).'],
  },
  {
    id: 'fitstop.skill_fitness_progression',
    domain: 'fitstop', version: 1,
    title: 'Skill & Fitness Progression',
    summary: 'Skills (Kettlebell, Toes-to-Bar, Cleans) are reviewed then progressed across phases; fitness intervals lengthen and sharpen from capacity work toward peak time-trials.',
    principles: [
      'Skill: KB, T2B and Cleans start with skill review in BASE and are progressed through to PEAK.',
      'Fitness intervals evolve: BASE 30s on/off → 60s → 3–5 min efforts; BUILD 40s/4-min/WFT/E3MOM; PERFORMANCE short & long ergs, WFT, 1 km efforts; PEAK 2 km time trials.',
      'Tracked each week: RIR, REPS, SKILL, FITNESS, and TRACKABLE benchmarks.',
    ],
    prescription: { progression: 'Lengthen/sharpen intervals by phase; rehearse skills toward heavier/faster expression; log the trackables to measure progress.' },
    cautions: ['Peak time-trials (e.g. 2 km) are maximal — treat like a test day and recover after.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','skill','fitness','intervals','trackable'],
    sources: ['User-provided: Fitstop BLOCK C 2026 (Skill & Fitness Progression tables).'],
  },
];
