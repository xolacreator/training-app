import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── The module + globals exist
check('AthleteState global + recompute/accessor exist', await page.evaluate(()=>
  typeof recomputeAthleteState==='function' && typeof athleteState==='function' && typeof makeDecisionRecord==='function' && typeof ATHLETE_STATE_VERSION==='number'));

// ── Init builds a versioned snapshot
const s0=await page.evaluate(()=>athleteState());
check('Snapshot is versioned (v=1) with asOf date', s0 && s0.v===1 && /^\d{4}-\d{2}-\d{2}$/.test(s0.asOf), JSON.stringify({v:s0&&s0.v,asOf:s0&&s0.asOf}));
check('Snapshot has all top-level sections', s0 && ['identity','fitness','adaptations','topAdaptation','fatigue','readiness','program','availability','equipment','events','sessionCount','trends'].every(k=>k in s0), s0&&Object.keys(s0).join(','));

// ── Goal adapter reflects onboarding keys
await page.evaluate(()=>{ localStorage.setItem('ht-goal','Sub-3 marathon'); localStorage.setItem('ht-goal-category','race'); localStorage.setItem('ht-goal-race-type','marathon'); trainGoal='Sub-3 marathon'; recomputeAthleteState(); });
const gs=await page.evaluate(()=>athleteState().identity.goal);
check('Goal adapter reads ht-goal + category + raceType', gs.text==='Sub-3 marathon' && gs.category==='race' && gs.raceType==='marathon', JSON.stringify(gs));

// ── Baselines flow through fitness
await page.evaluate(()=>{ baselines=baselines||{}; baselines.squat_1rm_est=140; baselines['run-cooper']=3200; recomputeAthleteState(); });
const fit=await page.evaluate(()=>athleteState().fitness.baselines);
check('Fitness mirrors baselines (squat 1RM + cooper)', fit.squat_1rm_est===140 && fit['run-cooper']===3200, JSON.stringify(fit));

// ── Sessions drive fatigue (acute load) + sessionCount, and recompute on save
const fat=await page.evaluate(()=>{
  sessions.length=0;
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  for(let i=0;i<4;i++) sessions.push({session:'Tempo',intensity:'hard',dur:'50',dist:'10',date:iso(i),ts:Date.now()-i*86400000,gid:'f'+i});
  saveData(); // should trigger recompute
  return athleteState();
});
check('saveData() refreshes snapshot (sessionCount=4)', fat.sessionCount===4, fat.sessionCount);
check('Fatigue acute load is positive from recent hard sessions', fat.fatigue.acute>0 && typeof fat.fatigue.acwr==='number', JSON.stringify(fat.fatigue));

// ── Program context populated after saveProgramData (recompute trigger)
const prog=await page.evaluate(()=>{
  saveProgramData({ id:'p9', name:'Threshold Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:8, sessionsPerWeek:4,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'}], dayMap:['tempo',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1})) });
  return athleteState().program;
});
check('Program context id/name/type present after save', prog && prog.id==='p9' && prog.name==='Threshold Block' && prog.type==='endurance', JSON.stringify(prog));
check('Program week=1 (start of block) + phase resolved', prog && prog.week===1 && !!prog.phase, JSON.stringify({week:prog&&prog.week,phase:prog&&prog.phase}));
check('Program totalWeeks=8', prog && prog.totalWeeks===8, prog&&prog.totalWeeks);

// ── Adaptations: endurance required-set surfaces + a top adaptation is chosen
const adapt=await page.evaluate(()=>athleteState());
check('Adaptations array populated for endurance program', Array.isArray(adapt.adaptations) && adapt.adaptations.length>=4 && adapt.adaptations.every(a=>a.id&&a.status), adapt.adaptations.map(a=>a.id).join(','));
check('topAdaptation chosen (highest value) with a status', adapt.topAdaptation && adapt.topAdaptation.id && adapt.topAdaptation.status, JSON.stringify(adapt.topAdaptation));

// ── Readiness flows from today's recovery entry
const rdy=await page.evaluate(()=>{
  recoveryLog.push({date:todayISO(), sleepScore:72});
  saveRecovery(); // recompute trigger
  return athleteState().readiness;
});
check('Readiness reflects today recovery (72)', rdy===72, rdy);

// ── DecisionRecord factory shape (Phase 4 will populate)
const dr=await page.evaluate(()=>makeDecisionRecord({objective:'lactate_threshold', reason:'test'}));
check('makeDecisionRecord returns versioned record w/ id + fields', dr && dr.v===1 && !!dr.id && dr.objective==='lactate_threshold' && Array.isArray(dr.alternatives) && Array.isArray(dr.constraints), JSON.stringify({v:dr.v,id:!!dr.id,obj:dr.objective}));
check('DECISION_LOG exists and is empty (Phase 0)', await page.evaluate(()=>Array.isArray(DECISION_LOG) && DECISION_LOG.length===0));

// ── Next race event mirrors the PLAN calendar shape (label + daysTo, or null)
const ev=await page.evaluate(()=>athleteState().events.nextRace);
check('events.nextRace is null or a {label,daysTo} shape', ev===null || (typeof ev.label==='string' && typeof ev.daysTo==='number'), JSON.stringify(ev));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
