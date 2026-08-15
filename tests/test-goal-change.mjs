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

check('Goal-change API exists', await page.evaluate(()=>['coachIntro','_noteGoalChange','renderGoalDriftPrompt','dismissGoalDrift','rebuildForNewGoal']
  .every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── The crash: saving the profile called an undefined coachIntro() ───────────
check('coachIntro() is defined and returns a string (was a ReferenceError)',
  await page.evaluate(()=>{ coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:'2027-10-10'};
    const s=coachIntro(); return typeof s==='string' && s.length>10 && /EV/.test(s); }));
check('The greeting names the CURRENT goal, not a hardcoded one',
  await page.evaluate(()=>{ coachProfile={name:'EV',goal:'HYROX sub-70',raceDate:''};
    const s=coachIntro(); return /HYROX sub-70/.test(s) && !/June 20, 2026/.test(s); }));
check('No goal set → still greets without crashing',
  await page.evaluate(()=>{ coachProfile={name:'EV'}; const s=coachIntro(); return typeof s==='string' && s.length>10; }));

// Seed a marathon block, then change the goal through the REAL save path.
const seed=(newGoal,newRace)=>page.evaluate(({newGoal,newRace})=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  coachProfile={name:'EV',style:'balanced',background:'b',focus:'f',detail:'d',
                goal:'sub-3:30 marathon',raceDate:'2027-10-10'};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  delete window.__saveThrew;
  saveProgramData({id:'p1',name:'Marathon Block',type:'endurance',startDate:_mondayISO(d),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,null,null,null,'long',null],
    weeklyProgressions:Array.from({length:8},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  // Walk the wizard exactly as the UI does, satisfying each step's guard.
  openCoachSetup();
  if(newGoal!==null) coachSetupAnswers.goal=newGoal;
  if(newRace!==null) coachSetupAnswers.raceDate=newRace;
  let threw=null;
  try{
    for(let i=0;i<COACH_SETUP_STEPS.length+2;i++){
      const st=COACH_SETUP_STEPS[coachSetupStep];
      if(st && st.type==='text'){ const el=document.getElementById('coach-text-input');
        if(el) el.value=coachSetupAnswers[st.id]||'x'; }
      const last = coachSetupStep===COACH_SETUP_STEPS.length-1;
      coachSetupNext();
      if(last) break;
    }
  }catch(e){ threw=String(e); }
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(_progActualWeek());
  return { threw, savedGoal:coachProfile.goal,
           overlayOpen:!!document.getElementById('coach-setup-overlay')?.classList.contains('open'),
           drift:savedProgram.goalDrift||null,
           prompt:document.getElementById('goal-drift-prompt').innerHTML };
}, {newGoal,newRace});

const g=await seed('HYROX sub-70 Sydney','2027-03-14');
check('Saving the profile no longer throws', g.threw===null, String(g.threw));
check('The new goal is actually saved', g.savedGoal==='HYROX sub-70 Sydney', g.savedGoal);
check('The setup overlay closes on save (it used to hang open)', g.overlayOpen===false);
check('The goal change is recorded against the program', !!g.drift && g.drift.from==='sub-3:30 marathon' && g.drift.to==='HYROX sub-70 Sydney', JSON.stringify(g.drift));

// ── The plan no longer stays silently glued to the dead goal ─────────────────
check('Plan screen says the block was built for the OLD goal', /built for/.test(g.prompt) && /sub-3:30 marathon/.test(g.prompt), g.prompt.slice(0,80));
check('...and names the NEW goal', /HYROX sub-70 Sydney/.test(g.prompt));
check('It offers to build a new block', /rebuildForNewGoal\(\)/.test(g.prompt));
check('It is explicit that nothing was changed behind your back', /Nothing has been changed for you/.test(g.prompt));

// ── The block itself is NOT silently rewritten ──────────────────────────────
check('The existing block is left intact until the athlete chooses',
  await page.evaluate(()=>savedProgram.type==='endurance' && savedProgram.name==='Marathon Block' && savedProgram.weeks===8));

// ── Dismissing sticks ───────────────────────────────────────────────────────
check('"Keep this block" clears the prompt for good', await page.evaluate(()=>{ dismissGoalDrift();
  renderPlan(_progActualWeek());
  return document.getElementById('goal-drift-prompt').innerHTML.trim()==='' && !savedProgram.goalDrift; }));

// ── Race-date-only change is described as a date change, not a goal change ──
const r=await seed(null,'2028-01-15');
check('Changing only the race date is reported as a date change', /race date moved/i.test(r.prompt) && /2028-01-15/.test(r.prompt), r.prompt.slice(0,90));
check('A usable new date offers re-anchoring', /reanchorProgramToRace\(\)/.test(r.prompt));

// ── No change → no prompt ───────────────────────────────────────────────────
const same=await seed('sub-3:30 marathon','2027-10-10');
check('Re-saving an unchanged profile shows nothing (no nagging)', same.prompt.trim()==='' && !same.drift, JSON.stringify(same.prompt.slice(0,40)));

// ── No program → nothing to realign, and no crash ───────────────────────────
check('Changing goal with no active program is harmless', await page.evaluate(()=>{
  localStorage.removeItem('ht-program'); savedProgram=null;
  coachProfile={name:'EV',goal:'a',raceDate:''};
  let ok=true; try{ _noteGoalChange('b',''); }catch(e){ ok=false; }
  return ok; }));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
