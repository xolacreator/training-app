
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(300);

check('HYROX programming API exists', await page.evaluate(()=>
  ['progressHyroxBrick','progressHyroxStations','progressHyroxSimulation','hyroxDivision','hyroxLoads','_hyroxRaceDose']
    .every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── The race spec is real, sourced, and honest about what it doesn't know ──
const spec=await page.evaluate(()=>({
  season:HYROX_KB.season, verified:HYROX_KB.verified,
  divs:Object.keys(HYROX_KB.divisions),
  proMenPush:HYROX_KB.divisions.pro_men.sledPush.totalKg,
  openMenPush:HYROX_KB.divisions.open_men.sledPush.totalKg,
  openWomenPush:HYROX_KB.divisions.open_women.sledPush.totalKg,
  proWomenPush:HYROX_KB.divisions.pro_women.sledPush.totalKg,
  proMenWB:HYROX_KB.divisions.pro_men.wallBalls,
  disputed:HYROX_KB.disputed, sources:HYROX_KB.SOURCES.length,
  runs:HYROX_KB.format.runs, runM:HYROX_KB.format.runDistanceM,
}));
check('All four divisions are specified', spec.divs.length===4, spec.divs.join(','));
check('Pro men sled push is 202 kg', spec.proMenPush===202, String(spec.proMenPush));
check('Open men sled push is 152 kg', spec.openMenPush===152, String(spec.openMenPush));
check('Open women sled push is 102 kg', spec.openWomenPush===102, String(spec.openWomenPush));
check('Pro women race Open Men sled loads', spec.proWomenPush===152, String(spec.proWomenPush));
check('Pro men wall balls: 9 kg to 3.00 m', spec.proMenWB.kg===9 && spec.proMenWB.targetM===3.00, JSON.stringify(spec.proMenWB));
check('Race format is 8 × 1 km', spec.runs===8 && spec.runM===1000);
check('Every figure is source-attributed', spec.sources>=4, String(spec.sources));
check('Provenance is marked secondary, not official', spec.verified==='secondary', spec.verified);
check('The wall-ball rep dispute is RECORDED, not silently resolved',
  spec.disputed.length===1 && /100/.test(JSON.stringify(spec.disputed[0].values)) && /75/.test(JSON.stringify(spec.disputed[0].values)),
  JSON.stringify(spec.disputed[0]&&spec.disputed[0].values));
check('...and it says to confirm with the athlete', /confirm/i.test(spec.disputed[0].resolution));

// ── Division is inferred from the goal, and drives real loads ──────────────
const div=await page.evaluate(()=>{
  const out={};
  [['HYROX sub-70 Sydney','open_men'],['HYROX Pro sub-65','pro_men'],
   ['HYROX women open 90 min','open_women'],['HYROX pro women','pro_women']].forEach(([g,exp])=>{
    coachProfile={name:'EV',goal:g}; out[g]={got:hyroxDivision(),exp};
  });
  return out;
});
Object.entries(div).forEach(([g,v])=>check(`"${g}" → ${v.exp}`, v.got===v.exp, v.got));

check('An explicit division setting overrides inference', await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'HYROX sub-70'};
  localStorage.setItem('ht-hyrox-division','pro_women');
  const d=hyroxDivision(); localStorage.removeItem('ht-hyrox-division');
  return d==='pro_women'; }));

// ── Brick sessions: the defining HYROX session, now producible ─────────────
const setup=(goal)=>page.evaluate((goal)=>{
  coachProfile={name:'EV',goal};
  saveProgramData({id:'h',name:'HYROX',type:'hybrid',startDate:_mondayISO(new Date()),weeks:12,sessionsPerWeek:5,
    sessions:[{id:'brick',type:'endurance',name:'Compromised Run',runType:'hyrox_brick'}],
    dayMap:['brick',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  return [1,5,9].map(w=>progressHyroxBrick(w,13));
}, goal);

const bricks=await setup('HYROX sub-70 Sydney');
check('A brick session is generated', !!bricks[0] && /→/.test(bricks[0].intervals), bricks[0]&&bricks[0].intervals);
check('It pairs a station with a run', /\[.+→ \d+ m run \]/.test(bricks[0].intervals), bricks[0].intervals);
check('Base uses short exposures', /400 m run/.test(bricks[0].intervals), bricks[0].intervals);
check('Peak runs the full race 1 km', /1000 m run/.test(bricks[2].intervals), bricks[2].intervals);
check('Rounds build across the block', bricks[2].rounds>bricks[0].rounds, `${bricks[0].rounds} → ${bricks[2].rounds}`);
check('Rest compresses toward race pace', bricks[0].recovery!==bricks[2].recovery, `${bricks[0].recovery} → ${bricks[2].recovery}`);
check('Phases differ across the block', bricks[0].phase!==bricks[2].phase, `${bricks[0].phase} → ${bricks[2].phase}`);

// ── THE BUG THAT WAS THERE: dose must be a fraction of RACE dose ───────────
check('Sled push dose never exceeds its 50 m race distance', await page.evaluate(()=>{
  for(let w=1;w<=12;w++){ const b=progressHyroxBrick(w,13);
    if(b.station==='sledPush'){ const m=+(b.dose.match(/(\d+) m/)||[])[1];
      if(m>50) return false; } }
  return true; }));
check('Burpee broad jump dose never exceeds its 80 m race distance', await page.evaluate(()=>{
  for(let w=1;w<=12;w++){ const b=progressHyroxBrick(w,13);
    if(b.station==='burpeeBroadJump'){ const m=+(b.dose.match(/(\d+) m/)||[])[1];
      if(m>80) return false; } }
  return true; }));
check('Wall balls are prescribed in reps, not metres', await page.evaluate(()=>{
  for(let w=1;w<=12;w++){ const b=progressHyroxBrick(w,13);
    if(b.station==='wallBalls') return /reps/.test(b.dose); }
  return true; }));

// ── Loads are the athlete's REAL division loads ───────────────────────────
check('Peak brick uses the exact race load, not a rounded one', await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'HYROX Pro sub-65'};
  for(let w=8;w<=12;w++){ const b=progressHyroxBrick(w,13);
    if(b.station==='sledPush' && b.phase==='Peak') return /202 kg/.test(b.load); }
  return true; }));
