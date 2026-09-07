
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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(350);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('API exists', await page.evaluate(()=>
  ['deleteProgram','clearGoal'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── START DATE ─────────────────────────────────────────────────────────────
const ui=await page.evaluate(()=>{ try{ renderProgramBuilder(); }catch(e){}
  const el=document.getElementById('program-overlay-body'); return el?el.innerHTML:''; });
check('The builder has a date picker again', /id="bld-start"/.test(ui) && /type="date"/.test(ui));
check('It explains Week 1 lands on a Monday', /Week 1 begins on this Monday/.test(ui));
check('It shows which Monday and how far off', /Week 1 Monday:/.test(ui) && /(starts this week|starts in|started)/.test(ui),
  (ui.match(/Week 1 Monday:[^<]*/)||[''])[0]);

check('A chosen future start date is honoured', await page.evaluate(()=>{
  const f=new Date(); f.setDate(f.getDate()+28);
  programBuilderConfig.startDate=_mondayISO(f);
  const data={name:'X',type:'endurance',weeks:6,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null]};
  _normalizeProgram(data, programBuilderConfig);
  return data.startDate===_mondayISO(f); }));
check('A past start date is honoured (block already underway)', await page.evaluate(()=>{
  const p=new Date(); p.setDate(p.getDate()-21);
  programBuilderConfig.startDate=_mondayISO(p);
  const data={name:'X',type:'endurance',weeks:6,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null]};
  _normalizeProgram(data, programBuilderConfig);
  saveProgramData(data);
  return data.startDate===_mondayISO(p) && _progActualWeek()>=3; }));
check('No chosen date still defaults to this Monday', await page.evaluate(()=>{
  programBuilderConfig.startDate='';
  const data={name:'X',type:'endurance',weeks:4,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null]};
  _normalizeProgram(data, programBuilderConfig);
  return data.startDate===_mondayISO(new Date()); }));
check('A conversationally proposed block can name its own start date', await page.evaluate(()=>{
  const f=new Date(); f.setDate(f.getDate()+14);
  // Not testing the intake gate here — that has its own suite.
  const sp=_validateProgramSpec({name:'B',type:'endurance',weeks:8,sessionsPerWeek:2,
    startDate:f.toISOString().slice(0,10),
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null]}, {skipIntakeGate:true});
  return sp && sp.startDate===_mondayISO(f); }));
check('A malformed start date is ignored, not crashed on', await page.evaluate(()=>{
  const sp=_validateProgramSpec({name:'B',type:'endurance',weeks:8,sessionsPerWeek:2,
    startDate:'next tuesday-ish',
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null]}, {skipIntakeGate:true});
  return sp && sp.startDate===''; }));

// ── DELETION LEAVES NO RESIDUE ─────────────────────────────────────────────
const residue=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-21);
  saveProgramData({id:'old',name:'Old Block',type:'endurance',startDate:_mondayISO(d),weeks:12,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    goalDrift:{from:'a',to:'b',goalChanged:true},
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1}))});
  // Accumulate everything a lived-in block leaves behind.
  currentProgramWeek=4;
  localStorage.setItem('ht-program-week','4');
  localStorage.setItem('ht-anchor-dismissed','old');
  localStorage.setItem('ht-autoreg-dismiss','old');
  localStorage.setItem('ht-resched-dismissed','old');
  localStorage.setItem('ht-decision-log','[{"x":1}]');
  localStorage.setItem('ht-pending-review','[{"y":1}]');
  _coachPlanProposal={week:4,actions:[]};
  recomputeAthleteState();
  deleteProgram({silent:true});
  const left=['ht-program','ht-program-week','ht-anchor-dismissed','ht-autoreg-dismiss',
              'ht-resched-dismissed','ht-decision-log','ht-pending-review']
    .filter(k=>localStorage.getItem(k)!=null);
  return { left, savedProgram:savedProgram, week:currentProgramWeek,
           proposal:_coachPlanProposal, cached:AthleteState!==null };
});
check('Every program-scoped key is cleared', residue.left.length===0, JSON.stringify(residue.left));
check('The program itself is gone', residue.savedProgram===null);
check('The week pointer resets (next block does not open on week 4)', residue.week===1, String(residue.week));
check('A pending coach proposal against the dead block is dropped', residue.proposal===null);

// A new block must not inherit the old one's state.
const fresh=await page.evaluate(()=>{
  saveProgramData({id:'new',name:'New Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:6,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:7},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  return { week:_progActualWeek(), drift:savedProgram.goalDrift||null,
           anchorDismissed:localStorage.getItem('ht-anchor-dismissed') }; });
check('A new block starts at week 1', fresh.week===1, String(fresh.week));
check('It carries no drift record from the deleted block', fresh.drift===null);
check('Old dismissals do not suppress the new block\'s prompts', fresh.anchorDismissed===null);

// ── GOAL DELETION CLEARS BOTH STORES ───────────────────────────────────────
const goal=await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:'2027-10-10'};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  localStorage.setItem('ht-goal','sub-3:30 marathon');
  localStorage.setItem('ht-goal-category','race');
  localStorage.setItem('ht-goal-race-type','marathon');
  localStorage.setItem('ht-race-date','2027-10-10');
  trainGoal='sub-3:30 marathon';
  clearGoal({silent:true});
  return { engine:_asGoal(), trainGoal, profileGoal:(coachProfile||{}).goal||null,
           race:localStorage.getItem('ht-race-date'),
           mismatch:_liveGoalMismatch(),
           stored:JSON.parse(localStorage.getItem('ht-coach')||'{}').goal||null };
});
check('The engine goal store is cleared', !goal.engine.text && !goal.engine.category, JSON.stringify(goal.engine));
check('The in-memory goal is cleared', goal.trainGoal==='');
check('The coach profile goal is cleared', goal.profileGoal===null && goal.stored===null);
check('The race date goes with it', goal.race===null);
check('No phantom goal mismatch is left behind', goal.mismatch===null, JSON.stringify(goal.mismatch));

