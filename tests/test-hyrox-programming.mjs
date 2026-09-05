
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
  return { spec, prompt:(()=>{ try{ return _designSystemPrompt(); }catch(e){ return ''; } })() };
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
  /do NOT author the sessions/i.test(eng.prompt) && /engine.{0,4}:.{0,4}hyrox/i.test(eng.prompt));
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

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
