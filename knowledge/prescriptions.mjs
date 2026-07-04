// ─────────────────────────────────────────────────────────────────────────────
// PRESCRIPTION LIBRARY — the catalogue of sessions that create adaptations.
//
// Coach EV v2: an adaptation is CONSTANT; the prescription that creates it VARIES
// with athlete state (phase, readiness, experience, equipment). This library
// makes that relationship an explicit MANY-to-ONE: each adaptation has several
// candidate prescriptions, and the engine SELECTS one for the athlete's state
// (index.html › prescriptionsFor(adaptationId) / selectPrescription(id, state)).
//
// This is a catalogue of TEMPLATES, not the week-by-week numbers — the
// Prescription Engine (_progressEndurance / strength generators) still resolves
// concrete volume/pace from baselines + program week. Each template links back
// to the generator via `rxRunType` (endurance) or `mode` so the two stay in sync
// without duplicating the progression maths.
//
// SCHEMA:
//   id, adaptation (id in ADAPTATION_LIBRARY), name, mode ('run'|'strength'|'conditioning'|'recovery'),
//   rxRunType   — the run type the endurance generator progresses (endurance only)
//   structure   — plain-language shape of the session
//   select{}    — soft selection hints:
//       phase[]        — periodization phases this fits (Base|Build|Peak|Taper|Deload|any)
//       readinessMin   — skip if today's readiness is below this (0–100)
//       experience     — 'any' | 'intermediate' | 'advanced'
//       default        — the fallback pick for the adaptation when nothing else is gated in
//   sourceTier, note
//
// Built into index.html as inline PRESCRIPTION_KB by scripts/build-knowledge.mjs.
// ─────────────────────────────────────────────────────────────────────────────

export const PRESCRIPTION_LIBRARY_VERSION = 1;