check('Base loads are submaximal', await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'HYROX sub-70'};
  const b=[1,2,3].map(w=>progressHyroxBrick(w,13)).find(x=>x.station==='sledPush');
  if(!b) return true;
  const kg=+(b.load.match(/([\d.]+) kg/)||[])[1];
  return kg < 152; }));

// ── All eight stations get trained across a block ─────────────────────────
check('Station rotation covers every station across the block', await page.evaluate(()=>{
  const seen=new Set();
  for(let w=1;w<=12;w++){ seen.add(progressHyroxBrick(w,13).station);
                          progressHyroxStations(w,13).exercises.forEach(e=>seen.add(e.name)); }
  return seen.size>=8; }));
check('It does NOT claim to target a weakest station', await page.evaluate(()=>{
  const rx=_rxForRunType('hyrox_brick');
  return /Rotate stations/.test(rx.selection) && !/weakest/i.test(rx.selection.replace(/weakness-targeting/,'')); }));

// ── Station sessions ──────────────────────────────────────────────────────
const st=await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'HYROX sub-70'};
  return [1,6,11].map(w=>progressHyroxStations(w,13)); });
check('A station session is generated', !!st[0] && st[0].exercises.length===3, JSON.stringify(st[0]&&st[0].exercises.length));
check('Each station carries sets, dose, load and a cue',
  st[0].exercises.every(e=>e.sets && e.reps && e.load && e.cue));
check('Load rises Base → Peak per the KB', await page.evaluate(()=>{
  const f=(w)=>{const s=progressHyroxStations(w,13);
    const e=s.exercises.find(x=>/Sled Push/.test(x.name)); return e?+(e.load.match(/([\d.]+)/)||[])[1]:null;};
  let base=null,peak=null;
  for(let w=1;w<=4;w++){ const v=f(w); if(v){base=v;break;} }
  for(let w=9;w<=12;w++){ const v=f(w); if(v){peak=v;break;} }
  return base==null||peak==null||peak>base; }));
check('Sessions cite their knowledge domain', st[0].knowledgeDomain==='hyrox_strength' && bricks[0].knowledgeDomain==='hyrox_running');

// ── Race simulation ───────────────────────────────────────────────────────
const sim=await page.evaluate(()=>({full:progressHyroxSimulation(10,13,{}),half:progressHyroxSimulation(11,13,{half:true})}));
check('A full simulation is 8 runs in race order', /FULL/.test(sim.full.intervals) && /8 × 1 km/.test(sim.full.intervals), sim.full.intervals);
check('A half simulation is 4', /HALF/.test(sim.half.intervals) && /4 × 1 km/.test(sim.half.intervals));
check('The simulation names the division being raced', /Men|Women/.test(sim.full.division), sim.full.division);

// ── It renders through the normal prescription path ───────────────────────
check('_progressEndurance routes hyrox_brick to the HYROX engine', await page.evaluate(()=>{
  const rx=_progressEndurance({type:'endurance',runType:'hyrox_brick'},7,13);
  return /→/.test(rx.intervals||'') && rx.knowledgeDomain==='hyrox_running'; }));
check('_progressEndurance routes hyrox_sim too', await page.evaluate(()=>{
  const rx=_progressEndurance({type:'endurance',runType:'hyrox_sim'},11,13);
  return /simulation/i.test(rx.intervals||''); }));
check('Running sessions are unaffected', await page.evaluate(()=>{
  const rx=_progressEndurance({type:'endurance',runType:'tempo'},5,13);
  return /min @/.test(rx.intervals||'') && !/→/.test(rx.intervals||''); }));

// ── KB-driven: mutate the knowledge, the programming changes ──────────────
check('Mutating the brick rx phase changes the session', await page.evaluate(()=>{
  const rx=runningDomain('hyrox_running').rx;
  const before=progressHyroxBrick(9,13).intervals;
  rx.phases.Peak.runDistM=1500;
  const after=progressHyroxBrick(9,13).intervals;
  rx.phases.Peak.runDistM=1000;
  return /1500 m run/.test(after) && !/1500/.test(before); }));
check('Mutating a station in the strength KB changes the session', await page.evaluate(()=>{
  const rx=strengthDomain('hyrox_strength').rx;
  const orig=rx.stations[0].setsStart; rx.stations[0].setsStart=9;
  const s=progressHyroxStations(1,13);
  rx.stations[0].setsStart=orig;
  return s.exercises.some(e=>e.sets>=7); }));

