// Knowledge domain: NUTRITION — fueling, hydration, recovery nutrition, race
// nutrition. Established sports-nutrition consensus (ACSM/ISSN). General guidance,
// not individualised medical/dietetic advice.

export const nutrition = [
  {
    id: 'nutrition.training_fueling',
    domain: 'nutrition', version: 1,
    title: 'Daily Training Fueling',
    summary: 'Carbohydrate availability should match the day\'s training demand; protein should be adequate and distributed.',
    principles: [
      'Periodise carbohydrate to load: more on hard/long days, less on easy/rest days.',
      'Protein ~1.6–2.2 g/kg/day, spread across meals, supports adaptation and lean mass.',
      'Don\'t chronically under-fuel hard training (low energy availability harms health and performance).',
    ],
    prescription: { progression: 'Scale carbohydrate intake to the training calendar.' },
    cautions: ['Chronic under-fueling → RED-S risk: hormonal, bone and performance decline.'],
    appliesTo: ['running','strength','hybrid','hyrox','deka'],
    tags: ['carbohydrate','protein','fueling','energy-availability'],
    sources: ['Established science: ACSM/AND/DC nutrition-for-athletic-performance; ISSN position stands.'],
  },
  {
    id: 'nutrition.hydration',
    domain: 'nutrition', version: 1,
    title: 'Hydration & Electrolytes',
    summary: 'Begin sessions euhydrated and limit large fluid deficits; replace sodium during long or hot efforts.',
    principles: [
      'Use thirst + urine colour as practical guides; avoid both dehydration and overdrinking.',
      'Sodium replacement matters in long, hot, or salty-sweat efforts.',
    ],
    prescription: { progression: 'Match fluid/sodium to sweat rate, duration and conditions.' },
    cautions: ['Overdrinking plain water in long events risks hyponatraemia.'],
    appliesTo: ['running','hyrox','deka','hybrid'],
    tags: ['hydration','electrolytes','sodium'],
    sources: ['Established science: ACSM hydration guidance; exercise-associated hyponatraemia consensus.'],
  },
  {
    id: 'nutrition.recovery_nutrition',
    domain: 'nutrition', version: 1,
    title: 'Recovery Nutrition',
    summary: 'Post-session carbohydrate + protein restores glycogen and supports repair; timing matters most when the next session is soon.',
    principles: [
      'Protein ~0.3 g/kg post-session supports muscle protein synthesis.',
      'Carbohydrate refuel is priority when training again within ~8 h.',
      'Total daily intake matters more than narrow timing windows for most athletes.',
    ],
    prescription: { progression: 'Prioritise post-session refuel before back-to-back hard days.' },
    cautions: ['Tight "anabolic window" claims are overstated; daily totals dominate.'],
    appliesTo: ['running','strength','hybrid','hyrox','deka'],
    tags: ['recovery','protein','glycogen','timing'],
    sources: ['Established science: ISSN nutrient-timing position stand; glycogen-resynthesis literature.'],
  },
  {
    id: 'nutrition.race_nutrition',
    domain: 'nutrition', version: 1,
    title: 'Race & Long-Session Fueling',
    summary: 'For efforts beyond ~60–90 min, in-event carbohydrate sustains pace; the gut must be trained to tolerate it.',
    principles: [
      'Target ~30–90 g carbohydrate/hour for long efforts (higher with multiple transportable carbs + gut training).',
      'Rehearse exact race fueling/hydration in training — never new on race day.',
    ],
    prescription: { duration: 'Fuel from early in long events, not once depleted.', progression: 'Train the gut to tolerate target intake.' },
    cautions: ['Untrained high-carb intake causes GI distress; "nothing new on race day".'],
    appliesTo: ['running','hyrox','deka','hybrid'],
    tags: ['race-fueling','carbohydrate','gut-training'],
    sources: ['Established science: Jeukendrup carbohydrate-intake guidelines; multiple-transportable-carbohydrate research.'],
  },
];
