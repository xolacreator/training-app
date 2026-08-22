
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-fitness-dismissed');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(350);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('API exists', await page.evaluate(()=>
  ['fitnessModel','proposeFitnessUpdate','applyFitnessUpdate','renderFitnessProposal']
    .every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// Athlete assessed at 4:22 threshold in week 1, now running tempos at 4:09.
const seed=(tempoPace,n,ageDaysStart)=>page.evaluate(({tempoPace,n,ageDaysStart})=>{
  baselines={'run-cooper':{run_threshold_pace:'4:22',run_zone2_lo_pace:'5:20',run_zone2_hi_pace:'4:55',run_vo2max_pace:'3:50'}};
  sessions.length=0;
  for(let i=0;i<n;i++){
    const ts=Date.now()-(ageDaysStart+i*7)*86400000;
    sessions.push({gid:'t'+i,week:'1',day:'Wed',session:'Tempo Run',intensity:'Moderate',
                   dist:'8',pace:tempoPace,ts,date:new Date(ts).toISOString().slice(0,10)});
  }
  for(let i=0;i<5;i++){
    const ts=Date.now()-(3+i*6)*86400000;
    sessions.push({gid:'e'+i,week:'1',day:'Mon',session:'Easy Run',intensity:'Easy',
                   dist:'10',pace:'5:18',ts,date:new Date(ts).toISOString().slice(0,10)});
  }
  recomputeAthleteState();
  return { model:fitnessModel(), proposal:proposeFitnessUpdate() };
}, {tempoPace,n,ageDaysStart});

const s1=await seed('4:09',5,2);
check('Threshold is estimated from actual sessions', s1.model.running.threshold.pace==='4:09', s1.model.running.threshold.pace);
check('...with a sample count', s1.model.running.threshold.n===5, String(s1.model.running.threshold.n));
check('...and a confidence', s1.model.running.threshold.confidence==='ok', s1.model.running.threshold.confidence);
check('Easy pace is estimated separately', s1.model.running.easy.pace==='5:18', s1.model.running.easy.pace);
check('The week-1 assessment is retained as the current baseline', s1.model.baseline.threshold===262, String(s1.model.baseline.threshold));

// ── It PROPOSES; it does not act ───────────────────────────────────────────
check('A real improvement is proposed', !!s1.proposal && s1.proposal.changes.some(c=>c.key==='threshold'), JSON.stringify(s1.proposal&&s1.proposal.changes.map(c=>c.key)));
const th=s1.proposal.changes.find(c=>c.key==='threshold');
check('The proposal names both paces', th.from==='4:22' && th.to==='4:09', JSON.stringify({f:th.from,t:th.to}));
check('...quantifies the change', th.deltaSec===13, String(th.deltaSec));
check('...and states the evidence', /last 5 threshold sessions/.test(th.why), th.why);
check('Prescriptions are UNCHANGED until accepted', await page.evaluate(()=>
  _runPaces().threshold==='4:22/km'), await page.evaluate(()=>_runPaces().threshold));

// ── Accepting moves the numbers ────────────────────────────────────────────
check('Accepting updates the paces that drive prescription', await page.evaluate(()=>{
  applyFitnessUpdate();
  return _runPaces().threshold==='4:09/km'; }), await page.evaluate(()=>_runPaces().threshold));
check('...and it then stops proposing the same change', await page.evaluate(()=>{
  const p=proposeFitnessUpdate();
  return !p || !p.changes.some(c=>c.key==='threshold'); }));
check('The update is marked as measured, not assessed', await page.evaluate(()=>
  baselines['run-cooper'].updatedFrom==='measured sessions'));

// ── Noise must not move anything ───────────────────────────────────────────
const small=await seed('4:19',5,2);      // 3 s/km — inside the noise band
check('A 3s/km difference is not proposed', !small.proposal || !small.proposal.changes.some(c=>c.key==='threshold'),
  JSON.stringify(small.proposal&&small.proposal.changes.map(c=>c.key)));

// ── Thin or inconsistent evidence makes no claim ───────────────────────────
const thin=await page.evaluate(()=>{
  baselines={'run-cooper':{run_threshold_pace:'4:22'}};
  sessions.length=0;
  sessions.push({gid:'a',session:'Tempo Run',intensity:'Moderate',dist:'8',pace:'4:05',ts:Date.now()-2*86400000});
  recomputeAthleteState();
  return { m:fitnessModel().running.threshold, p:proposeFitnessUpdate() };
});
check('One session gives low confidence', thin.m.confidence==='low' && thin.m.n===1, JSON.stringify({c:thin.m.confidence,n:thin.m.n}));
check('...and is NOT proposed as a change', !thin.p || !thin.p.changes.some(c=>c.key==='threshold'));

check('No sessions at all → no estimate, no claim', await page.evaluate(()=>{
  sessions.length=0; recomputeAthleteState();
  const m=fitnessModel().running.threshold;
  return m.value===null && m.confidence==='none' && proposeFitnessUpdate()===null; }));

// ── Stale sessions are ignored ─────────────────────────────────────────────
const stale=await seed('4:09',5,120);    // all >6 weeks old
check('Sessions outside the 6-week window are ignored', stale.model.running.threshold.n===0, String(stale.model.running.threshold.n));

// ── Short runs are too noisy to read ───────────────────────────────────────
check('Runs under 3 km are excluded', await page.evaluate(()=>{
  sessions.length=0;
  for(let i=0;i<5;i++) sessions.push({gid:'s'+i,session:'Tempo Run',intensity:'Moderate',dist:'1.5',pace:'4:00',ts:Date.now()-i*86400000});
  return fitnessModel().running.threshold.n===0; }));

// ── Strength is honestly reported as unsupported ───────────────────────────
check('Strength states it cannot be modelled yet', await page.evaluate(()=>{
  const s=fitnessModel().strength;
  return s.supported===false && /sets, reps or load/.test(s.why); }));

// ── The proposal appears on the Plan screen, and can be dismissed ──────────
const ui=await page.evaluate(()=>{
  baselines={'run-cooper':{run_threshold_pace:'4:22',run_zone2_lo_pace:'5:20',run_zone2_hi_pace:'4:55'}};
  sessions.length=0;
  for(let i=0;i<5;i++) sessions.push({gid:'t'+i,session:'Tempo Run',intensity:'Moderate',dist:'8',pace:'4:09',ts:Date.now()-(2+i*7)*86400000});
  localStorage.removeItem('ht-fitness-dismissed');
  recomputeAthleteState();
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1);
  return document.getElementById('fitness-proposal').innerHTML;
});
check('The Plan screen surfaces it', /Your training says you've changed/.test(ui), ui.slice(0,60));
check('It shows the evidence, not just a number', /threshold sessions average/.test(ui));
check('It promises nothing changes without consent', /Nothing changes until you say so/.test(ui));
check('It offers both accept and defer', /acceptFitnessUpdate\(\)/.test(ui) && /dismissFitnessUpdate\(\)/.test(ui));
check('Dismissing it stops the nagging', await page.evaluate(()=>{
  dismissFitnessUpdate(); renderPlan(1);
  return document.getElementById('fitness-proposal').innerHTML.trim()===''; }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
