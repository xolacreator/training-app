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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Sync API exists', await page.evaluate(()=>['_classifyGoal','_syncGoalToEngine','_liveGoalMismatch','adoptCurrentGoal']
  .every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── The classifier maps free text onto the engine's own vocabulary ───────────
const cls=await page.evaluate(()=>({
  hyrox:_classifyGoal('HYROX sub-70 Sydney'),
  mara:_classifyGoal('sub-3:30 marathon'),
  half:_classifyGoal('sub-90 half marathon'),
  tri:_classifyGoal('Ironman 70.3'),
  fivek:_classifyGoal('sub-20 5k'),
  str:_classifyGoal('strength-squat-140kg'),
  fit:_classifyGoal('general fitness'),
  junk:_classifyGoal('something vague'),
  empty:_classifyGoal(''),
}));
check('HYROX / marathon / half classify to the right race type',
  cls.hyrox.raceType==='hyrox' && cls.mara.raceType==='marathon' && cls.half.raceType==='half', JSON.stringify(cls));
check('"half marathon" is not misread as a marathon', cls.half.raceType==='half');
check('Triathlon and 5K/10K classify', cls.tri.raceType==='triathlon' && cls.fivek.raceType==='5k10k');
check('Strength and fitness classify without a race type',
  cls.str.category==='strength' && cls.str.raceType==='' && cls.fit.category==='fitness');
check('Unrecognised text does NOT invent a race type', cls.junk.category==='custom' && cls.junk.raceType==='', JSON.stringify(cls.junk));
check('Empty goal classifies to nothing', cls.empty===null);

// ── Changing the goal now moves the ENGINE store, not just the chat ──────────
const sync=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  // Signed up for a marathon: engine store written by onboarding.
  localStorage.setItem('ht-goal','sub-3:30 marathon');
  localStorage.setItem('ht-goal-category','race');
  localStorage.setItem('ht-goal-race-type','marathon');
  trainGoal='sub-3:30 marathon';
  coachProfile={name:'EV',style:'balanced',background:'b',focus:'f',detail:'d',
                goal:'sub-3:30 marathon',raceDate:'2027-10-10'};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  saveProgramData({id:'p1',name:'Marathon Block',type:'endurance',startDate:_mondayISO(d),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:8},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  const before={engineGoal:_asGoal().text, cat:_asGoal().category, rt:_asGoal().raceType};
  // Switch to HYROX through the real wizard save.
  openCoachSetup();
  coachSetupAnswers.goal='HYROX sub-70 Sydney';
  for(let i=0;i<COACH_SETUP_STEPS.length+2;i++){
    const st=COACH_SETUP_STEPS[coachSetupStep];
    if(st && st.type==='text'){ const el=document.getElementById('coach-text-input');
      if(el) el.value=coachSetupAnswers[st.id]||'x'; }
    const last=coachSetupStep===COACH_SETUP_STEPS.length-1;
    coachSetupNext(); if(last) break;
  }
  return { before, after:{engineGoal:_asGoal().text, cat:_asGoal().category, rt:_asGoal().raceType},
           trainGoal, identity:(()=>{try{return CoachEV.athlete.state().identity.goal.text;}catch(e){return 'ERR:'+e.message;}})() };
});
check('Before: the engine was prescribing for the onboarding goal', sync.before.rt==='marathon', JSON.stringify(sync.before));
check('Changing the goal now updates the ENGINE store too', sync.after.engineGoal==='HYROX sub-70 Sydney', JSON.stringify(sync.after));
check('...including the category and race type the engine branches on', sync.after.cat==='race' && sync.after.rt==='hyrox', JSON.stringify(sync.after));
check('The in-memory trainGoal follows as well', sync.trainGoal==='HYROX sub-70 Sydney');
check('The engine state (CoachEV.athlete.state) reports the new goal', sync.identity==='HYROX sub-70 Sydney', String(sync.identity));

// ── Accounts that ALREADY diverged get told, with a one-tap fix ──────────────
const legacy=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  localStorage.setItem('ht-goal','sub-3:30 marathon');
  localStorage.setItem('ht-goal-category','race');
  localStorage.setItem('ht-goal-race-type','marathon');
  trainGoal='sub-3:30 marathon';
  // Profile already says HYROX, engine never heard about it, no recorded transition.
  coachProfile={name:'EV',goal:'HYROX sub-70 Sydney',raceDate:''};
  saveProgramData({id:'p2',name:'Old Block',type:'endurance',startDate:_mondayISO(d),weeks:12,sessionsPerWeek:6,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:12},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(_progActualWeek());
  return { mismatch:_liveGoalMismatch(), html:document.getElementById('goal-drift-prompt').innerHTML };
});
check('A pre-existing mismatch is detected with no recorded transition', !!legacy.mismatch, JSON.stringify(legacy.mismatch));
check('The Plan screen says the plan is following an old goal', /following an old goal/i.test(legacy.html), legacy.html.slice(0,80));
check('It names BOTH goals so the mismatch is obvious', /HYROX sub-70 Sydney/.test(legacy.html) && /sub-3:30 marathon/.test(legacy.html));
check('It offers a one-tap fix', /adoptCurrentGoal\(\)/.test(legacy.html));

const adopt=await page.evaluate(()=>{ adoptCurrentGoal();
  renderPlan(_progActualWeek());
  return { engine:_asGoal(), stillMismatched:!!_liveGoalMismatch(),
           html:document.getElementById('goal-drift-prompt').innerHTML }; });
check('Adopting the current goal moves the engine onto it', adopt.engine.text==='HYROX sub-70 Sydney' && adopt.engine.raceType==='hyrox', JSON.stringify(adopt.engine));
check('The mismatch warning clears once adopted', adopt.stillMismatched===false);
check('...and it hands off to the block decision instead of going silent', /goal changed/i.test(adopt.html), adopt.html.slice(0,70));

// ── Guards ──────────────────────────────────────────────────────────────────
check('A reworded goal of the same shape is not flagged', await page.evaluate(()=>{
  localStorage.setItem('ht-goal','marathon sub 3:30'); trainGoal='marathon sub 3:30';
  coachProfile={name:'EV',goal:'sub-3:30 marathon'};
  return _liveGoalMismatch()===null; }));
check('No profile goal → no mismatch claimed', await page.evaluate(()=>{
  coachProfile={name:'EV'}; return _liveGoalMismatch()===null; }));
check('Empty goal never overwrites the engine store', await page.evaluate(()=>{
  localStorage.setItem('ht-goal','keepme'); trainGoal='keepme';
  _syncGoalToEngine(''); return localStorage.getItem('ht-goal')==='keepme'; }));
check('Switching off strength clears stale lift targets', await page.evaluate(()=>{
  localStorage.setItem('ht-goal-strength-lift','squat');
  localStorage.setItem('ht-goal-strength-target','140kg');
  _syncGoalToEngine('HYROX sub-70');
  return !localStorage.getItem('ht-goal-strength-lift') && !localStorage.getItem('ht-goal-strength-target'); }));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
