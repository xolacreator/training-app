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

check('Scope + rotation API exists', await page.evaluate(()=>['_editTarget','_ensureWeekOverride','setPlanScope','setDayRotation','openAlternatePicker'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// Program started 2 weeks ago → current week 3, with weeks 4+ pending.
const seed=()=>page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:9,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'int',type:'endurance',name:'Intervals',runType:'intervals'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  _planScope='forward'; recoveryLog.length=0; recomputeAthleteState();
  return _progActualWeek();
});
const cur=await seed();
check('Current week is 3 (weeks 4+ are pending)', cur===3, 'cur='+cur);
const dayOf=(wk,day)=>page.evaluate(([w,d])=>{ const s=_progWeekSessions(w).find(x=>x.day===d); return s&&s.id||null; },[wk,day]);

// ── THE BUG: a 'once' edit must NOT touch pending weeks ─────────────────────
await page.evaluate(()=>moveProgramSession('Wed','Thu',{scope:'once',silent:true}));
check("'This week only' move applies to the current week", await dayOf(cur,'Thu')==='tempo' && await dayOf(cur,'Wed')===null);
check("PENDING week 4 is untouched by a 'once' move", await dayOf(cur+1,'Wed')==='tempo' && await dayOf(cur+1,'Thu')===null, 'wk4 Wed='+await dayOf(cur+1,'Wed'));
check("Later pending week 6 also untouched", await dayOf(cur+2,'Wed')==='tempo');
check("PAST week 1 untouched", await dayOf(1,'Wed')==='tempo');

// ── 'forward' still changes the template for pending weeks ──────────────────
await seed();
await page.evaluate(()=>moveProgramSession('Wed','Thu',{scope:'forward',silent:true}));
check("'All future weeks' move updates the current week", await dayOf(cur,'Thu')==='tempo');
check("'All future weeks' move ALSO updates pending weeks", await dayOf(cur+1,'Thu')==='tempo' && await dayOf(cur+2,'Thu')==='tempo');
check("'forward' still protects history (week 1 unchanged)", await dayOf(1,'Wed')==='tempo' && await dayOf(1,'Thu')===null);

// ── 'once' add + remove are also single-occurrence ──────────────────────────
await seed();
await page.evaluate(()=>{ addSessionToProgram({type:'endurance',name:'Extra',runType:'easy'},'Tue',{scope:'once',silent:true});
                          removeProgramSessionFromDay('Sat',{scope:'once',silent:true}); });
check("'once' add affects only this week", (await dayOf(cur,'Tue'))!==null && await dayOf(cur+1,'Tue')===null);
check("'once' remove affects only this week", await dayOf(cur,'Sat')===null && await dayOf(cur+1,'Sat')==='long');

// ── Editor scope toggle drives the default ──────────────────────────────────
await seed();
const sc=await page.evaluate(()=>{ setPlanScope('once'); const a=_planScope;
  moveProgramSession('Wed','Fri',{silent:true});            // no explicit scope → uses toggle
  return { a, wkCur:_progWeekSessions(_progActualWeek()).find(x=>x.day==='Fri').id,
           wkNext:_progWeekSessions(_progActualWeek()+1).find(x=>x.day==='Fri').id }; });
check('Editor scope toggle is honoured when no scope is passed', sc.a==='once' && sc.wkCur==='tempo' && sc.wkNext===null, JSON.stringify(sc));

// ── Week rotation: alternating sessions ─────────────────────────────────────
await seed();
// Rotation applies from the CURRENT week forward; already-elapsed weeks stay frozen.
const rot=await page.evaluate(()=>{ setDayRotation('Wed',['int','tempo'],{silent:true});
  const w=_progActualWeek();
  const at=k=>{ const s=_progWeekSessions(k).find(x=>x.day==='Wed'); return {id:s.id,isRot:!!s.isRotation,len:s.cycleLen}; };
  return { cur:w, c0:at(w), c1:at(w+1), c2:at(w+2), c3:at(w+3), past:at(1) }; });
check('Rotation alternates week to week (Intervals / Tempo)', rot.c0.id!==rot.c1.id && rot.c0.id===rot.c2.id && rot.c1.id===rot.c3.id, JSON.stringify({[rot.cur]:rot.c0.id,[rot.cur+1]:rot.c1.id,[rot.cur+2]:rot.c2.id,[rot.cur+3]:rot.c3.id}));
check('Rotation is flagged with its cycle length', rot.c0.isRot===true && rot.c0.len===2);
check('Rotation does NOT rewrite frozen history', rot.past.isRot===false && rot.past.id==='tempo', JSON.stringify(rot.past));
const restRot=await page.evaluate(()=>{ setDayRotation('Fri',['long',null],{silent:true});
  const w=_progActualWeek();
  const at=k=>{ const s=_progWeekSessions(k).find(x=>x.day==='Fri'); return s.id; };
  return { c0:at(w), c1:at(w+1), c2:at(w+2) }; });
check('A rotation slot can be a REST week (LIFT one week, nothing the next)', restRot.c0==='long' && restRot.c1===null && restRot.c2==='long', JSON.stringify(restRot));
check('Stop alternating collapses to one session', await page.evaluate(()=>{ clearDayOptions('Wed','tempo',{silent:true});
  const s=_progWeekSessions(_progActualWeek()).find(x=>x.day==='Wed'); return s.id==='tempo' && !s.isRotation; }));

// ── UI surfaces both ────────────────────────────────────────────────────────
const ui=await page.evaluate(()=>{ setDayRotation('Wed',['int','tempo'],{silent:true});
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(_progActualWeek()); togglePlanEdit();
  const h=document.getElementById('plan-days').innerHTML; togglePlanEdit();
  return { scope:/This week only/.test(h)&&/All future weeks/.test(h), alt:/Alternating · 2-week cycle/.test(h), btn:/openAlternatePicker/.test(h) }; });
check('Editor shows the scope toggle + alternating day + Alternate action', ui.scope && ui.alt && ui.btn, JSON.stringify(ui));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
