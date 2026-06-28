// Knowledge domain: FITSTOP — PROPRIETARY METHODOLOGY.
//
// ⚠️ Per the sourcing policy, NO Fitstop proprietary methodology is fabricated here.
// Until verified, user-provided material is supplied (see fitstop.TEMPLATE.md), this
// domain provides only GENERIC, established conditioning science as a safe fallback,
// mapped to the LIFT / PERFORM class labels the app already uses. The engine treats
// Fitstop days as established strength + conditioning work — it does not claim to
// replicate Fitstop's actual programming until that knowledge is provided.
//
// `provided: false` ⇒ consumers know this is fallback content, not the real method.

export const fitstopMeta = {
  provided: false,
  note: 'Generic conditioning fallback only. Awaiting verified Fitstop methodology (see fitstop.TEMPLATE.md).',
};

export const fitstop = [
  {
    id: 'fitstop.lift_fallback',
    domain: 'fitstop', version: 1,
    title: 'LIFT day (generic strength-biased fallback)',
    summary: 'A strength-biased class session: compound lifts + accessories at controlled intensity. Generic established-science stand-in for Fitstop LIFT.',
    principles: [
      'Anchor with a compound pattern (squat/hinge/push/pull) at moderate-heavy load.',
      'Fill with accessories for volume and balance; keep technique standards.',
      'Time-efficient: supersets/circuits acceptable while preserving main-lift quality.',
    ],
    prescription: { intensity: 'Mains RPE 7–8; accessories RPE 8–9.', duration: '~45 min.', frequency: '1–3×/week.', progression: 'Progressive overload on the main pattern.' },
    cautions: ['Fallback only — replace with verified Fitstop LIFT structure when provided.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','lift','strength','fallback'],
    sources: ['Established science: resistance-training principles (ACSM). NOT Fitstop proprietary method.'],
  },
  {
    id: 'fitstop.perform_fallback',
    domain: 'fitstop', version: 1,
    title: 'PERFORM day (generic conditioning fallback)',
    summary: 'A conditioning/HIIT class session: mixed-modal stations or intervals for work capacity. Generic established-science stand-in for Fitstop PERFORM.',
    principles: [
      'Mixed-modal circuits (AMRAP/EMOM/intervals) develop work capacity.',
      'Match work:rest to the target energy system (see physiology).',
      'Scale loads/skill so output stays high and form holds.',
    ],
    prescription: { intensity: 'Hard intervals / Z4–5 bursts with managed rest.', duration: '~45 min.', frequency: '1–2×/week.', progression: 'Add rounds/reps or cut rest before adding load.' },
    cautions: ['Fallback only — replace with verified Fitstop PERFORM structure when provided.'],
    appliesTo: ['fitstop','hybrid','hyrox'],
    tags: ['fitstop','perform','conditioning','hiit','fallback'],
    sources: ['Established science: HIIT / mixed-modal conditioning. NOT Fitstop proprietary method.'],
  },
  {
    id: 'fitstop.integration_fallback',
    domain: 'fitstop', version: 1,
    title: 'Integrating Fitstop with endurance (generic)',
    summary: 'How to slot Fitstop class days alongside running without excessive interference — applies established concurrent-training principles.',
    principles: [
      'Separate PERFORM/heavy LIFT days from hard runs (interference effect).',
      'Keep easy running easy around class days.',
      'Count class conditioning toward weekly hard-day budget.',
    ],
    prescription: { frequency: 'Stagger class intensity and run intensity across the week.', progression: 'Bias volume to the phase priority.' },
    cautions: ['Fallback only — refine once verified Fitstop fatigue cost is known.'],
    appliesTo: ['fitstop','hybrid'],
    tags: ['fitstop','integration','concurrent','fallback'],
    sources: ['Established science: concurrent-training sequencing. NOT Fitstop proprietary method.'],
  },
];
