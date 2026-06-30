// ─────────────────────────────────────────────────────────────────────────────
// RUNNING KNOWLEDGE LIBRARY — modular, evidence-informed coaching domains.
//
// NOT copied from any book/course/proprietary program. Each domain summarises major
// coaching principles, physiological concepts and programming frameworks from
// established endurance science and publicly-available coaching methodology.
//
// SOURCE TIERS (every domain is tagged):
//   established  — exercise-science consensus (peer-reviewed physiology)
//   accepted     — widely accepted coaching practice
//   methodology  — a named, public methodology's concept (cited by name)
//   synthesis    — Coach EV's synthesised coaching philosophy (clearly labelled)
//
// DOMAIN SCHEMA:
//   id, title, sourceTier, summary,
//   coreConcepts[], adaptations[], programming[], progression[], recovery[],
//   contraindications[], relatedTo[]   (other domain ids)
//
// The Programming Engine consults these domains to reason about adaptations and
// programming decisions (see scripts/build-knowledge.mjs → inline RUNNING_KB).
// ─────────────────────────────────────────────────────────────────────────────

export const RUNNING_DOMAINS = [
  {
    id: 'exercise_physiology', title: 'Exercise Physiology', sourceTier: 'established',
    summary: 'How the body responds and adapts to running stress across systems.',
    coreConcepts: ['Stress → recovery → adaptation (supercompensation).', 'Specific adaptations to imposed demands (SAID).', 'Central (cardiac) vs peripheral (muscular) adaptation.'],
    adaptations: ['Cardiac output / stroke volume, plasma volume, mitochondrial density, capillarisation, substrate utilisation.'],
    programming: ['Distribute stress so each system is loaded and allowed to recover.', 'Progress one variable at a time.'],
    progression: ['Increase load only when current load is consolidated; ~5–10%/week typical ceiling.'],
    recovery: ['Adaptation occurs during recovery, not the session; sleep and fuel gate it.'],
    contraindications: ['Compounding multiple new stressors at once obscures cause and raises risk.'],
    relatedTo: ['energy_systems','recovery_science','aerobic_development'],
  },
  {
    id: 'energy_systems', title: 'Energy Systems', sourceTier: 'established',
    summary: 'Phosphocreatine, glycolytic and oxidative pathways and their training targets.',
    coreConcepts: ['ATP-PCr (~0–10 s), glycolytic (~10 s–2 min), oxidative (>2 min and all easy work).', 'Work:rest and duration determine which system dominates.'],
    adaptations: ['Enzyme up-regulation, buffering capacity, fat-oxidation efficiency, lactate clearance.'],
    programming: ['Match interval duration/recovery to the target system.', 'Most race distances are oxidative-dominant — train accordingly.'],
    progression: ['Lengthen intervals or shorten recoveries to bias the targeted system over a block.'],
    recovery: ['Glycolytic/anaerobic work is high-CNS/metabolic — needs more recovery than aerobic.'],
    contraindications: ['Training the wrong system for the event wastes adaptive capacity.'],
    relatedTo: ['vo2max','lactate_threshold','speed_development'],
  },
  {
    id: 'aerobic_development', title: 'Aerobic Development', sourceTier: 'accepted',
    summary: 'Building the aerobic base that underpins all endurance performance.',
    coreConcepts: ['Low-intensity volume (Zone 2) drives mitochondrial + capillary growth and durability.', 'Frequency and total easy time matter more than occasional hard efforts.'],
    adaptations: ['Mitochondrial density, capillarisation, fat oxidation, aerobic enzyme activity, durability.'],
    programming: ['Easy aerobic running forms the bulk of weekly volume (the "base").', 'Polarised distribution: keep easy genuinely easy.'],
    progression: ['Add easy volume first; ~5–10%/week; hold every 3–4 weeks.'],
    recovery: ['Low fatigue cost — high frequency is sustainable when intensity stays controlled.'],
    contraindications: ['Running base too fast (drift into moderate) — the classic intermediate error.'],
    relatedTo: ['lactate_threshold','long_runs','recovery_science'],
    // Machine-consumable prescription the Programming Engine builds sessions from.
    rx: { runType:'easy', paceKey:'easy', zone:'Z2', startMin:35, growMin:25 },
  },
  {
    id: 'lactate_threshold', title: 'Lactate Threshold', sourceTier: 'methodology',
    summary: 'Raising the pace sustainable before fatigue accelerates — the biggest lever for 10K→marathon. (Daniels T-pace; Coggan FTP analogue.)',
    coreConcepts: ['Threshold ≈ "comfortably hard", ~max pace sustainable ~60 min.', 'Improves the fraction of VO₂max usable over race duration.'],
    adaptations: ['Higher lactate-clearance/buffering; raised velocity at threshold; better economy at speed.'],
    programming: ['Tempo runs (continuous 20–40 min) and cruise intervals (e.g. 3–5×8–10 min, short jog).', 'Typically 1×/week; up to 2 in a threshold block.'],
    progression: ['Extend time-at-threshold week to week before raising pace.'],
    recovery: ['Moderate cost; avoid stacking with VO₂max or hard lifting on adjacent days.'],
    contraindications: ['Overuse → chronic "grey-zone" grind with little adaptation.'],
    relatedTo: ['vo2max','energy_systems','race_specific'],
    rx: { runType:'tempo', paceKey:'threshold', zone:'Z3–4', repsStart:3, repsMax:5, minStart:8, minMax:10, recovery:'2 min jog', deloadReps:2, deloadMin:6 },
  },
  {
    id: 'vo2max', title: 'VO₂max', sourceTier: 'methodology',
    summary: 'Raising maximal aerobic power via work near vVO₂max. (Billat vVO₂max intervals.)',
    coreConcepts: ['Accumulate time near 95–100% VO₂max in repeats.', 'Recoveries long enough to hold quality, short enough to keep aerobic stimulus.'],
    adaptations: ['Higher VO₂max ceiling, stroke volume, O₂ delivery and economy at speed.'],
    programming: ['Reps 3–5 min (e.g. 5×3 min) or shorter (8–12×400–800 m); 1×/week in a VO₂ block.'],
    progression: ['Add reps/total work before adding speed; cap the block at ~3–6 weeks.'],
    recovery: ['High cost — most injury-prone; requires an aerobic base first; never adjacent to heavy lower-body lifting.'],
    contraindications: ['No aerobic base, or stacking with other hard sessions.'],
    relatedTo: ['energy_systems','speed_development','aerobic_development'],
    rx: { runType:'intervals', paceKey:'vo2', zone:'Z5', repsStart:5, repsMax:10, dist:'800 m', recovery:'90 s jog', deloadReps:4 },
  },
  {
    id: 'running_economy', title: 'Running Economy', sourceTier: 'established',
    summary: 'The O₂ cost of running at a given pace — improvable via neuromuscular + structural work.',
    coreConcepts: ['Economy is a strong performance predictor independent of VO₂max.', 'Improved by accumulated specific running, strides, plyometrics and strength.'],
    adaptations: ['Tendon stiffness/elastic return, neuromuscular efficiency, reduced O₂ cost at pace.'],
    programming: ['Strides (4–8×~20 s), plyometrics, heavy/explosive strength, hill sprints.'],
    progression: ['Introduce strides/plyos low-volume; build gradually; pair with base.'],
    recovery: ['Strides/short hills are low-fatigue; plyometrics tax connective tissue — progress slowly.'],
    contraindications: ['High-volume plyometrics on fatigued/under-prepared tissue.'],
    relatedTo: ['speed_development','biomechanics','concurrent_training'],
  },
  {
    id: 'speed_development', title: 'Speed Development', sourceTier: 'accepted',
    summary: 'Neuromuscular speed and mechanics that support faster, more economical running.',
    coreConcepts: ['Short maximal efforts with full recovery develop power/mechanics without big metabolic cost.', 'Distinct from VO₂max (anaerobic/neural vs aerobic).'],
    adaptations: ['Motor-unit recruitment, rate of force development, stride power, coordination.'],
    programming: ['Strides, hill sprints (8–10 s, full recovery), flat sprints for track athletes.'],
    progression: ['Add reps gradually; keep quality high; full recoveries.'],
    recovery: ['Low metabolic cost but high neural quality — never grind.'],
    contraindications: ['Sprinting cold or fatigued (hamstring risk).'],
    relatedTo: ['running_economy','track_training','biomechanics'],
  },
  {
    id: 'long_runs', title: 'Long Runs', sourceTier: 'accepted',
    summary: 'Weekly long run for endurance, durability, fat oxidation and (marathon) fueling adaptation.',
    coreConcepts: ['Duration matters more than pace for base; mostly Zone 2.', 'Distance-specific finishes (marathon-pace segments) for race specificity.'],
    adaptations: ['Endurance, glycogen storage/fat oxidation, musculoskeletal durability, mental resilience.'],
    programming: ['1×/week; cap a single long run near ~30–35% of weekly volume.', 'Half: ~90–120 min; Marathon: progress toward ~28–32 km.'],
    progression: ['Lengthen gradually; insert a shorter "down" long run every 3–4 weeks.'],
    recovery: ['High mechanical/connective load — schedule easy/rest after.'],
    contraindications: ['Jumping long-run distance too fast — common injury cause.'],
    relatedTo: ['aerobic_development','race_specific','recovery_science'],
    rx: { runType:'long', paceKey:'easy', zone:'Z2', startKm:12, growKm:9, capKm:32, minPerKm:5.6 },
  },
  {
    id: 'race_specific', title: 'Race-Specific Programming', sourceTier: 'methodology',
    summary: 'Specificity, goal-pace work, pacing and tapering as a race nears. (Bosquet/Mujika taper.)',
    coreConcepts: ['Specificity rises as the event nears; general fitness is sharpened, not built.', 'Even/negative splits beat positive splits at every distance.'],
    adaptations: ['Goal-pace economy, pacing skill, race-day fueling tolerance, peak freshness.'],
    programming: ['Race-pace segments scaled to distance; rehearse fueling/logistics; taper volume ~40–60% over 1–2 wk (keep intensity).'],
    progression: ['Increase race-pace continuity through the specific block, then taper.'],
    recovery: ['Taper sheds fatigue to reveal fitness; over/under-tapering both cost.'],
    contraindications: ['Introducing new intensities in the final 2 weeks.'],
    relatedTo: ['lactate_threshold','long_runs','recovery_science'],
  },
  {
    id: 'concurrent_training', title: 'Concurrent Training', sourceTier: 'established',
    summary: 'Managing the interference between endurance and strength training. (Hickson; Coffey & Hawley.)',
    coreConcepts: ['Endurance + strength can blunt strength/power gains (AMPK vs mTOR + residual fatigue).', 'Mostly fatigue-mediated — recovery and sequencing mitigate it.'],
    adaptations: ['Depends on management: well-sequenced concurrent training can develop both.'],
    programming: ['Separate hard runs from heavy lower-body lifts by ≥6–24 h; bias volume to the phase priority; same-muscle high-intensity is worst.'],
    progression: ['Shift the strength:endurance balance by phase rather than maxing both at once.'],
    recovery: ['Add recovery when stacking modalities; watch lower-body load.'],
    contraindications: ['VO₂max work adjacent to a heavy squat day.'],
    relatedTo: ['vo2max','recovery_science','hyrox_running'],
  },
  {
    id: 'recovery_science', title: 'Recovery Science', sourceTier: 'established',
    summary: 'Sleep, HRV, fatigue monitoring and load management that enable adaptation.',
    coreConcepts: ['Sleep is the primary recovery driver; HRV/RHR trends reflect autonomic recovery.', 'Acute:chronic workload (ACWR) tracks injury/readiness better than absolute load.'],
    adaptations: ['Adaptation is realised in recovery; chronic shortfall blunts it.'],
    programming: ['Hard/easy sequencing; deload every 3–5 weeks; auto-regulate by readiness.'],
    progression: ['Let recovery markers gate progression; ramp load smoothly (avoid acute spikes).'],
    recovery: ['Active recovery, post-session protein+carb, hydration; gadgets are marginal vs sleep/food/time.'],
    contraindications: ['Hard sessions on chronic sleep debt or suppressed HRV.'],
    relatedTo: ['exercise_physiology','injury_prevention','concurrent_training'],
    rx: { runType:'recovery', paceKey:'easy', zone:'Z1–2', startMin:25, growMin:10 },
  },
  {
    id: 'biomechanics', title: 'Biomechanics', sourceTier: 'accepted',
    summary: 'Gait, cadence, ground contact and loading mechanics relevant to performance and injury.',
    coreConcepts: ['Cadence/overstride influence loading; self-optimised gait is usually efficient.', 'Surface and footwear change load distribution.'],
    adaptations: ['Neuromuscular coordination, tissue tolerance to specific load patterns.'],
    programming: ['Strides/drills for mechanics; modest cadence cues if overstriding; vary surfaces.'],
    progression: ['Change one mechanical variable slowly; let tissue adapt.'],
    recovery: ['Mechanical changes redistribute load — monitor new niggles.'],
    contraindications: ['Abrupt large gait/footwear changes (e.g. sudden minimalist transition).'],
    relatedTo: ['running_economy','injury_prevention','speed_development'],
  },
  {
    id: 'injury_prevention', title: 'Injury Prevention', sourceTier: 'established',
    summary: 'Load progression and tissue capacity to keep training uninterrupted.',
    coreConcepts: ['Most overuse injury = load outpacing tissue tolerance (tendon/bone adapt slower than fitness).', 'Consistency beats heroics; the best session is one you can repeat.'],
    adaptations: ['Tendon stiffness, bone density, muscular capacity to tolerate load.'],
    programming: ['Cap impact-volume increases (~≤10%/week); strength for resilience; tendon-specific loading.'],
    progression: ['Conservative ramps; return-from-layoff rebuilds tissue tolerance before chasing fitness.'],
    recovery: ['Heed early warning signs (niggles, RHR drift) — back off early.'],
    contraindications: ['Volume spikes, all-intensity training, ignoring pain.'],
    relatedTo: ['recovery_science','biomechanics','aerobic_development'],
  },
  {
    id: 'treadmill_training', title: 'Treadmill Training', sourceTier: 'accepted',
    summary: 'Controlled-environment running with pace/incline precision.',
    coreConcepts: ['Belt assistance lowers metabolic cost slightly — ~1% incline approximates outdoor effort.', 'Precise pace/incline control aids structured intervals and pacing practice.'],
    adaptations: ['Same physiological targets as outdoor running; incline adds posterior-chain/strength stimulus.'],
    programming: ['Use for weather/safety, precise threshold/VO₂ pacing, incline-specific work; cue effort by HR.'],
    progression: ['Progress as outdoors; vary incline to add specificity.'],
    recovery: ['Lower mechanical variability — watch for repetitive-pattern niggles.'],
    contraindications: ['Treating treadmill pace as identical to road without the incline correction.'],
    relatedTo: ['lactate_threshold','vo2max','biomechanics'],
  },
  {
    id: 'track_training', title: 'Track Training', sourceTier: 'accepted',
    summary: 'Measured-surface interval and speed work with precise rep control.',
    coreConcepts: ['Exact distances/splits enable precise VO₂max and speed sessions.', 'Flat, consistent surface for quality reps.'],
    adaptations: ['VO₂max, speed, pacing precision, lactate tolerance depending on session.'],
    programming: ['Classic reps (e.g. 400/800/1000 m) at target paces; full/controlled recoveries; strides.'],
    progression: ['Add reps/volume before pace; periodise toward race specificity.'],
    recovery: ['High-quality/high-CNS — cap frequency (~1–2 quality/week incl. track).'],
    contraindications: ['Daily track grinding; sprinting without warm-up.'],
    relatedTo: ['vo2max','speed_development','energy_systems'],
  },
  {
    id: 'trail_running', title: 'Trail Running', sourceTier: 'accepted',
    summary: 'Off-road running with terrain, vert and surface variability.',
    coreConcepts: ['Vert and uneven terrain shift effort/biomechanics; pace is unreliable — train by effort/HR.', 'Eccentric descent loading is a distinct stimulus/cost.'],
    adaptations: ['Strength-endurance, ankle/foot stability, eccentric durability, climbing economy.'],
    programming: ['Effort-based Zone 2 on rolling terrain; hike steep climbs; practise descents for the eccentric load.'],
    progression: ['Build vert gradually; introduce technical descents progressively.'],
    recovery: ['Descents cause marked muscle damage/DOMS — allow more recovery.'],
    contraindications: ['Big descent volume on unprepared quads; ankle risk on technical terrain when fatigued.'],
    relatedTo: ['biomechanics','injury_prevention','long_runs'],
  },
  {
    id: 'hyrox_running', title: 'HYROX Running', sourceTier: 'methodology',
    summary: 'Compromised running — running well off functional stations in the HYROX format (8×1 km + 8 stations).',
    coreConcepts: ['The decisive skill is running with pre-fatigued legs and elevated HR straight off a station.', 'Most race time is in the runs; pacing the first runs/stations protects the back half.'],
    adaptations: ['Running economy under fatigue, lactate tolerance, transition efficiency.'],
    programming: ['Brick sessions: station block → 400–1000 m run, repeated at goal effort; 1–2 compromised-running sessions/week in the specific block.'],
    progression: ['Increase run quality off stations week to week; build toward race simulation.'],
    recovery: ['High combined cost — manage concurrent strength/conditioning load.'],
    contraindications: ['Only practising fresh running; stacking with heavy lifting.'],
    relatedTo: ['concurrent_training','race_specific','lactate_threshold'],
  },
  {
    id: 'deka_running', title: 'DEKA Running', sourceTier: 'methodology',
    summary: 'Running interspersed through DEKA zones (MILE ~1 mile of running; FIT ~500 m between zones).',
    coreConcepts: ['Run:work ratio differs by format — train the specific balance.', 'Mixed-modal fatigue management and transitions between zones.'],
    adaptations: ['Running under mixed-modal fatigue, work-capacity, pacing across zones.'],
    programming: ['Rehearse the format-specific run:work ratio; brick-style zone→run intervals; pace early zones.'],
    progression: ['Build simulation completeness toward the event; taper before.'],
    recovery: ['Mixed-modal — manage total load like a hard race effort.'],
    contraindications: ['Going out too hot in early zones; neglecting the weakest zone.'],
    relatedTo: ['hyrox_running','concurrent_training','race_specific'],
  },
];

// Coach EV's synthesised philosophy — clearly labelled as synthesis (not a source).
export const COACH_EV_PHILOSOPHY = {
  id: 'coach_ev_synthesis', title: 'Coach EV — Coaching Philosophy', sourceTier: 'synthesis',
  principles: [
    'Adaptation first: choose the adaptation, then the session, day, and prescription.',
    'Easy easy, hard hard — protect the easy days; spend quality deliberately.',
    'Consistency and durability beat heroic single sessions; the best plan is the one you can repeat.',
    'Personalise to baselines, recovery and constraints; progress only what recovery has earned.',
    'Every recommendation must be explainable and scientifically defensible.',
  ],
};

export const RUNNING_KB_VERSION = 2;
