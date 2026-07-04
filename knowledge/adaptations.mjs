// ─────────────────────────────────────────────────────────────────────────────
// ADAPTATION LIBRARY — the canonical catalogue of the adaptations Coach EV trains.
//
// Coach EV v2 thesis: the product is coaching DECISIONS; a decision targets an
// ADAPTATION, and a prescription is merely the vehicle that creates it. This
// library formalises "the what" (adaptations) as versioned, source-tagged
// knowledge, separate from "the how" (knowledge/prescriptions.mjs).
//
// It ENRICHES the engine model (index.html › ADAPTATION_MODEL, which holds the
// numeric fatigue vector / retention / scheduler fields) with coaching-facing
// metadata. Ids match ADAPTATION_MODEL 1:1 so the two merge cleanly at runtime
// (adaptationInfo(id)). No numbers are duplicated here — this is descriptive.
//
// SOURCE TIERS (see knowledge/running/library.mjs): established | accepted |
//   methodology | synthesis.
//
// SCHEMA:
//   id, name, system, sourceTier, purpose,
//   primary[]   — the adaptations this directly develops (plain language)
//   secondary[] — adaptations it also nudges
//   fatigueCost — coarse label (low | moderate | high) for quick reasoning
//   recovery    — expected recovery window in plain language
//   progression[] — how to advance the stimulus over a block
//   compatible[]  — adaptation ids that stack well in the same phase
//   conflicting[] — adaptation ids that interfere (mirror ADAPTATION_MODEL)
//   knowledgeDomain — the RUNNING/STRENGTH KB domain that backs it
//   prescriptions[] — candidate prescription ids (see knowledge/prescriptions.mjs)
//
// Built into index.html as inline ADAPTATION_KB by scripts/build-knowledge.mjs.
// ─────────────────────────────────────────────────────────────────────────────

export const ADAPTATION_LIBRARY_VERSION = 1;

