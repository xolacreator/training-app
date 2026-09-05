// ─────────────────────────────────────────────────────────────────────────────
// HYROX RACE SPECIFICATION — the event as fact, not methodology.
//
// This is the physical race: order, distances, loads, rep counts. It is public,
// verifiable event information, kept separate from coaching method so that
// prescriptions can cite a load without citing an opinion.
//
// Sourcing policy: every load here is corroborated across multiple independent
// secondary sources (see SOURCES). The official rulebook PDF
// (maintain.hyrox.com/rulebooks/HYROX_RulebookSingles_EN.pdf) is the primary
// authority but was not reachable from this environment, so figures are marked
// `verified:'secondary'` rather than `'official'`. Where sources genuinely
// disagree, the disagreement is recorded rather than resolved by guessing —
// see `disputed` on wallBalls.
// ─────────────────────────────────────────────────────────────────────────────

export const HYROX_SPEC = {
  version: 2,
  season: '2025/26',
  verified: 'secondary',

  // The race, in order. Run distances and station distances are stable across
  // divisions; only loads and wall-ball parameters vary.
  format: {
    runs: 8,
    runDistanceM: 1000,
    totalRunKm: 8,
    stationCount: 8,
    order: ['run','ski','run','sledPush','run','sledPull','run','burpeeBroadJump',
            'run','row','run','farmersCarry','run','sandbagLunges','run','wallBalls'],
    roxzone: {
      transitions: 8,
      note: 'The transit corridor between the run lane and each station. Timed as part of the race — it is not rest.',
      typicalLossSec: [30, 90],
      lossReason: 'Most athletes lose 30–90 s per race by walking the roxzone or treating it as a rest stop.',
    },
  },

  // Stations that do not vary by division.
  fixedStations: {
    ski:              { name: 'SkiErg',             distanceM: 1000, unit: 'm' },
    row:              { name: 'Rowing',             distanceM: 1000, unit: 'm' },
    burpeeBroadJump:  { name: 'Burpee Broad Jumps', distanceM: 80,   unit: 'm' },
  },

  // Loads by division. Sled figures are TOTAL SYSTEM WEIGHT (sled + plates), which
  // is how HYROX publishes them — programming a "152 kg sled push" in a gym means
  // matching total load, not adding 152 kg of plates.
  divisions: {
    open_men: {
      label: 'Open — Men',
      sledPush:      { totalKg: 152, distanceM: 50 },
      sledPull:      { totalKg: 103, distanceM: 50 },
      farmersCarry:  { perHandKg: 24, distanceM: 200 },
      sandbagLunges: { kg: 20, distanceM: 100 },
      wallBalls:     { kg: 6, targetM: 3.00, reps: 100 },
    },
    open_women: {
      label: 'Open — Women',
      sledPush:      { totalKg: 102, distanceM: 50 },
      sledPull:      { totalKg: 78,  distanceM: 50 },
      farmersCarry:  { perHandKg: 16, distanceM: 200 },
      sandbagLunges: { kg: 10, distanceM: 100 },
      wallBalls:     { kg: 4, targetM: 2.70, reps: 100, repsDisputed: 75 },
    },
    pro_men: {
      label: 'Pro — Men',
      sledPush:      { totalKg: 202, distanceM: 50 },
      sledPull:      { totalKg: 153, distanceM: 50 },
      farmersCarry:  { perHandKg: 32, distanceM: 200 },
      sandbagLunges: { kg: 30, distanceM: 100 },
      wallBalls:     { kg: 9, targetM: 3.00, reps: 100 },
      entry: 'Requires a verified qualifying finish — approximately sub-70 min (men).',
    },
    pro_women: {
      label: 'Pro — Women',
      // Pro Women race Open Men loads on the carries and sleds; wall ball differs.
      sledPush:      { totalKg: 152, distanceM: 50 },
      sledPull:      { totalKg: 103, distanceM: 50 },
      farmersCarry:  { perHandKg: 24, distanceM: 200 },
      sandbagLunges: { kg: 20, distanceM: 100 },
      wallBalls:     { kg: 6, targetM: 2.70, reps: 100 },
      entry: 'Requires a verified qualifying finish — approximately sub-85 min (women).',
    },
  },

  // Recorded rather than resolved. An app that silently picks one of two
  // contradictory rep counts is guessing at the athlete's race.
  disputed: [
    {
      field: 'divisions.open_women.wallBalls.reps',
      values: [100, 75],
      note: 'Sources conflict for the 2025/26 season. Several state all Singles divisions race 100 reps and that the 75-rep women\'s standard was retired; others state Open Women dropped to 75, with at least one attributing the 75-rep change to Doubles only. Treat 100 as the working default and confirm against the current official rulebook for the athlete\'s specific event.',
      resolution: 'Ask the athlete to confirm from their event rulebook before prescribing wall-ball volume at race standard.',
    },
  ],

  SOURCES: [
    { what: 'Race format, station order, divisions', where: 'HYROX official FAQ (hyroxus.com/faq)' },
    { what: 'Division loads and rep counts', where: 'Corroborated across HyCrew, PUMA, Red Bull, Pace Club, RitFit division tables (2025/26)' },
    { what: 'Pro entry qualifying standards', where: 'RoxGrit / HyroxFitness division guides' },
    { what: 'Roxzone time loss', where: 'RoxZone Training race-day strategy; HyroxDataLab pacing analysis' },
    { what: 'Primary authority (NOT reachable from this environment)', where: 'maintain.hyrox.com/rulebooks/HYROX_RulebookSingles_EN.pdf' },
  ],
};

// Resolve a division key from loose athlete input ("open men", "pro", "women").
export function hyroxDivision(input, fallback = 'open_men') {
  const t = String(input || '').toLowerCase();
  if (!t.trim()) return fallback;
  const pro = /\bpro\b/.test(t);
  const women = /\b(women|woman|female|w)\b/.test(t);
  const men = /\b(men|man|male|m)\b/.test(t);
  if (pro && women) return 'pro_women';
  if (pro && men) return 'pro_men';
  if (pro) return 'pro_men';
  if (women) return 'open_women';
  if (men) return 'open_men';
  return fallback;
}

// The loads an athlete will actually face, ready for prescription.
export function hyroxLoads(divisionKey) {
  const d = HYROX_SPEC.divisions[divisionKey] || HYROX_SPEC.divisions.open_men;
  return {
    division: divisionKey,
    label: d.label,
    sledPush: d.sledPush,
    sledPull: d.sledPull,
    farmersCarry: d.farmersCarry,
    sandbagLunges: d.sandbagLunges,
    wallBalls: d.wallBalls,
    ski: HYROX_SPEC.fixedStations.ski,
    row: HYROX_SPEC.fixedStations.row,
    burpeeBroadJump: HYROX_SPEC.fixedStations.burpeeBroadJump,
  };
}
