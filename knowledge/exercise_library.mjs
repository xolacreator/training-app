// Knowledge domain: EXERCISE_LIBRARY — movement taxonomy. Classifies movements by
// pattern, equipment, primary stimulus, fatigue cost and regressions/progressions so
// the Programming Engine can substitute intelligently (equipment/injury/fatigue aware).
// Established movement-classification principles; not proprietary.

const ex = (id, name, pattern, equipment, stimulus, fatigueCost, regress, progress, tags) => ({
  id: `exercise_library.${id}`, domain: 'exercise_library', version: 1,
  title: name, summary: `${pattern} · ${stimulus} · fatigue ${fatigueCost}`,
  movement: { pattern, equipment, stimulus, fatigueCost, regress, progress },
  appliesTo: ['strength','hybrid','hyrox','fitstop','deka'],
  tags, sources: ['Established science: movement-pattern taxonomy / exercise-classification principles.'],
});

export const exercise_library = [
  // Taxonomy reference entry
  {
    id: 'exercise_library.taxonomy',
    domain: 'exercise_library', version: 1,
    title: 'Movement Taxonomy (How exercises are classified)',
    summary: 'Every movement is tagged by pattern, equipment, primary stimulus and fatigue cost so it can be selected or swapped to fit the athlete and phase.',
    principles: [
      'Patterns: squat, hinge, vertical/horizontal push, vertical/horizontal pull, lunge, carry, core/brace, locomotion.',
      'Swap within a pattern to respect equipment, injuries and fatigue cost.',
      'High-fatigue compounds anchor a session; lower-fatigue accessories fill volume.',
    ],
    prescription: { progression: 'Select by pattern + stimulus; regress/progress within the same pattern.' },
    cautions: ['Substituting across patterns changes the training effect.'],
    appliesTo: ['strength','hybrid','hyrox','fitstop','deka'],
    tags: ['taxonomy','substitution','patterns'],
    sources: ['Established science: movement-pattern classification.'],
  },
  // Representative library entries (pattern · equipment · stimulus · fatigue 1–5)
  ex('back_squat','Back Squat','squat','barbell','max strength / quads',5,'Goblet Squat','Front/Tempo Squat',['squat','barbell','compound']),
  ex('front_squat','Front Squat','squat','barbell','strength / quads+trunk',4,'Goblet Squat','Heavier load',['squat','barbell']),
  ex('goblet_squat','Goblet Squat','squat','dumbbell/kettlebell','quads / endurance',2,'Bodyweight Squat','Barbell Squat',['squat','dumbbell','accessory']),
  ex('deadlift','Conventional Deadlift','hinge','barbell','max strength / posterior',5,'Romanian Deadlift','Heavier load',['hinge','barbell','compound']),
  ex('rdl','Romanian Deadlift','hinge','barbell/dumbbell','hamstrings / hypertrophy',3,'DB RDL','Deficit RDL',['hinge','hamstring']),
  ex('kb_swing','Kettlebell Swing','hinge','kettlebell','power-endurance / posterior',2,'Hip Hinge drill','Heavier bell',['hinge','kettlebell','conditioning']),
  ex('bench_press','Bench Press','horizontal push','barbell','max strength / chest',4,'DB Press','Heavier load',['push','barbell','compound']),
  ex('ohp','Overhead Press','vertical push','barbell','strength / shoulders',4,'DB Shoulder Press','Heavier load',['push','barbell']),
  ex('pushup','Push-up','horizontal push','bodyweight','endurance / chest',1,'Incline Push-up','Weighted Push-up',['push','bodyweight','conditioning']),
  ex('pullup','Pull-up','vertical pull','bodyweight','strength / back',3,'Lat Pulldown','Weighted Pull-up',['pull','bodyweight']),
  ex('row','Barbell Row','horizontal pull','barbell','strength / back',3,'DB Row','Heavier load',['pull','barbell']),
  ex('walking_lunge','Walking Lunge','lunge','dumbbell/bodyweight','unilateral / endurance',3,'Split Squat','Loaded/longer',['lunge','unilateral','hyrox']),
  ex('farmers_carry','Farmers Carry','carry','dumbbell/kettlebell','grip / trunk endurance',3,'Lighter carry','Heavier/longer',['carry','grip','hyrox']),
  ex('wall_ball','Wall Ball','squat+push','medicine ball','power-endurance',3,'Lighter ball','Heavier/higher',['conditioning','hyrox','squat']),
  ex('sled_push','Sled Push','locomotion/push','sled','strength-endurance / legs',4,'Lighter sled','Heavier sled',['sled','hyrox','conditioning']),
  ex('plank','Plank / Anti-extension','core/brace','bodyweight','trunk stability',1,'Knee plank','Weighted/long lever',['core','brace']),
];
