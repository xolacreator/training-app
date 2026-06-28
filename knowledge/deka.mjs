// Knowledge domain: DEKA — event demands, movement sequencing, race preparation.
// Event formats are PUBLIC fact; coaching method is established science. No
// proprietary methodology fabricated.

export const deka = [
  {
    id: 'deka.event_formats',
    domain: 'deka', version: 1,
    title: 'DEKA Event Formats',
    summary: 'DEKA is a functional-fitness benchmark in three formats built around 10 standardised "Zones" (work stations).',
    principles: [
      'DEKA STRONG: 10 zones, no running — strength-endurance / power-endurance focus.',
      'DEKA MILE: 10 zones interspersed with running totalling ~1 mile.',
      'DEKA FIT: 10 zones with ~500 m runs between zones — the most endurance-biased.',
      'Scored on total time including a penalty/standard for incomplete work.',
    ],
    prescription: { progression: 'Pick the format; train its specific run:work balance.' },
    cautions: ['The three formats demand different fitness — do not train them identically.'],
    appliesTo: ['deka','hybrid'],
    tags: ['event','format','zones'],
    sources: ['Public event format: DEKA STRONG/MILE/FIT structure (10 zones).'],
  },
  {
    id: 'deka.movement_sequencing',
    domain: 'deka', version: 1,
    title: 'Zone Movement Sequencing & Transitions',
    summary: 'Performance depends on sustaining output across varied functional zones and managing transitions/heart-rate between them.',
    principles: [
      'Train mixed-modal circuits that rotate movement patterns under fatigue.',
      'Transition efficiency and pacing between zones is a trainable skill.',
      'Identify and shore up the weakest zones rather than rehearsing strengths.',
    ],
    prescription: { intensity: 'Submaximal sustainable across zones.', duration: 'Circuit/round-based functional work.', frequency: '1–2×/week specific.', progression: 'Add rounds/zones or reduce transition rest.' },
    cautions: ['Neglecting the weakest zone caps the total score.'],
    appliesTo: ['deka','hybrid','fitstop'],
    tags: ['sequencing','transitions','circuit','work-capacity'],
    sources: ['Established science: mixed-modal conditioning + specificity applied to public zone format.'],
  },
  {
    id: 'deka.race_prep',
    domain: 'deka', version: 1,
    title: 'DEKA Race Preparation',
    summary: 'Prepare with format-specific simulations, pacing rehearsal and a short taper, as for any timed event.',
    principles: [
      'Rehearse the specific run:work ratio of the chosen format.',
      'Practise pacing the early zones to protect the finish.',
      'Taper volume into the event while keeping specificity.',
    ],
    prescription: { frequency: 'Partial simulations through the block; a sharpening sim before taper.', progression: 'Build simulation completeness, then taper ~1 week.' },
    cautions: ['Going out too hot in early zones is the common error.'],
    appliesTo: ['deka'],
    tags: ['race-prep','simulation','pacing','taper'],
    sources: ['Established science: pacing + taper applied to the DEKA format.'],
  },
];