// ── The block is what the athlete SEES, not what weeklyProgressions asserts ──
// weeklyProgressions[8].simulation==='full' meant nothing until the week that
// carries it actually resolved to a simulation. These test the delivered week.
const blk=await page.evaluate(()=>{
  const prog=buildHyroxBlock({division:'open_men',weeks:12,sessionsPerWeek:5,
    trainDays:['Mon','Tue','Wed','Fri','Sat']});
  saveProgramData(prog);
  const names=w=>(_progWeekSessions(w)||[]).filter(s=>s.session).map(s=>s.session.name);
  const days =w=>(_progWeekSessions(w)||[]).filter(s=>s.session).map(s=>s.day+':'+s.session.id);
  return {
    simFull:prog.hyrox.simulationWeeks.full, simHalf:prog.hyrox.simulationWeeks.half,
    wkNormal:names(5), wkFull:names(prog.hyrox.simulationWeeks.full),
    wkHalf:names(prog.hyrox.simulationWeeks.half),
    daysFull:days(prog.hyrox.simulationWeeks.full),
    sessionIds:(prog.sessions||[]).map(s=>s.id),
    templateUntouched:(prog.dayMap||[]).join(','),
  };
});
check('A normal week carries the brick, not a simulation',
  blk.wkNormal.includes('Compromised Run') && !blk.wkNormal.some(n=>/Simulation/.test(n)),
  blk.wkNormal.join(', '));
check('The full-simulation week actually delivers the simulation',
  blk.wkFull.includes('Race Simulation'), `wk${blk.simFull}: ${blk.wkFull.join(', ')}`);
check('...and the brick is absorbed by it, not doubled up',
  !blk.wkFull.includes('Compromised Run'), blk.wkFull.join(', '));
check('...and the station session is dropped (the sim already races every station)',
  !blk.wkFull.includes('Station Work'), blk.wkFull.join(', '));
check('...it lands on the long-run day, where the time is',
  blk.daysFull.some(d=>/^Sat:hx-sim$/.test(d)), blk.daysFull.join(' '));
check('The half-simulation week delivers the half',
  blk.wkHalf.includes('Half Simulation'), `wk${blk.simHalf}: ${blk.wkHalf.join(', ')}`);
check('...and keeps station work (a half sim is not the whole race)',
  blk.wkHalf.includes('Station Work'), blk.wkHalf.join(', '));
check('Every session the week references exists in the block',
  blk.sessionIds.includes('hx-sim') && blk.sessionIds.includes('hx-sim-half'));
check('The simulation composes the week without rewriting the template',
  blk.templateUntouched.includes('hx-brick') && !blk.templateUntouched.includes('hx-sim'),
  blk.templateUntouched);

check('An explicit reschedule of that week still wins over the simulation swap',
  await page.evaluate(()=>{
    const prog=savedProgram; const w=prog.hyrox.simulationWeeks.full;
    prog.overrides={[w]:['hx-easy',null,null,null,null,null,null]};
    const got=_progWeekSessions(w).filter(s=>s.session).map(s=>s.session.id);
    delete prog.overrides;
    return got.length===1 && got[0]==='hx-easy'; }));

// ── The station session is a template; the week resolves it ─────────────────
const stat=await page.evaluate(()=>{
  const raw=(savedProgram.sessions||[]).find(s=>s.id==='hx-stations');
  const wk1=_sessionForWeek(raw,1), wk4=_sessionForWeek(raw,4);
  return { rawHasNone:!(raw.exercises&&raw.exercises.length),
           n1:(wk1.exercises||[]).length,
           names1:(wk1.exercises||[]).map(e=>e.name),
           names4:(wk4.exercises||[]).map(e=>e.name),
           loads1:(wk1.exercises||[]).map(e=>e.load),
           summary:_sessSummary(raw,1) };
});
check('The stored station session is a bare template', stat.rawHasNone);
check('A week resolves it into three real stations', stat.n1===3, stat.names1.join(', '));
check('Different weeks rotate to different stations',
  stat.names1.join()!==stat.names4.join(), `${stat.names1.join()} vs ${stat.names4.join()}`);
check('Resolved stations carry a concrete load',
  stat.loads1.some(l=>/\d/.test(String(l))), stat.loads1.join(' | '));
check('The calendar summary names the stations instead of counting them',
  /Sled|Ski|Row|Wall|Farmer|Sandbag|Burpee/.test(stat.summary) && !/^\d+ ex$/.test(stat.summary),
  stat.summary);
check('A non-HYROX session passes through _sessionForWeek untouched',
  await page.evaluate(()=>{
    const s={id:'x',type:'strength',name:'Lift',exercises:[{name:'Back Squat',sets:3,reps:'5'}]};
    return _sessionForWeek(s,3)===s; }));

// ── The conversation reaches the engine ─────────────────────────────────────
// The engine is only worth having if the design chat routes to it. A model
// authoring HYROX sessions from memory gets the loads wrong — so for HYROX the
// interview supplies parameters and the app supplies the content.
const eng=await page.evaluate(()=>{
  coachMessages=[{role:'assistant', intake:{
    goal:'HYROX Melbourne, Open Men, sub-80', timeline:'12 weeks out, entered and paid',
    history:'Raced once, blew up on the sled push and walked the last two runs' }}];
  const spec=_validateProgramSpec({ engine:'hyrox', name:'HYROX Build', weeks:12,
    sessionsPerWeek:5, division:'pro women', trainDays:['Mon','Tue','Wed','Fri','Sat'],
    goal:'HYROX Melbourne sub-80', raceDate:'2026-12-05', why:'12 weeks, two sims' });
  // Assert on the prompt the model actually receives, not on one function that
  // happens to hold part of it today — the engine instructions live in
  // _designEnginePrompt and are appended after the knowledge context.
  return { spec, prompt:(()=>{ try{
    return _designSystemPrompt() + '\n' + getKnowledgeContext(_designKnowledgeType(), {})
         + '\n' + _designEnginePrompt();
  }catch(e){ return 'ERR '+e.message; } })() };
});
check('An engine spec with no sessions is accepted, not rejected as malformed',
  eng.spec && !eng.spec.blocked && Array.isArray(eng.spec.dayMap), JSON.stringify(eng.spec).slice(0,90));
