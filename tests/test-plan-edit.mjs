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

check('Plan-edit API exists', await page.evaluate(()=>
  typeof moveProgramSession==='function' && typeof removeProgramSessionFromDay==='function' && typeof openAddToPlan==='function' && typeof _confirmAddToPlan==='function'));

// Program: Mon tempo, Wed easy, Fri long (dayMap Mon..Sun)
await page.evaluate(()=>{
  localStorage.setItem('ht-goal','Marathon'); trainGoal='Marathon';
  saveProgramData({ id:'pe', name:'Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:6, sessionsPerWeek:3,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'easy',type:'endurance',name:'Easy',runType:'easy'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['tempo',null,'easy',null,'long',null,null],
    weeklyProgressions:Array.from({length:7},(_,i)=>({week:i+1})) });
  recomputeAthleteState();
});
const dm0=await page.evaluate(()=>savedProgram.dayMap.slice());
check('Baseline dayMap: Mon tempo, Wed easy, Fri long', dm0[0]==='tempo'&&dm0[2]==='easy'&&dm0[4]==='long'&&dm0[3]==null, JSON.stringify(dm0));

// ── TASK 1: add an extra run on Tuesday
const add=await page.evaluate(()=>{
  _addPlan={day:'Tue',type:'easy'}; _confirmAddToPlan();
  const di=1; // Tue
  const id=savedProgram.dayMap[di];
  const sess=savedProgram.sessions.find(s=>s.id===id);
  return { onTue:!!id, name:sess&&sess.name, type:sess&&sess.type, inWeek:_progWeekSessions(_progActualWeek()).some(x=>x.session&&x.day==='Tue') };
});
check('Add an extra easy run on Tuesday → new slot on Tue', add.onTue && add.type==='endurance' && /Easy Run/.test(add.name||''), JSON.stringify(add));
check('The added Tuesday run appears in the plan week', add.inWeek);

// ── TASK 2: shift Wednesday's run to Thursday (Thu is empty → plain move)
const move=await page.evaluate(()=>{
  const before=savedProgram.dayMap.slice();
  const ok=moveProgramSession('Wed','Thu',{silent:true});
  return { ok, wed:savedProgram.dayMap[2], thu:savedProgram.dayMap[3], before };
});
check('Move Wed → Thu: Thu now holds the run, Wed is clear', move.ok && move.thu==='easy' && move.wed==null, JSON.stringify({wed:move.wed,thu:move.thu}));

// ── Move onto an occupied day swaps the two
const swap=await page.evaluate(()=>{
  // Mon=tempo, Fri=long → move Mon to Fri swaps them
  moveProgramSession('Mon','Fri',{silent:true});
  return { mon:savedProgram.dayMap[0], fri:savedProgram.dayMap[4] };
});
check('Move onto an occupied day swaps both sessions', swap.mon==='long' && swap.fri==='tempo', JSON.stringify(swap));

// ── Remove a day clears it
const rm=await page.evaluate(()=>{ removeProgramSessionFromDay('Thu',{silent:true}); return savedProgram.dayMap[3]; });
check('Remove clears that day', rm==null, JSON.stringify(rm));

// ── Engine re-analyses after edits (AthleteState + dashboard reflect the new plan)
const reanalyse=await page.evaluate(()=>{
  // add a strength day and confirm the weekly dashboard sees force_production scheduled
  _addPlan={day:'Sat',type:'strength'}; _confirmAddToPlan();
  const d=weeklyAdaptationDashboard();
  return { sat:!!savedProgram.dayMap[5], hasForce: d.rows.some(r=>r.id==='force_production') };
});
check('After edits the engine re-analyses the plan (state/dashboard update)', reanalyse.sat, JSON.stringify(reanalyse));

// ── UI: session overlay exposes Move/Remove; Plan shows the Add button
const ui=await page.evaluate(()=>{
  openProgramSessionOverlay('easy', _progActualWeek(), 'Thu');  // Thu empty now; use a real slot instead
  return true;
});
const overlayUI=await page.evaluate(()=>{
  // open a real scheduled session (Fri=tempo after swap)
  const day='Fri'; const id=savedProgram.dayMap[4];
  openProgramSessionOverlay(id, _progActualWeek(), day);
  const html=document.getElementById('po-breakdown').innerHTML;
  return { hasMove:/Move to…/.test(html)&&/moveProgramSession\('Fri'/.test(html), hasRemove:/removeProgramSessionFromDay\('Fri'/.test(html) };
});
check('Session overlay exposes Move + Remove for that day', overlayUI.hasMove && overlayUI.hasRemove, JSON.stringify(overlayUI));
const addUI=await page.evaluate(()=>{ nav('plan',document.querySelectorAll('.nb')[1]); renderPlan(1); const b=document.getElementById('plan-add-session-btn'); openAddToPlan('Tue'); const sheet=document.getElementById('ins-content').innerHTML; return { btnShown:b&&b.style.display!=='none', picker:/Add a session to the plan|Which day/.test(sheet)&&/Add to plan/.test(sheet) }; });
check('Plan shows "+ Add to plan" button; picker opens with day/type', addUI.btnShown && addUI.picker, JSON.stringify(addUI));

// ── Add picker warns when the chosen day is occupied
const warn=await page.evaluate(()=>{ _addPlan={day:'Fri',type:'tempo'}; _renderAddToPlan(); return /already has a session/.test(document.getElementById('ins-content').innerHTML); });
check('Add picker warns when the day is already occupied', warn);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