export const PRESCRIPTION_LIBRARY = [
  // ── Aerobic Durability ─────────────────────────────────────────────────────
  { id:'aer_easy_run', adaptation:'aerobic_durability', name:'Easy aerobic run', mode:'run', rxRunType:'easy',
    structure:'Continuous Zone 2, conversational, 35–70 min.', sourceTier:'accepted',
    select:{phase:['any'], experience:'any', default:true}, note:'The bread-and-butter base stimulus.' },
  { id:'aer_long_run', adaptation:'aerobic_durability', name:'Long run', mode:'run', rxRunType:'long',
    structure:'Extended Zone 2 run; cap ~30–35% of weekly volume.', sourceTier:'accepted',
    select:{phase:['Base','Build','Peak'], experience:'any'}, note:'Durability + fat oxidation; weekly anchor.' },
  { id:'aer_recovery_run', adaptation:'aerobic_durability', name:'Recovery run', mode:'run', rxRunType:'recovery',
    structure:'Very easy Zone 1–2, 20–35 min.', sourceTier:'accepted',
    select:{phase:['any'], readinessMin:0, experience:'any'}, note:'Promotes blood flow without adding stress.' },

  // ── Lactate Threshold ──────────────────────────────────────────────────────
  { id:'thr_tempo_continuous', adaptation:'lactate_threshold', name:'Continuous tempo', mode:'run', rxRunType:'tempo',
    structure:'20–40 min continuous at threshold ("comfortably hard").', sourceTier:'methodology',
    select:{phase:['Base','Build'], experience:'any', default:true}, note:'Simplest threshold dose; great early in a block.' },
  { id:'thr_cruise_intervals', adaptation:'lactate_threshold', name:'Cruise intervals', mode:'run', rxRunType:'tempo',
    structure:'3–5 × 8–10 min at threshold, short jog recoveries.', sourceTier:'methodology',
    select:{phase:['Build','Peak'], experience:'any'}, note:'More time-at-threshold at controlled fatigue.' },
  { id:'thr_threshold_intervals', adaptation:'lactate_threshold', name:'Threshold intervals', mode:'run', rxRunType:'threshold',
    structure:'Longer reps (e.g. 2–3 × 15–20 min) near threshold.', sourceTier:'methodology',
    select:{phase:['Build','Peak'], experience:'advanced'}, note:'Advanced volume; earns pace progression.' },
  { id:'thr_progression_run', adaptation:'lactate_threshold', name:'Progression run', mode:'run', rxRunType:'tempo',
    structure:'Easy → steady → threshold over the run; finish at T-pace.', sourceTier:'accepted',
    select:{phase:['Build','Peak'], experience:'intermediate'}, note:'Teaches pacing + finishes at threshold.' },

  // ── VO₂ Max ────────────────────────────────────────────────────────────────
  { id:'vo2_long_reps', adaptation:'vo2max', name:'Long VO₂ reps', mode:'run', rxRunType:'intervals',
    structure:'4–6 × 3–5 min near vVO₂max, equal/short jog recovery.', sourceTier:'methodology',
    select:{phase:['Build','Peak'], experience:'any', default:true}, note:'Classic VO₂ stimulus; most aerobic of the three.' },
  { id:'vo2_short_reps', adaptation:'vo2max', name:'Short VO₂ reps', mode:'run', rxRunType:'intervals',
    structure:'8–12 × 400–800 m at vVO₂max, 60–90 s jog.', sourceTier:'methodology',
    select:{phase:['Peak'], experience:'intermediate'}, note:'More reps at speed; sharpens turnover.' },
  { id:'vo2_hill_reps', adaptation:'vo2max', name:'Hill reps', mode:'run', rxRunType:'intervals',
    structure:'6–10 × 60–90 s uphill hard, jog-down recovery.', sourceTier:'accepted',
    select:{phase:['Base','Build'], experience:'any'}, note:'VO₂ + economy with lower impact/injury risk.' },

  // ── Running Economy ────────────────────────────────────────────────────────
  { id:'econ_strides', adaptation:'running_economy', name:'Strides', mode:'run', rxRunType:'strides',
    structure:'4–8 × ~20 s relaxed fast, full recovery, after an easy run.', sourceTier:'established',
    select:{phase:['any'], experience:'any', default:true}, note:'Low-cost neuromuscular primer.' },
  { id:'econ_hill_sprints', adaptation:'running_economy', name:'Hill sprints', mode:'run', rxRunType:'strides',
    structure:'6–10 × 8–10 s maximal uphill, full recovery.', sourceTier:'accepted',
    select:{phase:['Base','Build'], experience:'intermediate'}, note:'Power + economy with low metabolic cost.' },
  { id:'econ_plyometrics', adaptation:'running_economy', name:'Plyometrics', mode:'strength', rxRunType:null,
    structure:'Low-volume jumps/bounds progressing over weeks.', sourceTier:'accepted',
    select:{phase:['Base','Build'], experience:'advanced'}, note:'Elastic return; progress connective tissue slowly.' },

  // ── Force Production ───────────────────────────────────────────────────────
  { id:'str_heavy_compounds', adaptation:'force_production', name:'Heavy compounds', mode:'strength', rxRunType:null,
    structure:'Squat/hinge/push/pull, 2–6 reps @ 80–92% 1RM, long rests.', sourceTier:'established',
    select:{phase:['any'], experience:'any', default:true}, note:'Primary maximal-strength stimulus.' },
  { id:'str_top_backoff', adaptation:'force_production', name:'Top set + back-offs', mode:'strength', rxRunType:null,
    structure:'Work to a heavy top set, then 2–4 back-off sets at a % of it.', sourceTier:'methodology',
    select:{phase:['Build','Peak'], experience:'intermediate'}, note:'Autoregulated intensity + volume.' },
  { id:'str_wave_loading', adaptation:'force_production', name:'Wave loading', mode:'strength', rxRunType:null,
    structure:'Ascending waves (e.g. 5-3-1, 5-3-1) building to a daily max.', sourceTier:'methodology',
    select:{phase:['Peak'], experience:'advanced'}, note:'Peaking method; high skill/CNS demand.' },

  // ── Strength Maintenance ───────────────────────────────────────────────────
  { id:'str_maintenance_minimal', adaptation:'strength_maintenance', name:'Minimal-dose maintenance', mode:'strength', rxRunType:null,
    structure:'1–2 heavy top sets per main lift, low total volume, high intensity.', sourceTier:'accepted',
    select:{phase:['any'], experience:'any', default:true}, note:'Holds strength while another quality is prioritised.' },

  // ── Power ──────────────────────────────────────────────────────────────────
  { id:'pwr_olympic_variations', adaptation:'power', name:'Olympic-lift variations', mode:'strength', rxRunType:null,
    structure:'Cleans/snatch pulls/jerks, 1–5 reps, explosive intent, long rest, fresh.', sourceTier:'established',
    select:{phase:['Build','Peak'], experience:'advanced', default:true}, note:'High rate of force development.' },
  { id:'pwr_plyo_contrast', adaptation:'power', name:'Contrast / PAP', mode:'strength', rxRunType:null,
    structure:'Heavy compound paired with a matched explosive movement (e.g. squat → jump).', sourceTier:'methodology',
    select:{phase:['Peak'], experience:'advanced'}, note:'Post-activation potentiation; needs a strength base.' },

  // ── Work Capacity ──────────────────────────────────────────────────────────
  { id:'wc_emom', adaptation:'work_capacity', name:'EMOM intervals', mode:'conditioning', rxRunType:null,
    structure:'Every-minute-on-the-minute work/rest across 12–24 min.', sourceTier:'accepted',
    select:{phase:['any'], experience:'any', default:true}, note:'Controlled density; scalable engine work.' },
  { id:'wc_circuit', adaptation:'work_capacity', name:'Station circuit', mode:'conditioning', rxRunType:null,
    structure:'Rotating functional stations, submaximal sustainable output.', sourceTier:'accepted',
    select:{phase:['Base','Build'], experience:'any'}, note:'HYROX/Fitstop-style mixed-modal capacity.' },
  { id:'wc_amrap', adaptation:'work_capacity', name:'AMRAP', mode:'conditioning', rxRunType:null,
    structure:'As-many-rounds-as-possible in a fixed window; pace to hold quality.', sourceTier:'accepted',
    select:{phase:['Build','Peak'], experience:'intermediate'}, note:'Tests + builds sustained output under fatigue.' },

  // ── Race Specificity ───────────────────────────────────────────────────────
  { id:'race_goal_pace_long', adaptation:'race_specificity', name:'Goal-pace long run', mode:'run', rxRunType:'long',
    structure:'Long run with a block finished at goal race pace.', sourceTier:'methodology',
    select:{phase:['Peak'], experience:'any', default:true}, note:'Specificity rises as the event nears.' },
  { id:'race_marathon_segments', adaptation:'race_specificity', name:'Marathon-pace segments', mode:'run', rxRunType:'tempo',
    structure:'Repeated goal-pace segments within a steady run (e.g. 3 × 20 min MP).', sourceTier:'methodology',
    select:{phase:['Peak'], experience:'intermediate'}, note:'Goal-pace continuity + fuelling rehearsal.' },
  { id:'race_brick', adaptation:'race_specificity', name:'Brick / compromised running', mode:'conditioning', rxRunType:null,
    structure:'Station block → run repeated at goal effort (HYROX/DEKA specificity).', sourceTier:'methodology',
    select:{phase:['Build','Peak'], experience:'any'}, note:'Trains running off pre-fatigued legs.' },

  // ── Recovery ───────────────────────────────────────────────────────────────
  { id:'rec_rest', adaptation:'recovery', name:'Full rest', mode:'recovery', rxRunType:null,
    structure:'No training; sleep, fuel, hydrate.', sourceTier:'established',
    select:{phase:['any'], experience:'any', default:true}, note:'The default when readiness is low or fatigue is high.' },
  { id:'rec_easy_shakeout', adaptation:'recovery', name:'Easy shakeout', mode:'run', rxRunType:'recovery',
    structure:'10–25 min very easy movement to promote blood flow.', sourceTier:'accepted',
    select:{phase:['any'], readinessMin:40, experience:'any'}, note:'Active recovery when the athlete feels okay.' },
  { id:'rec_mobility', adaptation:'recovery', name:'Mobility / flush', mode:'recovery', rxRunType:null,
    structure:'Mobility, light stretching, easy spin — no load.', sourceTier:'accepted',
    select:{phase:['any'], experience:'any'}, note:'Low-stress option on a recovery day.' },
];
