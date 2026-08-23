
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

const PROG='```program\n{"name":"HYROX Build","type":"hybrid","weeks":14,"sessionsPerWeek":4,'+
  '"goal":"HYROX sub-70 Sydney","raceDate":"2027-03-14","why":"x",'+
  '"sessions":[{"id":"easy","type":"endurance","name":"Easy Run","runType":"easy"}],'+
  '"dayMap":["easy",null,null,null,null,null,null]}\n```';

check('API exists', await page.evaluate(()=>
  ['_extractIntake','_intakeSoFar','_intakeMissing'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── A block proposed with NO interview is refused ─────────────────────────
const early=await page.evaluate((PROG)=>{
  coachMessages.length=0;
  const ex=_extractProgramSpec(PROG);
  return { spec:ex.spec, missing:_intakeMissing() };
}, PROG);
check('Proposing before the interview is blocked', early.spec && early.spec.blocked===true, JSON.stringify(early.spec&&Object.keys(early.spec)));
check('...and it says what is missing', early.spec.missing.length===3, JSON.stringify(early.spec.missing));
check('Goal is required', early.spec.missing.some(m=>/training for/.test(m)));
check('Timeline is required', early.spec.missing.some(m=>/when it is/.test(m)));
check('History is required', early.spec.missing.some(m=>/done this before/.test(m)), JSON.stringify(early.spec.missing));

// ── Partial intake is still refused ───────────────────────────────────────
const partial=await page.evaluate((PROG)=>{
  coachMessages.length=0;
  const ik=_extractIntake('Got it.\n```intake\n{"goal":"HYROX sub-70 in Sydney"}\n```');
  coachMessages.push({role:'assistant',text:ik.clean,intake:ik.intake});
  const ex=_extractProgramSpec(PROG);
  return { intake:_intakeSoFar(), spec:ex.spec };
}, PROG);
check('An intake block is captured from the reply', partial.intake.goal==='HYROX sub-70 in Sydney', JSON.stringify(partial.intake));
check('Goal alone is still not enough to propose', partial.spec.blocked===true && partial.spec.missing.length===2,
  JSON.stringify(partial.spec.missing));

// ── Complete intake unlocks the proposal ──────────────────────────────────
const complete=await page.evaluate((PROG)=>{
  coachMessages.length=0;
  const ik=_extractIntake('```intake\n{"goal":"HYROX sub-70 in Sydney","timeline":"14 March, entered and paid",'+
    '"history":"Did one last year in 78 min, blew up on the sled push","constraints":"Sore left achilles"}\n```');
  coachMessages.push({role:'assistant',text:ik.clean,intake:ik.intake});
  const ex=_extractProgramSpec(PROG);
  return { missing:_intakeMissing(), spec:ex.spec };
}, PROG);
check('A complete intake leaves nothing missing', complete.missing.length===0, JSON.stringify(complete.missing));
check('...and the block is now accepted', complete.spec && !complete.spec.blocked && complete.spec.name==='HYROX Build',
  JSON.stringify(complete.spec&&complete.spec.name));
check('The spec carries the goal it was designed for', complete.spec.goal==='HYROX sub-70 Sydney', complete.spec.goal);

// ── Intake accumulates across several replies ─────────────────────────────
check('Intake merges across the conversation', await page.evaluate(()=>{
  coachMessages.length=0;
  [['{"goal":"HYROX sub-70 in Sydney"}'],['{"timeline":"14 March, entered"}'],
   ['{"history":"Did one last year, blew up on the sled"}']].forEach(([j])=>{
    const ik=_extractIntake('x\n```intake\n'+j+'\n```');
    coachMessages.push({role:'assistant',text:ik.clean,intake:ik.intake});
  });
  return _intakeMissing().length===0; }));

// ── THE COMMIT BUG: creating the block must write the goal ────────────────
const commit=await page.evaluate((PROG)=>{
  // Start from a STALE goal, as after a previous block.
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:'2026-10-10'};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  localStorage.setItem('ht-goal','sub-3:30 marathon');
  localStorage.setItem('ht-goal-category','race');
  localStorage.setItem('ht-goal-race-type','marathon');
  localStorage.setItem('ht-race-date','2026-10-10');
  trainGoal='sub-3:30 marathon';
  savedProgram=null; localStorage.removeItem('ht-program');
  coachMessages.length=0;
  const ik=_extractIntake('```intake\n{"goal":"HYROX sub-70 in Sydney","timeline":"14 March, entered and paid",'+
    '"history":"78 min last year, blew up on the sled"}\n```');
  coachMessages.push({role:'assistant',text:ik.clean,intake:ik.intake});
  const ex=_extractProgramSpec(PROG);
  coachMessages.push({role:'assistant',text:ex.clean,programSpec:ex.spec});
  const before={profile:coachProfile.goal, engine:_asGoal().text, rt:_asGoal().raceType};
  coachCreateProgram(1);
  return { before, afterProfile:coachProfile.goal, afterEngine:_asGoal().text,
           afterRt:_asGoal().raceType, afterRace:localStorage.getItem('ht-race-date'),
           created:!!savedProgram && savedProgram.name };
}, PROG);
check('Before: both stores held the stale goal', commit.before.profile==='sub-3:30 marathon' && commit.before.rt==='marathon',
  JSON.stringify(commit.before));
check('Creating the block commits the new goal to the profile', commit.afterProfile==='HYROX sub-70 Sydney', commit.afterProfile);
check('...and to the ENGINE store', commit.afterEngine==='HYROX sub-70 Sydney', commit.afterEngine);
check('...including the race type the engine branches on', commit.afterRt==='hyrox', commit.afterRt);
check('...and the race date', commit.afterRace==='2027-03-14', String(commit.afterRace));
check('The block itself is created', commit.created==='HYROX Build', String(commit.created));
check('No stale goal-mismatch is left behind', await page.evaluate(()=>_liveGoalMismatch()===null));

// ── The athlete is told what is still needed, not silently ignored ────────
check('A blocked proposal is shown as what is still to cover', await page.evaluate((PROG)=>{
  coachMessages.length=0;
  const ex=_extractProgramSpec(PROG);
  coachMessages.push({role:'user',text:'just build it'});
  coachMessages.push({role:'assistant',text:ex.clean, intakeBlocked:ex.spec.missing});
  renderCoachMessages();
  const h=document.getElementById('coach-messages').innerHTML;
  return /Not enough to build on yet/.test(h) && /Still to cover/.test(h); }, PROG));
check('...and no create button is offered', await page.evaluate(()=>
  !/coachCreateProgram\(/.test(document.getElementById('coach-messages').innerHTML)));

// ── The coach is told the gate exists ─────────────────────────────────────
check('The prompt states the refusal is enforced', await page.evaluate(()=>{
  coachMode='design'; const p=buildCoachSystemPrompt();
  return /REFUSES to accept a program/.test(p) && /This is not advisory/.test(p); }));
check('The prompt asks for the intake block', await page.evaluate(()=>
  /```intake/.test(buildCoachSystemPrompt())));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
