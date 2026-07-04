// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK ATHLETES — Phase 0 regression fixtures
//
// Nine canonical athlete archetypes. Each carries the inputs the coaching pipeline
// reads today: a coach profile (ht-coach), training baselines (ht-baselines), and a
// program-builder config (programBuilderConfig). The harness seeds these, captures
// the generation PROMPT, runs the deterministic post-processing pipeline on a
// fixture program, and records coaching-quality metrics — so every future change
// can be proven to improve (or at least hold) these benchmark outputs.
//
// Profiles use the same field names the app uses (see buildCoachSystemPrompt /
// generateProgram): goal, coachStyle, background, focus, detail, strengthMethod,
// trainingSplit, hypertrophyApproach, name.
// ─────────────────────────────────────────────────────────────────────────────

const RUN_BASE = (threshold, z2lo, z2hi, vo2pace, vo2max) => ({
  'run-cooper': {
    run_threshold_pace: threshold, run_zone2_lo_pace: z2lo, run_zone2_hi_pace: z2hi,
    run_vo2max_pace: vo2pace, vo2max_predicted: vo2max,
  },
});
const STRENGTH_BASE = (sq, bn) => ({
  'strength-base': {
    squat_1rm_est: sq, squat_70: Math.round(sq*0.7), squat_80: Math.round(sq*0.8),
    bench_1rm_est: bn, bench_70: Math.round(bn*0.7), bench_80: Math.round(bn*0.8),
  },
});
const merge = (...objs) => Object.assign({}, ...objs);

export const BENCHMARKS = [
  {
    key: 'beginner',
    label: 'Beginner',
    profile: { name:'Sam', goal:'fitness', coachStyle:'motivational', background:'beginner', focus:'all', detail:'short' },
    baselines: {},
    config: { type:'hybrid', weeks:4, sessionsPerWeek:3,
      goal:'New to structured training — build a base of general fitness and confidence, 3 days/week, mix of easy running and full-body strength.' },
  },
  {
    key: 'weight-loss',
    label: 'Weight loss',
    profile: { name:'Jordan', goal:'fitness', coachStyle:'balanced', background:'beginner', focus:'all', detail:'short' },
    baselines: RUN_BASE('5:40','6:30','6:00','5:00',38),
    config: { type:'hybrid', weeks:5, sessionsPerWeek:4,
      goal:'Lose body fat and build a sustainable habit — 4 days/week, mostly Zone 2 with 2 full-body strength sessions for muscle retention.' },
  },
  {
    key: 'half-marathon',
    label: 'Half marathon',
    profile: { name:'Alex', goal:'marathon', coachStyle:'technical', background:'intermediate', focus:'running', detail:'detailed' },
    baselines: RUN_BASE('4:35','5:25','5:00','4:05',52),
    config: { type:'endurance', weeks:6, sessionsPerWeek:4,
      goal:'Sub-1:45 half marathon in 7 weeks — Zone 2 base, one tempo + one interval session, long run on the weekend.' },
  },
  {
    key: 'marathon',
    label: 'Marathon',
    profile: { name:'Riley', goal:'marathon', coachStyle:'technical', background:'experienced', focus:'running', detail:'detailed' },
    baselines: RUN_BASE('4:15','5:05','4:40','3:50',58),
    config: { type:'endurance', weeks:6, sessionsPerWeek:5,
      goal:'Sub-3:30 marathon — high aerobic volume, weekly long run progressing to 32km, one threshold and one easy quality session, strict polarised easy/hard.' },
  },
  {
    key: 'hyrox-open',
    label: 'HYROX Open',
    profile: { name:'Casey', goal:'sub90', coachStyle:'balanced', background:'intermediate', focus:'all', detail:'detailed',
      strengthMethod:'auto', trainingSplit:'total-body' },
    baselines: merge(RUN_BASE('4:50','5:40','5:15','4:20',49), STRENGTH_BASE(140,100)),
    config: { type:'hybrid', weeks:5, sessionsPerWeek:5,
      goal:'First HYROX, target sub-90 — compromised-running focus, 2 strength days + 3 runs, include sled/erg conditioning and station practice.' },
  },
  {
    key: 'hyrox-pro',
    label: 'HYROX Pro',
    profile: { name:'Morgan', goal:'sub75', coachStyle:'toughlove', background:'athlete', focus:'all', detail:'detailed',
      strengthMethod:'jts', trainingSplit:'total-body' },
    baselines: merge(RUN_BASE('4:05','4:55','4:30','3:40',60), STRENGTH_BASE(180,130)),
    config: { type:'hybrid', weeks:6, sessionsPerWeek:6,
      goal:'HYROX Pro sub-75 — high-end compromised running, heavy sled and wall-ball capacity, 3 quality runs + 2 strength + 1 race simulation, strong concurrent-training management.' },
  },
  {
    key: 'hybrid-athlete',
    label: 'Hybrid athlete',
    profile: { name:'Taylor', goal:'strength-hybrid-strength', coachStyle:'balanced', background:'experienced', focus:'all', detail:'detailed',
      strengthMethod:'westside', trainingSplit:'upper-lower' },
    baselines: merge(RUN_BASE('4:25','5:15','4:50','3:55',55), STRENGTH_BASE(200,140)),
    config: { type:'hybrid', weeks:6, sessionsPerWeek:5,
      goal:'Maintain a big squat/deadlift while building a sub-20 5K — concurrent training, separate heavy-lift and hard-run days, manage interference.' },
  },
  {
    key: 'masters',
    label: 'Masters athlete',
    profile: { name:'Pat', goal:'marathon', coachStyle:'balanced', background:'experienced', focus:'running', detail:'detailed' },
    baselines: RUN_BASE('5:00','5:55','5:25','4:30',46),
    config: { type:'hybrid', weeks:5, sessionsPerWeek:4,
      goal:'Masters (50+) half-marathon — extra recovery between hard days, 3 runs + 1 strength/mobility session, connective-tissue care, no back-to-back intensity.' },
  },
  {
    key: 'busy-professional',
    label: 'Busy professional',
    profile: { name:'Drew', goal:'fitness', coachStyle:'direct', background:'intermediate', focus:'all', detail:'short' },
    baselines: merge(RUN_BASE('4:45','5:35','5:10','4:15',50), STRENGTH_BASE(150,105)),
    config: { type:'fitstop', weeks:4, sessionsPerWeek:3,
      goal:'Time-poor (3×45min/week) — efficient Fitstop-style sessions: 2 strength-biased LIFT + 1 conditioning PERFORM, maintain fitness on minimal volume.' },
  },
];