export const ADAPTATION_LIBRARY = [
  {
    id: 'aerobic_durability', name: 'Aerobic Durability', system: 'endurance', sourceTier: 'accepted',
    purpose: 'Build the aerobic engine and musculoskeletal durability that underpin every endurance quality.',
    primary: ['Mitochondrial density', 'Capillarisation', 'Fat oxidation', 'Fatigue resistance'],
    secondary: ['Running economy', 'Recovery capacity'],
    fatigueCost: 'low', recovery: 'Low — repeatable daily when kept genuinely easy.',
    progression: ['Add easy volume first (~5–10%/week)', 'Hold every 3–4 weeks before progressing again'],
    compatible: ['lactate_threshold', 'running_economy', 'strength_maintenance', 'race_specificity'],
    conflicting: [],
    knowledgeDomain: 'aerobic_development',
    prescriptions: ['aer_easy_run', 'aer_long_run', 'aer_recovery_run'],
  },
  {
    id: 'lactate_threshold', name: 'Lactate Threshold', system: 'endurance', sourceTier: 'methodology',
    purpose: 'Raise the pace sustainable before fatigue accelerates — the biggest lever from 10K to marathon.',
    primary: ['Lactate clearance / buffering', 'Velocity at threshold'],
    secondary: ['Running economy at speed', 'Aerobic power'],
    fatigueCost: 'moderate', recovery: '~36 h — avoid stacking with VO₂max or heavy lifting on adjacent days.',
    progression: ['Extend time-at-threshold week to week before raising pace', 'Cap ~2 threshold sessions/week in a block'],
    compatible: ['aerobic_durability', 'running_economy', 'race_specificity'],
    conflicting: ['force_production'],
    knowledgeDomain: 'lactate_threshold',
    prescriptions: ['thr_tempo_continuous', 'thr_cruise_intervals', 'thr_threshold_intervals', 'thr_progression_run'],
  },
  {
    id: 'vo2max', name: 'VO₂ Max', system: 'endurance', sourceTier: 'methodology',
    purpose: 'Raise maximal aerobic power by accumulating time near vVO₂max.',
    primary: ['VO₂max ceiling', 'Stroke volume', 'O₂ delivery'],
    secondary: ['Economy at speed', 'Lactate tolerance'],
    fatigueCost: 'high', recovery: '~48 h — the most injury-prone stimulus; never adjacent to heavy lower-body lifting.',
    progression: ['Add reps / total work before adding speed', 'Cap the VO₂ block at ~3–6 weeks'],
    compatible: ['aerobic_durability', 'running_economy'],
    conflicting: ['force_production', 'power'],
    knowledgeDomain: 'vo2max',
    prescriptions: ['vo2_long_reps', 'vo2_short_reps', 'vo2_hill_reps'],
  },
  {
    id: 'running_economy', name: 'Running Economy', system: 'endurance', sourceTier: 'established',
    purpose: 'Lower the O₂ cost of running at a given pace via neuromuscular and elastic qualities.',
    primary: ['Tendon stiffness / elastic return', 'Neuromuscular efficiency'],
    secondary: ['Speed', 'Injury resilience'],
    fatigueCost: 'low', recovery: 'Low for strides/short hills; plyometrics tax connective tissue — progress slowly.',
    progression: ['Introduce strides/plyos low-volume', 'Build gradually; pair with the aerobic base'],
    compatible: ['aerobic_durability', 'lactate_threshold', 'force_production', 'power'],
    conflicting: [],
    knowledgeDomain: 'running_economy',
    prescriptions: ['econ_strides', 'econ_hill_sprints', 'econ_plyometrics'],
  },
  {
    id: 'force_production', name: 'Force Production', system: 'strength', sourceTier: 'established',
    purpose: 'Develop peak force via heavy loads and high movement quality.',
    primary: ['Neural drive / motor-unit recruitment', 'Rate coding', 'Tendon stiffness'],
    secondary: ['Power', 'Injury resilience'],
    fatigueCost: 'high', recovery: '~48 h CNS recovery — separate from hard running by ≥6–24 h.',
    progression: ['Add load when the top set hits target reps at ≤ target RPE', 'Intensify %1RM across the block'],
    compatible: ['strength_maintenance', 'power', 'running_economy'],
    conflicting: ['vo2max', 'lactate_threshold'],
    knowledgeDomain: 'maximal_strength',
    prescriptions: ['str_heavy_compounds', 'str_top_backoff', 'str_wave_loading'],
  },
  {
    id: 'strength_maintenance', name: 'Strength Maintenance', system: 'strength', sourceTier: 'accepted',
    purpose: 'Retain strength on minimal volume while another quality is prioritised.',
    primary: ['Retained neural drive', 'Retained tissue capacity'],
    secondary: ['Injury resilience'],
    fatigueCost: 'moderate', recovery: '~36 h — 1–2 heavy sessions/week is enough to hold strength.',
    progression: ['Keep intensity high, trim volume', 'One or two top sets preserve the quality'],
    compatible: ['aerobic_durability', 'force_production', 'race_specificity'],
    conflicting: ['vo2max'],
    knowledgeDomain: 'maximal_strength',
    prescriptions: ['str_maintenance_minimal', 'str_heavy_compounds'],
  },
  {
    id: 'power', name: 'Power', system: 'strength', sourceTier: 'established',
    purpose: 'Develop rate of force development via explosive intent, light-moderate loads and plyometrics.',
    primary: ['Rate of force development', 'Intermuscular coordination', 'Elastic return'],
    secondary: ['Running economy', 'Speed'],
    fatigueCost: 'moderate', recovery: '~36 h — high neural quality, low volume; never trained to fatigue.',
    progression: ['Add load / complexity once technique and output are stable', 'Keep reps low and fresh'],
    compatible: ['force_production', 'running_economy'],
    conflicting: ['vo2max'],
    knowledgeDomain: 'power_explosiveness',
    prescriptions: ['pwr_olympic_variations', 'pwr_plyo_contrast'],
  },
  {
    id: 'work_capacity', name: 'Work Capacity', system: 'mixed', sourceTier: 'accepted',
    purpose: 'Sustain force output and effort under fatigue — central to HYROX/DEKA/Fitstop and compromised running.',
    primary: ['Local muscular endurance', 'Buffering', 'Mixed-modal work tolerance'],
    secondary: ['Aerobic power', 'Grip'],
    fatigueCost: 'high', recovery: '~36 h — metabolically taxing; hold technique standards as fatigue rises.',
    progression: ['Add reps/rounds or cut rest before adding load', 'Build toward race simulation'],
    compatible: ['aerobic_durability', 'race_specificity', 'strength_maintenance'],
    conflicting: [],
    knowledgeDomain: 'strength_endurance',
    prescriptions: ['wc_emom', 'wc_circuit', 'wc_amrap'],
  },
  {
    id: 'race_specificity', name: 'Race Specificity', system: 'mixed', sourceTier: 'methodology',
    purpose: 'Sharpen general fitness into goal-pace fitness, pacing skill and race-day readiness as the event nears.',
    primary: ['Goal-pace economy', 'Pacing skill', 'Fuelling tolerance'],
    secondary: ['Threshold', 'Work capacity'],
    fatigueCost: 'high', recovery: '~36 h — schedule easy/rest after; taper sheds fatigue to reveal fitness.',
    progression: ['Increase race-pace continuity through the specific block', 'Then taper volume ~40–60% (keep intensity)'],
    compatible: ['aerobic_durability', 'lactate_threshold', 'work_capacity', 'strength_maintenance'],
    conflicting: [],
    knowledgeDomain: 'race_specific',
    prescriptions: ['race_goal_pace_long', 'race_marathon_segments', 'race_brick'],
  },
  {
    id: 'recovery', name: 'Recovery', system: 'all', sourceTier: 'established',
    purpose: 'Allow adaptation to be realised — the priority when readiness is low or fatigue is high.',
    primary: ['Autonomic recovery', 'Tissue repair', 'Glycogen restoration'],
    secondary: ['Aerobic durability (very light)'],
    fatigueCost: 'low', recovery: 'Net-positive — this IS recovery; keep any movement very light.',
    progression: ['Not "progressed" — deployed by readiness', 'Volume/intensity kept minimal by design'],
    compatible: ['aerobic_durability'],
    conflicting: [],
    knowledgeDomain: 'recovery_science',
    prescriptions: ['rec_rest', 'rec_easy_shakeout', 'rec_mobility'],
  },
];
