import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.setItem('ht-goal','Marathon');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Plan-editor API exists', await page.evaluate(()=>['togglePlanEdit','_renderPlanEditList','editProgramSession','openSessionEditor','_saveSessionEditor','_planMove'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// Program starting THIS week (cur=1) — in-place edits, no history to protect.
await page.evaluate(()=>{
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:8,sessionsPerWeek:4,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy','tempo',null,null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recomputeAthleteState(); nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1);
});

// ── A: Edit mode renders the inline week editor ─────────────────────────────
const em=await page.evaluate(()=>{ togglePlanEdit(); const h=document.getElementById('plan-days').innerHTML;
  return { editing:/Editing week 1/.test(h), move:/Move to…/.test(h), add:/＋ Add/.test(h), edit:/openSessionEditor/.test(h) }; });
check('Edit mode shows the week editor (Move / Edit / Add)', em.editing && em.move && em.add && em.edit, JSON.stringify(em));
const off=await page.evaluate(()=>{ togglePlanEdit(); return !/Editing week/.test(document.getElementById('plan-days').innerHTML); });
check('Toggle off returns to the read-only list', off);

// ── A: move + remove + add via the editor ───────────────────────────────────
const moved=await page.evaluate(()=>{ togglePlanEdit(); _planMove('Tue','Wed'); const dm=savedProgram.dayMap; return { wed:dm[2], tue:dm[1] }; });
check('Editor move: Tue tempo → Wed', moved.wed==='tempo' && moved.tue==null, JSON.stringify(moved));
const removed=await page.evaluate(()=>{ removeProgramSessionFromDay('Sat',{silent:true}); renderPlan(currentProgramWeek); return savedProgram.dayMap[5]; });
check('Editor remove clears the day', removed==null);
const added=await page.evaluate(()=>{ _addPlan={day:'Fri',type:'easy'}; _confirmAddToPlan(); return savedProgram.dayMap[4]; });
check('Editor add fills a rest day', added!=null);

// ── B: edit a session in place (week-1 program, no history) ─────────────────
const inplace=await page.evaluate(()=>{
  const before=savedProgram.sessions.length;
  openSessionEditor('easy','Mon',1);
  _sessEdit.type='endurance'; _sessEdit.runType='tempo';
  document.getElementById('se-name').value='Threshold Repeats';
  document.getElementById('se-focus').value='4×2km @ threshold';
  _saveSessionEditor();
  const s=savedProgram.sessions.find(x=>x.id==='easy');
  return { sameCount:savedProgram.sessions.length===before, name:s&&s.name, rt:s&&s.runType, focus:s&&s.focus };
});
check('Edit in place (no history): def updated, no fork', inplace.sameCount && inplace.name==='Threshold Repeats' && inplace.rt==='tempo' && inplace.focus==='4×2km @ threshold', JSON.stringify(inplace));

// ── B: edit is HISTORY-SAFE when the program has elapsed weeks (fork) ────────
const fork=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14); const mon=_mondayISO(d);
  saveProgramData({id:'q',name:'Hist',type:'endurance',startDate:mon,weeks:8,sessionsPerWeek:3,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:[null,null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  const cur=_progActualWeek();
  const wk1Before=_progWeekSessions(1).find(x=>x.day==='Wed').session.name;
  editProgramSession('tempo',{name:'VO2 Threshold', runType:'intervals'},{silent:true});
  const wk1After=_progWeekSessions(1).find(x=>x.day==='Wed').session.name;   // historical
  const curAfter=_progWeekSessions(cur).find(x=>x.day==='Wed').session.name;  // current
  return { cur, wk1Before, wk1After, curAfter, forked:savedProgram.sessions.length===3 };
});
check('History-safe edit: current week reflects the change', fork.curAfter==='VO2 Threshold', JSON.stringify(fork));
check('History-safe edit: week 1 (past) keeps the original session', fork.wk1After==='Tempo' && fork.wk1Before==='Tempo', JSON.stringify(fork));
check('History-safe edit forks the definition (adds a new def)', fork.forked, JSON.stringify({n:fork.forked}));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
