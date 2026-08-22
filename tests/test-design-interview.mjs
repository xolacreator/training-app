
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

// An athlete mid-way through an OLD block, with an OLD goal and OLD race.
const setup=()=>page.evaluate(()=>{
  const old=new Date(); old.setDate(old.getDate()+40);
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:old.toISOString().slice(0,10)};
  localStorage.setItem('ht-race-date', old.toISOString().slice(0,10));
  const d=new Date(); d.setDate(d.getDate()-21);
  saveProgramData({id:'old',name:'Marathon Base',type:'endurance',startDate:_mondayISO(d),weeks:12,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1}))});
  sessions.length=0;
  for(let i=0;i<6;i++) sessions.push({gid:'g'+i,session:'Easy Run',intensity:'Easy',dist:'10',pace:'5:20',
    ts:Date.now()-(2+i*4)*86400000});
  programBuilderConfig.trainDays=['Mon','Wed','Sat'];
  recomputeAthleteState();
  coachMode='design';
  return { prompt:buildCoachSystemPrompt(), opener:_designOpener(), known:_designKnownFacts() };
});
const s1=await setup();

// ── THE BUG: it must not assert the old goal/race as settled fact ──────────
check('The old race is NOT in the do-not-ask list', !s1.known.some(k=>/race/i.test(k)), JSON.stringify(s1.known));
check('The old block is NOT in the do-not-ask list', !s1.known.some(k=>/block/i.test(k)), JSON.stringify(s1.known));
check('Prior goal is framed as a question, not a fact', /treat as questions, not facts/.test(s1.prompt));
check('It is told the previous goal may no longer be current', /may no longer be current — ask, do not assume/.test(s1.prompt));
check('It is told to confirm the race date rather than use it', /Confirm whether that is still the target/.test(s1.prompt));
check('It is told to ask what happened with the existing block', /Ask what happened with it and whether this replaces it/.test(s1.prompt));
check('It is explicitly barred from carrying a goal over', /Never assume a goal or date carried over/.test(s1.prompt));

// ── Behavioural facts ARE still asserted (don't waste the athlete's time) ──
check('Logged volume is still stated as known', /recent training volume/i.test(s1.prompt), JSON.stringify(s1.known));
check('Training days are still stated as known', /which days you train/i.test(s1.prompt));
check('Those facts are labelled as log-derived', /WHAT THEIR LOG SHOWS/.test(s1.prompt));
check('The old race is NOT stated as a current fact', !/Size the block to land on race week/.test(s1.prompt));

// ── The interview has a real arc, goal first ──────────────────────────────
check('It is framed as an intake interview', /intake interview/.test(s1.prompt) && /Do not rush to a plan/.test(s1.prompt));
check('Step 1 is the goal', /1\. THE GOAL/.test(s1.prompt));
check('...and it must push past a one-word answer', /"a marathon" is not a goal/.test(s1.prompt));
check('Step 2 is the timeline', /2\. THE TIMELINE/.test(s1.prompt) && /locked in \(entered, paid\) or aspirational/.test(s1.prompt));
check('Step 3 is history with this goal', /3\. THE HISTORY WITH IT/.test(s1.prompt) && /What went wrong last time/.test(s1.prompt));
check('Constraints come after intent, not before', s1.prompt.indexOf('THE GOAL') < s1.prompt.indexOf('THE CONSTRAINTS'));
check('It must reflect back before proposing', /REFLECT IT BACK/.test(s1.prompt));
check('It may not propose before goal and timeline are answered',
  /do not propose a block until steps 1-3 are genuinely answered/.test(s1.prompt));
check('Depth is encouraged, not discouraged', /six to ten exchanges, not three/.test(s1.prompt) && !/do not interrogate/.test(s1.prompt));

// ── The opener asks rather than assumes ───────────────────────────────────
check('The opener asks whether the old goal still stands',
  /Is that still the target, or has something changed\?/.test(s1.opener), s1.opener.slice(-90));
check('The opener does not assert the old race timing', !/weeks out/.test(s1.opener), s1.opener);
check('The opener says what it already knows from the log', /I can see .* from your log/.test(s1.opener));

// ── A brand-new athlete just gets asked ───────────────────────────────────
const fresh=await page.evaluate(()=>{
  coachProfile={name:'EV'}; localStorage.removeItem('ht-race-date');
  savedProgram=null; localStorage.removeItem('ht-program');
  sessions.length=0; recomputeAthleteState();
  coachMode='design';
  return { opener:_designOpener(), prompt:buildCoachSystemPrompt() };
});
check('With no history, the opener simply asks the goal', /what are you training for\?/i.test(fresh.opener), fresh.opener);
check('...and there is no stale-context section', !/FROM BEFORE/.test(fresh.prompt));

// ── The form builder still gets the full context (unchanged behaviour) ────
check('The form generator still receives goal + race as context', await page.evaluate(()=>{
  const race=new Date(); race.setDate(race.getDate()+70);
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:race.toISOString().slice(0,10)};
  localStorage.setItem('ht-race-date',race.toISOString().slice(0,10));
  recomputeAthleteState();
  const full=_builderAthleteContext();
  const design=_builderAthleteContext({behaviouralOnly:true});
  return /RACE:/.test(full) && !/RACE:/.test(design); }));

// ── Day-to-day coaching is untouched ──────────────────────────────────────
check('Normal coaching mode is unaffected', await page.evaluate(()=>{
  coachMode='ask'; const p=buildCoachSystemPrompt();
  return !/intake interview/.test(p) && !/THE TIMELINE/.test(p); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