check('The app fills in the sessions the model did not write',
  (eng.spec.sessions||[]).some(s=>s.id==='hx-brick') && (eng.spec.sessions||[]).some(s=>s.id==='hx-sim'),
  (eng.spec.sessions||[]).map(s=>s.id).join(','));
check('The division stated in conversation is the one built',
  eng.spec.hyrox && eng.spec.hyrox.division==='pro_women', eng.spec.hyrox&&eng.spec.hyrox.division);
check('The simulation schedule survives into the spec',
  eng.spec.weeklyProgressions.some(w=>w.simulation==='full') &&
  eng.spec.weeklyProgressions.some(w=>w.simulation==='half'));
check('The interview conclusion still rides along', eng.spec.goal==='HYROX Melbourne sub-80');
check('The design prompt tells the model NOT to author HYROX sessions',
  /do NOT author the sessions/i.test(eng.prompt) && /engine.{0,4}:.{0,4}auto/i.test(eng.prompt),
  eng.prompt.slice(0,60));
check('...and to establish the division, since every load depends on it',
  /division/i.test(eng.prompt));

check('The intake gate still applies to engine blocks', await page.evaluate(()=>{
  coachMessages=[{role:'assistant', intake:{goal:'HYROX'}}];   // timeline + history missing
  const s=_validateProgramSpec({engine:'hyrox',weeks:12,sessionsPerWeek:5,division:'open_men'});
  return !!(s && s.blocked && s.missing.length); }));
check('A nonsense engine name is refused rather than silently ignored',
  await page.evaluate(()=>{
    coachMessages=[{role:'assistant', intake:{goal:'HYROX Melbourne sub-80',
      timeline:'12 weeks out, entered', history:'Raced once and blew up on the sled'}}];
    return _validateProgramSpec({engine:'hyroxx',weeks:12,sessionsPerWeek:5})===null; }));

check('Creating it commits the engine block, not a flattened generic ramp',
  await page.evaluate(()=>{
    coachMessages=[{role:'assistant', text:'here', intake:{
      goal:'HYROX Melbourne, Open Men, sub-80', timeline:'12 weeks out, entered',
      history:'Raced once, blew up on the sled' }}];
    const sp=_validateProgramSpec({engine:'hyrox',name:'HYROX Build',weeks:12,sessionsPerWeek:5,
      division:'open_men',trainDays:['Mon','Tue','Wed','Fri','Sat'],goal:'HYROX sub-80'});
    coachMessages[0].programSpec=sp;
    coachCreateProgram(0);
    const p=savedProgram;
    const simWk=(p.weeklyProgressions||[]).find(w=>w.simulation==='full');
    const names=simWk?_progWeekSessions(simWk.week).filter(s=>s.session).map(s=>s.session.name):[];
    return !!(p && p.hyrox && p.hyrox.division==='open_men' && simWk && names.includes('Race Simulation'));
  }));
check('...and the goal reached the profile', await page.evaluate(()=>
  /HYROX/i.test((coachProfile&&coachProfile.goal)||'')));

// ── What the program view shows must be what the week actually is ───────────
// The program overlay read session templates directly while the session overlay
// progressed them, so browsing to week 9 showed week 1's numbers.
const view=await page.evaluate(()=>{
  saveProgramData(buildHyroxBlock({division:'open_men',weeks:12,sessionsPerWeek:5,
    trainDays:['Mon','Tue','Wed','Fri','Sat']}));
  const grab=w=>{ programViewWeek=w; renderSavedProgram();
    return document.getElementById('program-overlay-body').innerText; };
  return { w1:grab(1), w5:grab(5), w9:grab(9) };
});
check('The program view shows real stations, not an empty strength card',
  /Sled Push|Sled Pull|Wall Balls/.test(view.w1), view.w1.slice(0,80).replace(/\n/g,' / '));
