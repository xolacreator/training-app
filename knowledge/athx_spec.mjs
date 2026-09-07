// ─────────────────────────────────────────────────────────────────────────────
// ATHX 2026 EVENT SPECIFICATION — the competition as fact, not methodology.
//
// Same contract as HYROX_SPEC: zones, durations, movements and loads, kept apart
// from coaching opinion so a session can cite a load without citing a view.
//
// Sourcing: the official site (athxgames.com) is unreachable from this environment,
// so figures are corroborated across independent secondary coverage and marked
// `verified:'secondary'`. Anything the sources do not state is left absent rather
// than filled in — see `unknown`.
// ─────────────────────────────────────────────────────────────────────────────

export const ATHX_SPEC = {
  version: 1,
  season: '2026',
  verified: 'secondary',

  event: {
    name: 'ATHX Los Angeles 2026',
    date: '2026-11-07',
    venue: 'Long Beach Convention & Entertainment Center',
    format: 'One continuous 2.5-hour session through six zones, in a fixed sequence.',
    divisions: ['Lite', 'ATHX', 'Pro'],
    entry: ['Individual', 'Pairs (Male / Female / Mixed)'],
    note: 'The test format repeats across every event of the season, so the movements are known in advance.',
  },

  // The six zones in order. Only three are scored tests; the rest are transition.
  zones: [
    { id:'warmup',    name:'Warm-Up Zone',  minutes:30, scored:false,
      what:'Mobilise and activate before the floor.' },
    { id:'strength',  name:'Strength Zone', minutes:20, scored:true,
      what:'Three maximal lifts, back to back, against the clock.',
      tests:[
        { order:1, cap:'6 min',  lift:'Stick press', scheme:'1RM' },
        { order:2, cap:'6 min',  lift:'Back squat',  scheme:'3RM' },
        { order:3, cap:'8 min',  lift:'Deadlift',    scheme:'5RM' },
      ] },
    { id:'refuel',    name:'Refuel Zone',   minutes:10, scored:false,
      what:'Hydrate and recover before the next test.' },
    { id:'endurance', name:'Endurance Zone', minutes:30, scored:true,
      what:'22 minutes of continuous running and rowing for maximum distance.',
      working:'22 min',
      pairsRunLeg:{ Lite:'500 m', ATHX:'750 m', Pro:'1 km',
                    note:'Pairs swap each time the run leg is completed.' } },
    { id:'recovery',  name:'Recovery Zone',  minutes:30, scored:false,
      what:'Dedicated reset before the final test.' },
    { id:'metcon',    name:'Metabolic Zone (MetCon X)', minutes:30, scored:true,
      what:'Five movements as one continuous effort.',
      cap:'25 min',
      movements:[
        { name:'SkiErg',                          dose:'60 cal' },
        { name:'Single-arm alternating ground to overhead', dose:'60 reps', loadM:'20 kg',   loadF:'12.5 kg' },
        { name:'Sandbag carry',                   dose:'60 m',   loadM:'50 kg',   loadF:'30 kg' },
        { name:'Box jump overs',                  dose:'60 reps', loadM:'24 in',  loadF:'20 in' },
        { name:'DB walking lunges',               dose:'60 m',   loadM:'20 kg',   loadF:'12.5 kg' },
      ] },
  ],

  // What a HYROX build already trains, and what it does not. This is the whole
  // reason for holding the spec: to program only what is genuinely missing.
  vsHyrox: {
    covered: [
      { what:'SkiErg',   why:'A HYROX race station; trained at race dose.' },
      { what:'Rowing',   why:'A HYROX race station; trained at race dose.' },
      { what:'Running under fatigue', why:'The compromised run is exactly this.' },
      { what:'Lunge patterning', why:'HYROX sandbag lunges cover the pattern, at a lighter load.' },
    ],
    // Present in ATHX, absent or materially different in a HYROX build.
    gaps: [
      { key:'maxStrength', what:'Maximal strength — 1RM press, 3RM squat, 5RM deadlift',
        why:'HYROX trains strength-ENDURANCE at submaximal race loads. It never asks for a true 1RM.',
        note:'Fitstop LIFT days cover this directly, and Block D peaks on exactly these lifts.' },
      { key:'boxJumpOver', what:'Box jump overs (60 reps, 24 in)',
        why:'Does not appear anywhere in a HYROX race or in HYROX-specific training.' },
      { key:'saGroundToOverhead', what:'Single-arm alternating ground to overhead (60 reps, 20 kg)',
        why:'No HYROX station uses a single-arm overhead pattern under load.' },
      { key:'heavySandbagCarry', what:'Sandbag CARRY at 50 kg over 60 m',
        why:'HYROX carries a 20-30 kg sandbag in a lunge, and 2x24-32 kg farmers. A 50 kg carry is a heavier, different task.' },
    ],
  },

  // Recorded rather than guessed at.
  unknown: [
    'Individual (non-pairs) run and row leg distances in the Endurance Zone — sources give the PAIRS legs only.',
    'Whether Lite / ATHX / Pro change the MetCon X loads, or only the Endurance Zone run leg.',
    'Scoring weights across the three tested zones.',
  ],

  SOURCES: [
    { what:'Date, venue, six-zone format', where:'ATHX Games event listing (athxgames.com/events) via search; corroborated by Red Bull 2026 competitions round-up' },
    { what:'Zone durations and sequence',  where:'Velites Sport and Speediance ATHX explainers (2026)' },
    { what:'Strength Zone lifts and caps', where:'BLK BOX "ATHX 2026 Workouts"; corroborated by EFECTIV Nutrition' },
    { what:'MetCon X movements and loads', where:'BLK BOX "ATHX 2026 Workouts"; corroborated by BOXROX' },
    { what:'Divisions and entry types',    where:'ATHX Games site summary; Sidea Fitness ATHX 2026 guide' },
    { what:'Primary source (NOT reachable from this environment)', where:'athxgames.com — egress blocked' },
  ],
};

// The ATHX-specific demands a HYROX block leaves untrained.
export function athxGaps(){ return ATHX_SPEC.vsHyrox.gaps; }