// ── The two are independent ────────────────────────────────────────────────
check('Deleting a block keeps the goal', await page.evaluate(()=>{
  localStorage.setItem('ht-goal','half marathon'); trainGoal='half marathon';
  coachProfile={name:'EV',goal:'half marathon'};
  saveProgramData({id:'z',name:'Z',type:'endurance',startDate:_mondayISO(new Date()),weeks:4,sessionsPerWeek:1,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:5},(_,i)=>({week:i+1}))});
  deleteProgram({silent:true});
  return _asGoal().text==='half marathon' && savedProgram===null; }));
check('Clearing the goal keeps the block', await page.evaluate(()=>{
  saveProgramData({id:'z2',name:'Z2',type:'endurance',startDate:_mondayISO(new Date()),weeks:4,sessionsPerWeek:1,
    sessions:[{id:'easy',type:'endurance',name:'E',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:5},(_,i)=>({week:i+1}))});
  clearGoal({silent:true});
  return !!savedProgram && savedProgram.name==='Z2'; }));
check('Deleting a block does not touch logged sessions', await page.evaluate(()=>{
  sessions.length=0;
  sessions.push({gid:'keep',week:'1',day:'Mon',session:'Run',dist:'10',ts:Date.now()});
  deleteProgram({silent:true});
  return sessions.length===1 && sessions[0].gid==='keep'; }));

// ── Building a new plan when one already exists ────────────────────────────
// A saved block used to HIDE the builder: the only route to a new plan was Delete
// Program — destroying what you have before knowing what replaces it. A block that
// no longer fits is the commonest reason to build, so it must be the easy path.
const rebuild = await page.evaluate(()=>{
  localStorage.setItem('ht-goal','HYROX Pro sub-70');
  coachProfile={goal:'HYROX Pro sub-70', raceDate:'2026-12-04'};
  localStorage.setItem('ht-race-date','2026-12-04');
  sessions=[{gid:'keep',week:'1',day:'Mon',session:'Easy Run',dist:'8',ts:Date.now()}]; saveData();
  saveProgramData(buildHyroxBlock({division:'pro_men',sessionsPerWeek:5}));
  const oldId=savedProgram.id, oldName=savedProgram.name;
  openProgramOverlay();
  const txt=()=>document.getElementById('program-overlay-body').innerText;
  const savedView=txt();
  startNewPlan();
  const builderView=txt();
  const during={ blockStillSaved:!!savedProgram, sameBlock:savedProgram && savedProgram.id===oldId,
                 sessions:(sessions||[]).length };
  cancelNewPlan();
  const backView=txt();
  return { oldName, savedView, builderView, backView, during,
           afterCancel:{ blockStillSaved:!!savedProgram, sameBlock:savedProgram&&savedProgram.id===oldId } };
});
check('A saved block offers "Build a new plan"',
  /Build a new plan/i.test(rebuild.savedView), rebuild.savedView.slice(0,60).replace(/\n/g,' / '));
check('...without having to delete anything first',
  /Build a new plan/i.test(rebuild.savedView) && /Delete Program/i.test(rebuild.savedView));
check('Tapping it opens the builder', /Build a new block/i.test(rebuild.builderView),
  rebuild.builderView.slice(0,50).replace(/\n/g,' / '));
check('The builder names the block being replaced',
  /replacing/i.test(rebuild.builderView) && rebuild.builderView.includes(rebuild.oldName.replace(/—/g,'-')),
  rebuild.builderView.slice(0,140).replace(/\n/g,' / '));
check('...and says the current block stays until the new one is made',
  /stays exactly as it is until you create/i.test(rebuild.builderView));
check('...and that logged sessions are kept either way',
  /never touches your history/i.test(rebuild.builderView));
check('The existing block is NOT destroyed while building',
  rebuild.during.blockStillSaved && rebuild.during.sameBlock, JSON.stringify(rebuild.during));
check('...and neither are logged sessions', rebuild.during.sessions===1, String(rebuild.during.sessions));
check('There is a way back to the current plan',
  /Keep my current plan/i.test(rebuild.builderView));
check('...and taking it restores the saved view untouched',
  /HYROX Block/i.test(rebuild.backView) && rebuild.afterCancel.sameBlock,
  JSON.stringify(rebuild.afterCancel));
check('Creating a new block ends build mode', await page.evaluate(()=>{
  startNewPlan();
  const wasBuilding=/Build a new block/i.test(document.getElementById('program-overlay-body').innerText);
  coachMessages=[{role:'assistant', text:'x', intake:{goal:'HYROX Pro sub-70',
    timeline:'12 weeks', history:'Raced before'}}];
  const sp=_validateProgramSpec({engine:'auto', name:'Replacement', weeks:10, sessionsPerWeek:5,
    goal:'HYROX Pro sub-70', trainDays:['Mon','Tue','Wed','Fri','Sat']});
  coachMessages[0].programSpec=sp;
  coachCreateProgram(0);
  renderProgramBody();
  const after=document.getElementById('program-overlay-body').innerText;
  return wasBuilding && !/Build a new block/i.test(after) && !!savedProgram; }));
check('Deleting a program also leaves build mode clean', await page.evaluate(()=>{
  startNewPlan(); deleteProgram({silent:true}); renderProgramBody();
  const t=document.getElementById('program-overlay-body').innerText;
  return !/Replacing/i.test(t) && !savedProgram; }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
