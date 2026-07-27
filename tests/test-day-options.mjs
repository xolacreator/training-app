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

check('Day-options API exists', await page.evaluate(()=>['_resolveDaySlot','setDayOptions','pickDayOption','clearDayOptions','_sessionForType'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

const seed=()=>page.evaluate(()=>{
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:8,sessionsPerWeek:4,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'int',type:'endurance',name:'Intervals',runType:'intervals'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,null,'int',null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recoveryLog.length=0; recomputeAthleteState();
});
await seed();

// ── Backward compatibility: plain string days still resolve ─────────────────
check('Plain (string) day entries still resolve', await page.evaluate(()=>{ const s=_progWeekSessions(1).find(x=>x.day==='Mon'); return s.id==='easy'&&s.session.name==='Easy Run'&&!s.isOption; }));

// ── Make Thursday a choice with a readiness rule ────────────────────────────
const made=await page.evaluate(()=>setDayOptions('Thu',['int','easy'],{type:'readiness',threshold:60,high:'int',low:'easy'},{silent:true}));
check('setDayOptions turns a day into an A/B choice', made===true);
const shape=await page.evaluate(()=>{ const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Thu');
  return { isOption:s.isOption, n:(s.options||[]).length, names:(s.options||[]).map(o=>o.session&&o.session.name) }; });
check('Option day exposes both choices', shape.isOption===true && shape.n===2 && shape.names[0]==='Intervals' && shape.names[1]==='Easy Run', JSON.stringify(shape));

// ── The conditional rule picks by readiness ─────────────────────────────────
const high=await page.evaluate(()=>{ recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:78});
  const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Thu'); return {id:s.id,via:s.via}; });
check('Readiness ABOVE cutoff → hard option (intervals)', high.id==='int' && high.via==='rule-high', JSON.stringify(high));
const low=await page.evaluate(()=>{ recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:42});
  const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Thu'); return {id:s.id,via:s.via}; });
check('Readiness BELOW cutoff → easier option (easy run)', low.id==='easy' && low.via==='rule-low', JSON.stringify(low));
const none=await page.evaluate(()=>{ recoveryLog.length=0; const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Thu'); return {id:s.id,via:s.via}; });
check('No readiness data → falls back to the first option', none.id==='int' && none.via==='default', JSON.stringify(none));

// ── An explicit athlete pick overrides the rule, for that week only ─────────
const picked=await page.evaluate(()=>{ const wk=_progActualWeek();
  recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:78});   // rule would say 'int'
  pickDayOption('Thu','easy',wk,{silent:true});
  const cur=_progWeekSessions(wk).find(x=>x.day==='Thu');
  const other=_progWeekSessions(wk+1).find(x=>x.day==='Thu');
  return { cur:cur.id, via:cur.via, otherWeek:other.id }; });
check('Athlete pick wins over the rule', picked.cur==='easy' && picked.via==='athlete', JSON.stringify(picked));
check('The pick applies to that week only', picked.otherWeek==='int', JSON.stringify(picked));

// ── Collapse back to a single session ───────────────────────────────────────
const cleared=await page.evaluate(()=>{ clearDayOptions('Thu','int',{silent:true});
  const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Thu'); return { id:s.id, isOption:!!s.isOption }; });
check('clearDayOptions collapses to one session', cleared.id==='int' && cleared.isOption===false, JSON.stringify(cleared));

// ── Coach verb: set_options validates + applies ─────────────────────────────
const verb=await page.evaluate(()=>{ const wk=_progActualWeek();
  return { ok:_validatePlanAction({action:'set_options',day:'Tue',types:['intervals','easy'],rule:{type:'readiness',threshold:65},why:'depends how I pull up'},wk),
           oneType:_validatePlanAction({action:'set_options',day:'Tue',types:['intervals']},wk),
           badType:_validatePlanAction({action:'set_options',day:'Tue',types:['yoga','pilates']},wk),
           badDay:_validatePlanAction({action:'set_options',day:'Someday',types:['easy','tempo']},wk) }; });
check('set_options accepted with two valid types + rule', verb.ok && verb.ok.types.length===2 && verb.ok.rule.threshold===65, JSON.stringify(verb.ok));
check('set_options rejects <2 types, bad types, bad day', verb.oneType===null && verb.badType===null && verb.badDay===null);
const applied=await page.evaluate(()=>{ const wk=_progActualWeek();
  _coachPlanProposal={week:wk,summary:'t',actions:[_validatePlanAction({action:'set_options',day:'Tue',types:['intervals','easy'],rule:{type:'readiness',threshold:65}},wk)]};
  const n=applyCoachPlanProposal();
  const s=_progWeekSessions(wk).find(x=>x.day==='Tue');
  return { n, isOption:!!s.isOption, opts:(s.options||[]).length }; });
check('Coach can create a choice day end-to-end', applied.n===1 && applied.isOption && applied.opts===2, JSON.stringify(applied));
check('Action description reads naturally', await page.evaluate(()=>_describePlanAction({action:'set_options',day:'Thu',types:['intervals','easy'],rule:{threshold:60}})), 'desc');

// ── Editor renders choice days ──────────────────────────────────────────────
const ui=await page.evaluate(()=>{ nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(_progActualWeek()); togglePlanEdit();
  const h=document.getElementById('plan-days').innerHTML; togglePlanEdit();
  return { choice:/Choice day/.test(h), pick:/pickDayOption/.test(h), single:/clearDayOptions/.test(h), rule:/Auto-picks by readiness/.test(h) }; });
check('Plan editor renders choice days with pick + collapse', ui.choice && ui.pick && ui.single && ui.rule, JSON.stringify(ui));

// ── Existing plan ops still work on option days ─────────────────────────────
const moved=await page.evaluate(()=>{ moveProgramSession('Tue','Wed',{silent:true});
  const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Wed'); return { isOption:!!s.isOption, tue:_progWeekSessions(_progActualWeek()).find(x=>x.day==='Tue').id }; });
check('Moving a choice day preserves its options', moved.isOption===true && moved.tue===null, JSON.stringify(moved));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