check('Week 5 does not show week 1 verbatim', view.w1!==view.w5);
check('The brick prescription in the program view progresses with the block',
  /×\s*\[/.test(view.w1) && /×\s*\[/.test(view.w5) &&
  (view.w1.match(/(\d+) × \[/)||[])[1] !== (view.w5.match(/(\d+) × \[/)||[])[1],
  `w1 "${(view.w1.match(/\d+ × \[[^\]]*\]/)||[''])[0]}" vs w5 "${(view.w5.match(/\d+ × \[[^\]]*\]/)||[''])[0]}"`);
check('The simulation week shows the simulation in the program view',
  /Race Simulation/.test(view.w9), view.w9.slice(0,120).replace(/\n/g,' / '));

// ── A simulation must never land in a deload week ──────────────────────────
// An 11-week block put the FULL race simulation at week 8, which is also a deload
// (8 % 4 === 0) — the hardest session in the block scheduled inside the recovery
// week. Found by running a real athlete's race date through the lab.
const sims = await page.evaluate(()=>{
  const out={};
  [8,11,12,13,16,20,24].forEach(wk=>{
    const pr=buildHyroxBlock({division:'pro_men', weeks:wk, sessionsPerWeek:5});
    const s=pr.weeklyProgressions.filter(w=>w.simulation);
    out[wk]={ sims:s.map(w=>({week:w.week, kind:w.simulation, deload:!!w.deload})),
              clash:s.filter(w=>w.deload).map(w=>w.week),
              distinct:new Set(s.map(w=>w.week)).size===s.length,
              count:s.length };
  });
  return out;
});
Object.entries(sims).forEach(([wk,r])=>{
  check(`${wk}-week block: no simulation in a deload week`, r.clash.length===0,
    r.clash.length ? `clash at week ${r.clash.join(',')}` : r.sims.map(s=>`${s.week}:${s.kind}`).join(' '));
});
Object.entries(sims).forEach(([wk,r])=>{
  check(`${wk}-week block: full and half are different weeks`, r.distinct && r.count===2,
    r.sims.map(s=>`${s.week}:${s.kind}`).join(' '));
});

// ── A deload week must be EASIER than the week before it ───────────────────
// progressHyroxBrick had no deload handling, and rx.phases['Deload'] does not
// exist — so the lookup fell through to rx.phases.Build, the HARDEST phase in the
// table. A real 12-week block to a real race date went from 2 × [ 25 m → 400 m ]
// in week 3 to 4 × [ 75 wall balls → 800 m ] in week 4, its deload. Three hundred
// wall balls prescribed as recovery.
const dl = await page.evaluate(()=>{
  const pr=buildHyroxBlock({division:'pro_men', weeks:12, sessionsPerWeek:5});
  saveProgramData(pr);
  const T=(pr.weeklyProgressions||[]).length;
  const week=w=>{
    const wp=pr.weeklyProgressions[w-1]||{};
    const b=progressHyroxBrick(w,T);
    const long=_progressEndurance({runType:'long',name:'Long Run'},w,T);
    const tempo=_progressEndurance({runType:'tempo',name:'Threshold Run'},w,T);
    return { w, deload:!!wp.deload, rounds:b.rounds, runM:b.runM, note:b.note,
             dose:parseFloat((b.dose.match(/([\d.]+)/)||[])[1]||0),
             longKm:parseFloat((String(long.distance||'').match(/([\d.]+)/)||[])[1]||0),
             tempo:tempo.intervals||'' };
  };
  const all=Array.from({length:T},(_,i)=>week(i+1));
  return { all, deloads:all.filter(x=>x.deload) };
});
check('The block has mid-block deloads to test', dl.deloads.length>=2,
  dl.deloads.map(d=>'wk'+d.w).join(','));
dl.deloads.filter(d=>d.w>1 && d.w<dl.all.length).forEach(d=>{
  const prev = dl.all[d.w-2];
  check(`Deload week ${d.w}: fewer brick rounds than week ${prev.w}`,
    d.rounds <= prev.rounds, `${prev.rounds} → ${d.rounds}`);
  // NOT comparable across weeks: week 3 is 25 m of sled pull, week 4 is 30 wall-ball
  // reps. Different stations, different units, different race doses. The meaningful
  // comparison holds the week AND the station fixed and asks what the deload flag
  // itself changed — see the same-station check below.
  check(`Deload week ${d.w}: long run is shorter`,
    d.longKm <= prev.longKm, `${prev.longKm} km → ${d.longKm} km`);
  check(`Deload week ${d.w}: threshold reps do not ramp up`,
    (parseInt(d.tempo)||0) <= (parseInt(prev.tempo)||0),
    `${prev.tempo} → ${d.tempo}`);
});
// Same week, same station, deload flag on vs off — the only variable is the deload.
const dlSame = await page.evaluate(()=>{
  const pr=buildHyroxBlock({division:'pro_men', weeks:12, sessionsPerWeek:5});
  saveProgramData(pr);
  const T=(pr.weeklyProgressions||[]).length;
  const out=[];
  pr.weeklyProgressions.forEach((wp,i)=>{
    if(!wp.deload || i+1>=T) return;
    const w=i+1;
    const withDeload=progressHyroxBrick(w,T);
    wp.deload=false;                              // same week, flag off
    const without=progressHyroxBrick(w,T);
    wp.deload=true;
    out.push({ w, station:withDeload.station, sameStation:withDeload.station===without.station,
               rounds:[without.rounds, withDeload.rounds],
               dose:[parseFloat((without.dose.match(/([\d.]+)/)||[])[1]||0),
                     parseFloat((withDeload.dose.match(/([\d.]+)/)||[])[1]||0)] });
  });
  return out;
});
dlSame.forEach(d=>{
  check(`Week ${d.w} (${d.station}): the deload flag itself cuts the rounds`,
    d.rounds[1] < d.rounds[0], `${d.rounds[0]} → ${d.rounds[1]}`);
  check(`Week ${d.w} (${d.station}): ...and the station dose`,
    d.dose[1] < d.dose[0], `${d.dose[0]} → ${d.dose[1]}`);
});

check('A deload brick says it is a deload', dl.deloads.every(d=>/deload/i.test(d.note)),
  dl.deloads[0] && dl.deloads[0].note);
check('A deload never falls back to the Build phase dose',
  dl.deloads.every(d=>d.rounds < Math.max(...dl.all.filter(x=>!x.deload).map(x=>x.rounds))),
  dl.deloads.map(d=>`wk${d.w}:${d.rounds}`).join(' '));

// ── HYROX built AROUND fixed Fitstop class days ────────────────────────────
// An athlete who trains at a gym does not move their classes to suit a plan.
const fs = await page.evaluate(()=>{
  coachProfile={goal:'HYROX Pro sub-70', raceDate:'2026-12-04'};
  localStorage.setItem('ht-race-date','2026-12-04');
  const mk=(fitstopDays,spw)=>{
    const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:spw,
      trainDays:['Mon','Tue','Wed','Thu','Fri','Sat'], fitstopDays});
    saveProgramData(pr);
    const wk=(_progWeekSessions(1)||[]).filter(s=>s.session);
    return { days:wk.map(s=>s.day), names:wk.map(s=>s.session.name),
             byDay:Object.fromEntries(wk.map(s=>[s.day,s.session.name])),
             ids:(pr.sessions||[]).map(s=>s.id) };
  };
  return { none:mk([],5), mwf:mk(['Mon','Wed','Fri'],6), tt:mk(['Tue','Thu'],5) };
});
// These asserted that all three class days were kept. The plan now uses one or two
// and gives the rest to race work — the classes stay available, just not by default.
check('The plan uses at most two of the three class days',
  ['Mon','Wed','Fri'].filter(d=>fs.mwf.byDay[d]==='Fitstop').length<=2, JSON.stringify(fs.mwf.byDay));
check('...and the released class days carry race work',
  ['Mon','Wed','Fri'].some(d=>fs.mwf.byDay[d]!=='Fitstop'), JSON.stringify(fs.mwf.byDay));
check('The compromised run survives — Fitstop cannot give him that',
  fs.mwf.names.includes('Compromised Run'), fs.mwf.names.join(', '));
check('Race-standard station work survives too',
  fs.mwf.names.includes('Station Work'), fs.mwf.names.join(', '));
check('The generic strength session is dropped — Fitstop LIFT is the strength work',
  !fs.mwf.ids.includes('hx-strength'), fs.mwf.ids.join(','));
check('The brick is placed somewhere in the week',
  Object.values(fs.mwf.byDay).includes('Compromised Run'), JSON.stringify(fs.mwf.byDay));
check('A different class pattern produces a different week',
  JSON.stringify(fs.mwf.byDay)!==JSON.stringify(fs.tt.byDay), JSON.stringify(fs.tt.byDay));
check('With no Fitstop days the block is unchanged',
  !fs.none.names.includes('Fitstop') && fs.none.names.includes('Compromised Run'),
  fs.none.names.join(', '));

// ── Six class days: OFFERED, not seized ────────────────────────────────────
// Locking all six left one free day and therefore one HYROX session a week, with
// the app silently choosing which single gap to fill and saying nothing about the
// two it dropped. Class days are now a two-way choice defaulting to the class.
const six = await page.evaluate(()=>{
  coachProfile={goal:'HYROX Pro sub-70', raceDate:'2026-12-04'};
  localStorage.setItem('ht-race-date','2026-12-04');
  const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:7,
    trainDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    fitstopDays:['Mon','Tue','Wed','Thu','Fri','Sat']});
  saveProgramData(pr);
  const slots=w=>(_progWeekSessions(w)||[]).filter(s=>s.session);
  const before=slots(1);
  pickDayOption('Mon','hx-long',1);
  const after=slots(1);
  return {
    coverage:pr.coverage,
    defaults:Object.fromEntries(before.map(s=>[s.day,s.session.name])),
    optionDays:before.filter(s=>s.isOption).map(s=>({day:s.day,
      alts:s.options.filter(o=>o.id!==s.id).map(o=>o.id)})),
    afterTrade:Object.fromEntries(after.map(s=>[s.day,s.session.name])),
    week2:Object.fromEntries(slots(2).map(s=>[s.day,s.session.name])),
  };
});
// This used to assert all six class days were kept. Attending six classes and
// calling it a race build is the gym's week with a run bolted on — the plan now
// uses one or two class days by default and gives the rest to the race.
check('The plan uses only 1-2 class days by default',
  Object.values(six.defaults).filter(v=>v==='Fitstop').length<=2,
  JSON.stringify(six.defaults));
