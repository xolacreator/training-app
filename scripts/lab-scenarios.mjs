// Athletes for the program lab. Each is a plausible person, not a unit-test fixture.
//
// The scenarios are deliberately PAIRED: within each pair the goal classifies the
// same way but the athlete is very different — different current fitness, different
// history, different failure mode last time. If the app is coaching rather than
// filling a template, the two blocks in a pair must not be the same.

const DAY = 86400000;
const today = Date.now();

// A realistic run log: n weeks of training at a given weekly volume and pace.
// `quality` sessions are what the fitness model reads for threshold/VO2 estimates.
function runLog({weeks=8, perWeek=4, km=10, pace='5:30', qualityPace=null, start=weeks*7}){
  const out=[]; let d=start;
  for (let w=0; w<weeks; w++){
    for (let s=0; s<perWeek; s++){
      const isQuality = qualityPace && s===1;
      const isLong    = s===perWeek-1;
      out.push({
        gid:`g${w}-${s}`, week:String(w+1), day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][s%7],
        session: isQuality ? 'Tempo Run' : isLong ? 'Long Run' : 'Easy Run',
        intensity: isQuality ? 'moderate' : 'easy',
        dist: String(isLong ? Math.round(km*1.6) : km),
        pace: isQuality ? qualityPace : pace,
        date: new Date(today - d*DAY).toISOString().slice(0,10),
        ts: today - d*DAY,
      });
      d -= 1.6;
    }
    d -= 0.8;
  }
  return out;
}

const iso = (daysFromNow) => new Date(today + daysFromNow*DAY).toISOString().slice(0,10);

