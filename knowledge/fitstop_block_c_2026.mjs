// Fitstop BLOCK C 2026 — the concrete, DATED 12-week block (user-provided).
//
// This is a program *instance* (not reusable knowledge): the real Fitstop block with
// fixed dates the athlete must follow. The app loads/tracks this on its actual dates
// and schedules any endurance work around the fixed class days.
//
// Source: user-provided "BLOCK C 2026" PDF. Methodology is in ./fitstop.mjs.
// Detailed per-session station breakdowns exist in the source and can be encoded
// verbatim on request; this module captures the dated calendar + session type + focus,
// which is what the app needs to follow the schedule.

// Fixed weekly split (Main Lift Flow). Sunday is rest.
export const FITSTOP_SPLIT = {
  Mon: 'PERFORM', Tue: 'LIFT', Wed: 'CONDITION',
  Thu: 'PERFORM', Fri: 'LIFT', Sat: 'SWEAT', Sun: null,
};

// Four phases × 3 weeks. Strength intent + skill/fitness emphasis per phase.
export const FITSTOP_PHASES = [
  { name: 'BASE',        weeks: [1, 2, 3],
    strengthFocus: 'Main-lift variations at RIR 1–3 (e.g. Squat → Reverse Lunge + Cyclist Squat; Deadlift → Power Clean + Split-Stance RDL).',
    fitnessFocus:  'Capacity intervals: 30s on/off → 60s → 3–5 min efforts. Skill review (KB, T2B, Cleans).' },
  { name: 'BUILD',       weeks: [4, 5, 6],
    strengthFocus: 'Main lifts toward a 5RM by week 3 (Back Squat, Deadlift, Bench, Chin-Up).',
    fitnessFocus:  '40s efforts, 4-min efforts, WFT, E3MOM pacing. Skills progressed.' },
  { name: 'PERFORMANCE', weeks: [7, 8, 9],
    strengthFocus: 'Main lifts toward a 3RM by week 3.',
    fitnessFocus:  'Short & long ergs, WFT, 1 km efforts. Skills sharpened.' },
  { name: 'PEAK',        weeks: [10, 11, 12],
    strengthFocus: 'Main lifts toward a 1RM by week 3 — maximal strength expression.',
    fitnessFocus:  '2 km time trials (test efforts). Peak skill expression.' },
];

// Block anchor. Week 1 (BASE 1.0) Monday = 22/06/2026; runs 12 weeks to Sat 12/09/2026.
export const FITSTOP_BLOCK_C_2026 = {
  id: 'fitstop-block-c-2026',
  name: 'Fitstop BLOCK C 2026',
  type: 'fitstop',
  source: 'User-provided: Fitstop BLOCK C 2026',
  startDate: '2026-06-22',          // Monday of week 1
  weeks: 12,
  split: FITSTOP_SPLIT,
  phases: FITSTOP_PHASES,
  // Per-week labels + extracted Monday dates (verbatim from the PDF) +
  // best-effort published session formats in Mon→Sat order.
  weeklyPlan: [
    { week: 1,  label: 'BASE 1.0',        monday: '2026-06-22', formats: ['4x9 MIN','3x12 MIN','6x6 MIN','4x9 MIN','8x4 MIN','R-EMOM + FINISHER'] },
    { week: 2,  label: 'BASE 2.0',        monday: '2026-06-29', formats: ['3x12 MIN','4x9 MIN','2x18 MIN','4x9 MIN','4x9 MIN','36 MIN AMRAP'] },
    { week: 3,  label: 'BASE 3.0',        monday: '2026-07-06', formats: ['2x18 MIN','4x9 MIN','7x5 MIN','6x6 MIN','4x9 MIN','5x6 MIN + FINISHER'] },
    { week: 4,  label: 'BUILD 1.0',       monday: '2026-07-13', formats: ['4x9 MIN','LIFT 5RM','2x18 MIN','4x9 MIN','LIFT 5RM','2x15 MIN + FINISHER'] },
    { week: 5,  label: 'BUILD 2.0',       monday: '2026-07-20', formats: ['3x12 MIN','LIFT 5RM','4x9 MIN','3x12 MIN','LIFT 5RM','5x7 MIN'] },
    { week: 6,  label: 'BUILD 3.0',       monday: '2026-07-27', formats: ['4x9 MIN','LIFT 5RM','2x18 MIN','4x9 MIN','LIFT 5RM','24 MIN AMRAP (3 rounds)'] },
    { week: 7,  label: 'PERFORMANCE 1.0', monday: '2026-08-03', formats: ['3x10 MIN + FINISHER','LIFT 3RM','3x12 MIN','5x7 MIN','LIFT 3RM','SWEAT'] },
    { week: 8,  label: 'PERFORMANCE 2.0', monday: '2026-08-10', formats: ['3x12 MIN','LIFT 3RM','4x8 MIN + FINISHER','3x12 MIN','LIFT 3RM','SWEAT'] },
    { week: 9,  label: 'PERFORMANCE 3.0', monday: '2026-08-17', formats: ['4x9 MIN','LIFT 3RM','2x18 MIN','4x9 MIN','LIFT 3RM','5x6 MIN + FINISHER'] },
    { week: 10, label: 'PEAK 1.0',        monday: '2026-08-24', formats: ['4x9 MIN','LIFT 1RM','2KM TIME TRIAL','4x9 MIN','LIFT 1RM','SWEAT'] },
    { week: 11, label: 'PEAK 2.0',        monday: '2026-08-31', formats: ['4x9 MIN','LIFT 1RM','2KM TIME TRIAL','3x12 MIN','LIFT 1RM','5x7 MIN'] },
    { week: 12, label: 'PEAK 3.0',        monday: '2026-09-07', formats: ['4x9 MIN','LIFT 1RM','2KM TIME TRIAL','5x14 MIN','LIFT 1RM','36 MIN AMRAP (3-4 rounds)'] },
  ],
};

const ALL_DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const phaseForWeek = (w) => FITSTOP_PHASES.find(p => p.weeks.includes(w)) || null;

// Which block week a date falls in (1–12), or null if outside the block.
export function blockWeekForDate(iso, block = FITSTOP_BLOCK_C_2026) {
  const start = new Date(block.startDate + 'T00:00:00');
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d) || d < start) return null;
  const w = Math.floor((d - start) / 86400000 / 7) + 1;
  return w >= 1 && w <= block.weeks ? w : null;
}

// The session for a given date: { week, label, phase, day, type, focus, format } or
// a rest day, or null if outside the block.
export function blockSessionForDate(iso, block = FITSTOP_BLOCK_C_2026) {
  const w = blockWeekForDate(iso, block);
  if (!w) return null;
  const dow = ALL_DOW[new Date(iso + 'T00:00:00').getDay()];
  const type = block.split[dow] || null;
  const wk = block.weeklyPlan[w - 1];
  const phase = phaseForWeek(w);
  if (!type) return { week: w, label: wk.label, phase: phase?.name, day: dow, type: null, focus: 'Rest day' };
  const focus = (type === 'LIFT') ? phase?.strengthFocus : phase?.fitnessFocus;
  const dayIdx = ['Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dow);
  return { week: w, label: wk.label, phase: phase?.name, day: dow, type, focus,
    format: dayIdx >= 0 ? (wk.formats?.[dayIdx] || '') : '' };
}

export default FITSTOP_BLOCK_C_2026;