check('...and keeps the LIFT days, which is what classes cover best',
  six.defaults['Tue']==='Fitstop' && six.defaults['Fri']==='Fitstop',
  JSON.stringify(six.defaults));
check('...giving the rest of the week to race work',
  Object.values(six.defaults).filter(v=>v!=='Fitstop').length>=4,
  JSON.stringify(six.defaults));
check('No session is prescribed twice in a week',
  (()=>{ const n=Object.values(six.defaults).filter(v=>v!=='Fitstop');
         return new Set(n).size===n.length; })(), JSON.stringify(six.defaults));
check('The free day still carries a HYROX session',
  six.defaults['Sun']==='Compromised Run', six.defaults['Sun']);
check('Class days OFFER the session that fills a gap', six.optionDays.length>=3,
  JSON.stringify(six.optionDays));
// The direction reversed: race work is now the DEFAULT on a released class day and
// the class is the alternative, rather than the other way round.
check('A released class day defaults to race work, with the class offered',
  six.optionDays.every(o=>o.alts[0]==='fitstop'),
  JSON.stringify(six.optionDays.map(o=>o.alts[0])));
check('Every offered alternative exists as a session in the block',
  six.optionDays.every(o=>o.alts.length>0));
check('Every released class day still offers the class',
  six.optionDays.every(o=>o.alts.includes('fitstop')||o.alts.length>0),
  JSON.stringify(six.optionDays));