export const SCENARIOS = {
  // ── PAIR 1 · same race, very different runners ────────────────────────────
  'marathon-experienced': {
    label: 'Marathon · 3:41 → 3:30',
    profile: { goal:'Sub-3:30 marathon at Melbourne', raceDate: iso(16*7) },
    intake: {
      goal:'Sub-3:30 at Melbourne. Ran 3:41 there last year and want the Boston-adjacent number.',
      timeline:'16 weeks out, entered and paid, nothing else in the calendar.',
      history:'Third marathon. Last one I went out at 4:45/km and blew up at 32k — walked twice in the last 8k.',
      constraints:'No injuries. Can train 5 days. Hate the treadmill.',
    },
    weeks:16, sessionsPerWeek:5, trainDays:['Mon','Tue','Wed','Fri','Sat'],
    baselines:{ 'run-cooper':3100 },
    sessions: runLog({weeks:10, perWeek:4, km:12, pace:'5:20', qualityPace:'4:40'}),
  },
  'marathon-first-timer': {
    label: 'Marathon · first, just finish',
    profile: { goal:'Finish my first marathon', raceDate: iso(16*7) },
    intake: {
      goal:'Finish my first marathon. No time goal — I just want to run the whole thing.',
      timeline:'16 weeks out, entered.',
      history:'Never raced beyond 10k. Longest run ever is 14k and it hurt.',
      constraints:'Dodgy left knee that flares if I ramp too fast. 3 days a week is realistic.',
    },
    weeks:16, sessionsPerWeek:3, trainDays:['Tue','Thu','Sun'],
    baselines:{ 'run-cooper':2200 },
    sessions: runLog({weeks:6, perWeek:2, km:6, pace:'6:40'}),
  },

  // ── PAIR 2 · same race, different division and experience ─────────────────
  'hyrox-open-novice': {
    label: 'HYROX · Open Men, first race',
    profile: { goal:'HYROX Melbourne — Open Men, first race', raceDate: iso(12*7) },
    intake: {
      goal:'First HYROX. Open Men. Want to finish strong, not survive it.',
      timeline:'12 weeks out, entered.',
      history:'Never done one. Gym 3x a week, run occasionally. Never touched a sled.',
      constraints:'Commercial gym, has sleds and ergs. 4 days a week.',
    },
    weeks:12, sessionsPerWeek:4, trainDays:['Mon','Wed','Fri','Sat'], division:'open_men',
    sessions: runLog({weeks:6, perWeek:2, km:6, pace:'5:50'}),
  },
  'hyrox-pro-veteran': {
    label: 'HYROX · Pro Men, sub-65',
    profile: { goal:'HYROX Pro Men — sub-65', raceDate: iso(12*7) },
    intake: {
      goal:'Pro Men, chasing sub-65. Qualified off a 68 last season.',
      timeline:'12 weeks out, entered, one tune-up race at week 6.',
      history:'Fourth season. Sled push is my limiter — I lose 40s there against my peers.',
      constraints:'Full HYROX-spec gym. 6 days a week available.',
    },
    weeks:12, sessionsPerWeek:6, trainDays:['Mon','Tue','Wed','Thu','Fri','Sat'], division:'pro_men',
    sessions: runLog({weeks:12, perWeek:5, km:14, pace:'4:35', qualityPace:'3:55'}),
  },

  // ── PAIR 3 · strength, opposite ends ──────────────────────────────────────
  'strength-novice': {
    label: 'Strength · novice, add 20kg squat',
    profile: { goal:'Add 20kg to my back squat' },
    intake: {
      goal:'Add 20kg to my back squat. Currently 80kg for a hard single.',
      timeline:'No deadline — next 3-4 months.',
      history:'Lifting about 8 months, self-taught from YouTube. Never run a real programme.',
      constraints:'Home gym, barbell and rack, no machines. 3 days.',
    },
    weeks:12, sessionsPerWeek:3, trainDays:['Mon','Wed','Fri'],
    baselines:{ 'squat-1rm':80 },
  },
  'strength-advanced': {
    label: 'Strength · advanced, 180kg squat',
    profile: { goal:'Break a 200kg back squat' },
    intake: {
      goal:'200kg back squat. Stuck at 180 for eight months.',
      timeline:'No race. Meet in about 20 weeks if I feel ready.',
      history:'Six years lifting, three programmes deep. Linear progression stopped working two years ago.',
      constraints:'Full powerlifting gym. 5 days. Old lower-back niggle under heavy deadlift.',
    },
    weeks:16, sessionsPerWeek:5, trainDays:['Mon','Tue','Thu','Fri','Sat'],
    baselines:{ 'squat-1rm':180 },
  },

  // ── CONTROLLED PAIR · everything held equal except the athlete ────────────
  // Same goal text, same days, same block length. The ONLY difference is who they
  // are: one has ten weeks of 12 km at 5:20 with 4:40 tempos behind them, the other
  // has six weeks of 6 km at 6:40 and a knee. If the prescription is identical here,
  // the interview is decoration — this is the sharpest test in the file.
  'control-fit': {
    label: 'Control · fit runner',
    profile: { goal:'Run a faster marathon' },
    intake: {
      goal:'Run a faster marathon.',
      timeline:'16 weeks.',
      history:'Ran 3:41 last year off 60km weeks. Comfortable at 4:40/km for tempo work.',
      constraints:'No injuries, no limits.',
    },
    weeks:16, sessionsPerWeek:5, trainDays:['Mon','Tue','Wed','Fri','Sat'],
    baselines:{ 'run-cooper':3100 },
    sessions: runLog({weeks:10, perWeek:4, km:12, pace:'5:20', qualityPace:'4:40'}),
  },
  'control-unfit': {
    label: 'Control · unfit runner',
    profile: { goal:'Run a faster marathon' },
    intake: {
      goal:'Run a faster marathon.',
      timeline:'16 weeks.',
      history:'Never run further than 14k. Six weeks of jogging so far, 6:40/km feels hard.',
      constraints:'Knee flares if I ramp too fast.',
    },
    weeks:16, sessionsPerWeek:5, trainDays:['Mon','Tue','Wed','Fri','Sat'],
    baselines:{ 'run-cooper':2200 },
    sessions: runLog({weeks:6, perWeek:2, km:6, pace:'6:40'}),
  },

  // ── Others worth watching ─────────────────────────────────────────────────
  'hybrid-fitstop': {
    label: 'Hybrid · Fitstop + running',
    profile: { goal:'Fitstop 3x a week plus a half marathon in spring' },
    intake: {
      goal:'Keep my Fitstop classes and add a half marathon in spring.',
      timeline:'About 14 weeks to the half.',
      history:'Fitstop for two years, ran a 2:05 half off almost no run training.',
      constraints:'Fitstop Mon/Wed/Fri, non-negotiable.',
    },
    weeks:14, sessionsPerWeek:5, trainDays:['Mon','Tue','Wed','Fri','Sun'],
    sessions: runLog({weeks:5, perWeek:2, km:7, pace:'6:00'}),
  },
  'returning-injury': {
    label: 'Returning · post-injury 10k',
    profile: { goal:'Back to a sub-50 10k after injury' },
    intake: {
      goal:'Back to sub-50 for 10k. Was 47 before I got hurt.',
      timeline:'No race booked — I want to be running properly again in 3 months.',
      history:'Stress fracture in the right tibia, out for 5 months, cleared to run 2 weeks ago.',
      constraints:'Cleared for 20 min easy every other day, building. Nothing hard yet.',
    },
    weeks:12, sessionsPerWeek:3, trainDays:['Tue','Thu','Sat'],
    sessions: runLog({weeks:2, perWeek:2, km:3, pace:'7:10'}),
  },
};
