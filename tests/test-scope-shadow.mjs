// Regression: 'Every week from now on' must not be shadowed by an existing per-week
// override, and Add must ask the same scope question as Move/Skip.
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

const seed=()=>page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:9,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  _planScope='forward'; recomputeAthleteState(); return _progActualWeek();
});
const cur=await seed();
const dayOf=(wk,day)=>page.evaluate(([w,d])=>{ const s=_progWeekSessions(w).find(x=>x.day===d); return s&&s.id||null; },[wk,day]);

// ── THE REPORTED BUG ───────────────────────────────────────────────────────
// Make a one-off change first (creates an override for the current week), then a
// 'forward' change. The forward change must show up in the CURRENT week too.
await page.evaluate((w)=>{ moveProgramSession('Mon','Tue',{scope:'once',silent:true}); }, cur);
check('Setup: a one-off edit created a current-week override', await page.evaluate((w)=>!!(savedProgram.overrides&&savedProgram.overrides[w]), cur));
await page.evaluate(()=>addSessionToProgram({type:'endurance',name:'Extra',runType:'easy'},'Thu',{scope:'forward',silent:true}));
check('BUG FIX: a "from now on" add appears in the CURRENT week', await dayOf(cur,'Thu')!==null, 'cur Thu='+await dayOf(cur,'Thu'));
check('…and in future weeks', await dayOf(cur+1,'Thu')!==null && await dayOf(cur+2,'Thu')!==null);
check('…without disturbing that week\'s other one-off (Mon→Tue stays)', await dayOf(cur,'Tue')==='easy' && await dayOf(cur,'Mon')===null);
check('…and history is still frozen', await dayOf(1,'Thu')===null && await dayOf(1,'Mon')==='easy');

// Same for move + remove through an existing override
await seed();
await page.evaluate((w)=>{ removeProgramSessionFromDay('Sat',{scope:'once',silent:true}); }, cur);
await page.evaluate(()=>moveProgramSession('Wed','Fri',{scope:'forward',silent:true}));
check('A "from now on" MOVE reaches the current week despite an override', await dayOf(cur,'Fri')==='tempo' && await dayOf(cur,'Wed')===null, 'cur Fri='+await dayOf(cur,'Fri'));
check('…and future weeks', await dayOf(cur+1,'Fri')==='tempo');
await seed();
await page.evaluate((w)=>{ moveProgramSession('Mon','Tue',{scope:'once',silent:true}); }, cur);
await page.evaluate(()=>removeProgramSessionFromDay('Sat',{scope:'forward',silent:true}));
check('A "from now on" REMOVE reaches the current week despite an override', await dayOf(cur,'Sat')===null && await dayOf(cur+1,'Sat')===null);

// ── Add now asks the scope question, like Move/Skip ────────────────────────
await seed();
const asks=await page.evaluate(()=>{ _addPlan={day:'Thu',type:'easy'}; _confirmAddToPlan();
  const h=document.getElementById('ins-content').innerHTML;
  return { asked:/Just this week/.test(h)&&/Every week from now on/.test(h), applied:_progWeekSessions(_progActualWeek()).find(x=>x.day==='Thu').id }; });
check('Add asks "just this week / from now on" before applying', asks.asked && asks.applied===null, JSON.stringify(asks));
const once=await page.evaluate(()=>{ _scopeAnswer('once');
  const w=_progActualWeek();
  return { cur:_progWeekSessions(w).find(x=>x.day==='Thu').id, next:_progWeekSessions(w+1).find(x=>x.day==='Thu').id }; });
check('Answering "just this week" adds only to this week', once.cur!==null && once.next===null, JSON.stringify(once));
await seed();
const fwd=await page.evaluate(()=>{ _addPlan={day:'Thu',type:'easy'}; _confirmAddToPlan(); _scopeAnswer('forward');
  const w=_progActualWeek();
  return { cur:_progWeekSessions(w).find(x=>x.day==='Thu').id, next:_progWeekSessions(w+1).find(x=>x.day==='Thu').id }; });
check('Answering "from now on" adds to this week AND future weeks', fwd.cur!==null && fwd.next!==null, JSON.stringify(fwd));

// The coach path must not be blocked by the prompt
await seed();
const coach=await page.evaluate(()=>{ const w=_progActualWeek();
  _coachPlanProposal={week:w,summary:'t',actions:[{action:'add',day:'Thu',type:'easy',why:'x'}]};
  const n=applyCoachPlanProposal();
  return { n, thu:_progWeekSessions(w).find(x=>x.day==='Thu').id }; });
check('Coach-applied adds still work without prompting', coach.n===1 && coach.thu!==null, JSON.stringify(coach));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