check('A stated intent overrides the default', await page.evaluate(()=>{
  coachProfile={goal:'HYROX sub-70, Fitstop 4x a week', raceDate:'2026-12-04'};
  const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:7,
    goal:'HYROX sub-70, Fitstop 4x a week',
    trainDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    fitstopDays:['Mon','Tue','Wed','Thu','Fri','Sat']});
  return pr.coverage.used.length===4 && /you asked for 4/.test(pr.coverage.note||''); }));
check('"keep all my classes" is honoured too', await page.evaluate(()=>{
  const g='HYROX sub-70 but keep all my Fitstop classes';
  coachProfile={goal:g, raceDate:'2026-12-04'};
  const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:7, goal:g,
    trainDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    fitstopDays:['Mon','Tue','Wed','Thu','Fri','Sat']});
  return pr.coverage.used.length===6; }));
check('A goal that never mentions classes does NOT trigger an intent',
  await page.evaluate(()=>_fitstopIntent('HYROX Anaheim Pro Men sub-70')===null));
check('It explains which class days it used and why',
  /class day/i.test(six.coverage.note||'') && /LIFT/i.test(six.coverage.note||''),
  six.coverage.note);
check('...and that the others are still available',
  /still there to tap/i.test(six.coverage.note||''), six.coverage.note);
check('No warning is needed once the week has real race work',
  six.coverage.warning===null, String(six.coverage.warning));
check('Released days are recorded with their class type',
  six.coverage.released.length>=4 && six.coverage.offered.every(o=>o.dayType),
  JSON.stringify(six.coverage.released));

// ── A second race on the calendar ──────────────────────────────────────────
// ATHX Los Angeles, 7 November, landed in the same week as the full HYROX
// simulation — a 2.5-hour competition on the Saturday and a full race rehearsal
// on the Sunday. Two race efforts back to back is not a training week.
const bRace = await page.evaluate(()=>{
  coachProfile={goal:'HYROX Pro sub-70', raceDate:'2026-12-04'};
  localStorage.setItem('ht-race-date','2026-12-04');
  setSecondaryRace('2026-11-07','ATHX Long Beach');
  const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:7, goal:'HYROX Pro sub-70',
    trainDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    fitstopDays:['Mon','Tue','Wed','Thu','Fri','Sat']});
  saveProgramData(pr);
  const w=pr.secondaryRace.week;
  const names=n=>(_progWeekSessions(n)||[]).filter(s=>s.session).map(s=>s.session.name);
  setSecondaryRace(null);
  return { info:pr.secondaryRace, sims:pr.hyrox.simulationWeeks,
           week:names(w), weekFlags:pr.weeklyProgressions[w-1],
           after:names(w+1), sessionIds:(pr.sessions||[]).map(s=>s.id) };
});
check('The B-race is placed in the right week', bRace.info.week===9 && bRace.info.day==='Sat',
  `week ${bRace.info.week} ${bRace.info.day}`);
check('It appears as a session, named', bRace.week.some(n=>/ATHX/i.test(n)), bRace.week.join(', '));
check('No race simulation shares its week', bRace.sims.full!==bRace.info.week && bRace.sims.half!==bRace.info.week,
  JSON.stringify(bRace.sims));
check('...and the simulation moved rather than vanished',
  bRace.sims.full>0 && bRace.sims.half>0 && bRace.sims.full!==bRace.sims.half, JSON.stringify(bRace.sims));
check('No compromised run is stacked on B-race week',
  !bRace.week.some(n=>/Compromised/i.test(n)), bRace.week.join(', '));
check('One short sharpener is kept', bRace.week.some(n=>/Easy Run/i.test(n)), bRace.week.join(', '));
check('Kept class days survive B-race week',
  bRace.week.filter(n=>n==='Fitstop').length>=1, bRace.week.join(', '));
check('The week is flagged as a race week, not a normal one',
  bRace.weekFlags.secondaryRace===true && bRace.weekFlags.deload===true,
  JSON.stringify(bRace.weekFlags));
check('Normal programming resumes the week after',
  bRace.after.some(n=>/Simulation|Compromised|Station/i.test(n)), bRace.after.join(', '));

// ── ATHX movement gaps, read from the spec rather than asserted ────────────
const athx = await page.evaluate(()=>({
  zones:(ATHX_KB.zones||[]).map(z=>z.id),
  scored:(ATHX_KB.zones||[]).filter(z=>z.scored).length,
  verified:ATHX_KB.verified, sources:(ATHX_KB.SOURCES||[]).length,
  unknown:(ATHX_KB.unknown||[]).length,
  gaps:(ATHX_KB.vsHyrox.gaps||[]).map(g=>g.key),
  covered:(ATHX_KB.vsHyrox.covered||[]).length,
  date:ATHX_KB.event.date, venue:ATHX_KB.event.venue,
}));
check('The ATHX event spec is loaded', athx.zones.length===6 && athx.scored===3, JSON.stringify(athx.zones));
check('...with the right date and venue',
  athx.date==='2026-11-07' && /Long Beach/.test(athx.venue), `${athx.date} ${athx.venue}`);
check('...provenance marked secondary, not official', athx.verified==='secondary', athx.verified);
check('...sources attributed', athx.sources>=5, String(athx.sources));
check('...and what is NOT known is recorded rather than filled in', athx.unknown>=3, String(athx.unknown));
check('It names the movements HYROX training does not cover',
  ['boxJumpOver','saGroundToOverhead','heavySandbagCarry'].every(k=>athx.gaps.includes(k)),
  athx.gaps.join(','));
check('...and what HYROX already covers, so nothing is added twice', athx.covered>=3, String(athx.covered));
check('Maximal strength is credited to the LIFT classes, not listed as a gap',
  await page.evaluate(()=>{
    coachProfile={goal:'HYROX Pro sub-70', raceDate:'2026-12-04'};
    localStorage.setItem('ht-race-date','2026-12-04');
    setSecondaryRace('2026-11-07','ATHX Long Beach');
    const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:7, goal:'HYROX Pro sub-70',
      trainDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      fitstopDays:['Mon','Tue','Wed','Thu','Fri','Sat']});
    setSecondaryRace(null);
    const ms=pr.secondaryRace.gaps.find(g=>g.key==='maxStrength');
    return !!(ms && ms.coveredBy && /LIFT/.test(ms.coveredBy)) && pr.secondaryRace.uncovered.length===3; }));
check('A B-race too close to the A-race is not honoured', await page.evaluate(()=>{
  localStorage.setItem('ht-race-date','2026-12-04');
  setSecondaryRace('2026-11-30','Too close');
  const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:5});
  setSecondaryRace(null);
  return !pr.secondaryRace; }));
check('No B-race set leaves the block unchanged', await page.evaluate(()=>{
  setSecondaryRace(null);
  const pr=buildHyroxBlock({division:'pro_men', sessionsPerWeek:5});
  return !pr.secondaryRace; }));
check('The B-race survives a backup', await page.evaluate(()=>BACKUP_KEYS.includes('ht-race-b')));

// ── Does the block add up to the goal? ─────────────────────────────────────
// Every session can be dosed correctly and the WEEK still total a quarter of what
// the goal needs. This one did: ~21 km/week against a sourced 50-65 km/week for a
// sub-70 athlete. Nothing was checking the sum.
const vol = await page.evaluate(()=>{
  const mk=(goal,fs)=>{
    coachProfile={goal, raceDate:'2026-12-04'};
    localStorage.setItem('ht-race-date','2026-12-04'); localStorage.setItem('ht-goal',goal);
    saveProgramData(buildHyroxBlock({division:'pro_men', sessionsPerWeek:7, goal,
      trainDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], fitstopDays:fs}));
    return hyroxVolumeCheck();
  };
  return { sub70:mk('HYROX Pro sub-70',['Mon','Tue','Wed','Thu','Fri','Sat']),
           sub70free:mk('HYROX Pro sub-70',[]),
           sub60:mk('HYROX sub-60 elite',[]),
           finish:mk('HYROX finish strong',[]),
           target:(()=>{ const t=runningDomain('hyrox_long').weeklyKmTarget; return t; })() };
});
check('The block reports its own weekly running volume',
  vol.sub70 && vol.sub70.peakKm>0, JSON.stringify(vol.sub70&&vol.sub70.peakKm));
check('The target comes from the KB, by goal time',
  vol.sub70.band==='sub-70 to sub-75' && vol.sub70.target[0]===50 && vol.sub70.target[1]===65,
  `${vol.sub70.band} ${JSON.stringify(vol.sub70.target)}`);
check('An elite goal gets the elite band',
  vol.sub60.target[0]===65, `${vol.sub60.band} ${JSON.stringify(vol.sub60.target)}`);
check('A finishing goal gets the floor band',
  vol.finish.target[0]===30, `${vol.finish.band} ${JSON.stringify(vol.finish.target)}`);
check('It DETECTS that the block falls short of a sub-70 goal',
  vol.sub70.short===true, `peak ${vol.sub70.peakKm} vs ${vol.sub70.target.join('-')}`);
check('...and says so in plain numbers rather than implying it',
  /peaks at \d+ km/.test(vol.sub70.message) && /50-65 km/.test(vol.sub70.message),
  vol.sub70.message);
check('Freeing every class day still does not reach the target',
  vol.sub70free.short===true, `${vol.sub70free.peakKm} km with no classes`);
check('...so the advice does NOT claim more days will fix it',
  /will not close this/i.test(vol.sub70free.fix||''), vol.sub70free.fix);
check('The intensity split is carried through from the KB',
  /70% easy/.test(vol.sub70.split||''), vol.sub70.split);
check('Build weeks only — deloads and taper are excluded by design',
  vol.sub70.buildWeeks>0 && vol.sub70.buildWeeks<13, String(vol.sub70.buildWeeks));

// ── The long-run dosing is sourced, and says what is NOT ───────────────────
const src = await page.evaluate(()=>{
  const d=runningDomain('hyrox_long');
  return { cap:d.rx.capKm, sources:d.rx.SOURCES, inferred:d.rx.inferred,
           target:d.weeklyKmTarget };
});
check('HYROX long runs are capped at 16 km, not the marathon 32', src.cap===16, String(src.cap));
check('Each source states the claim it supports',
  Array.isArray(src.sources) && src.sources.every(x=>x.claim && x.where),
  JSON.stringify((src.sources||[])[0]||''));
check('The 14-16 km peak long run is attributed', 
  src.sources.some(x=>/14-16 km/.test(x.claim)), '');
check('The weekly volume figures are attributed',
  src.sources.some(x=>/50-65 km/.test(x.claim)), '');
check('What is INFERRED rather than sourced is labelled as such',
  Array.isArray(src.inferred) && src.inferred.length>=2, JSON.stringify(src.inferred));
check('The volume target carries a floor and goal bands',
  src.target.floor && src.target.byGoal.length===3, JSON.stringify(src.target.byGoal.map(g=>g.goal)));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
