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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Freeze API exists', await page.evaluate(()=>typeof _freezeHistoricalWeeks==='function'));

// Program that STARTED 3 weeks ago → weeks 1..3 are history, current week ≥ 3.
const setup=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-21); const mon=_mondayISO(d);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:mon,weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],   // Mon easy · Wed tempo · Sat long
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  return { cur:_progActualWeek() };
});
check('Program has elapsed weeks (current week ≥ 3)', setup.cur>=3, 'currentWeek='+setup.cur);

const dayOf=(wk,day)=>page.evaluate(([w,d])=>{ const s=_progWeekSessions(w).find(x=>x.day===d); return s&&s.id||null; },[wk,day]);

// Baseline: week 1 (history) and the current week both show Wed=tempo from the template.
check('Baseline — week 1 Wed = tempo', await dayOf(1,'Wed')==='tempo');
check('Baseline — current week Wed = tempo', await dayOf(setup.cur,'Wed')==='tempo');

// ── MOVE: Wed → Thu (on-demand edit) ────────────────────────────────────────
await page.evaluate(([cur])=>{ moveProgramSession('Wed','Thu',{silent:true}); }, [setup.cur]);
check('Current week reflects the move: Thu = tempo, Wed clear', await dayOf(setup.cur,'Thu')==='tempo' && await dayOf(setup.cur,'Wed')===null);
check('History PROTECTED: week 1 STILL Wed = tempo, Thu clear', await dayOf(1,'Wed')==='tempo' && await dayOf(1,'Thu')===null);
check('Past weeks were snapshotted into overrides', await page.evaluate(()=>!!(savedProgram.overrides&&savedProgram.overrides[1]&&savedProgram.overrides[2])));

// ── REMOVE: clear Sat in the current template ───────────────────────────────
await page.evaluate(()=>removeProgramSessionFromDay('Sat',{silent:true}));
check('Current week Sat cleared', await dayOf(setup.cur,'Sat')===null);
check('History PROTECTED: week 1 Sat = long still', await dayOf(1,'Sat')==='long');

// ── ADD: an extra easy run on Tue in the current template ───────────────────
await page.evaluate(()=>addSessionToProgram({type:'endurance',name:'Extra Easy',runType:'easy'},'Tue',{silent:true}));
check('Current week Tue now has a session', await dayOf(setup.cur,'Tue')!==null);
check('History PROTECTED: week 1 Tue still empty', await dayOf(1,'Tue')===null);

// A brand-new program (week 1, no history) still edits normally — no freezing.
const fresh=await page.evaluate(()=>{
  saveProgramData({id:'q',name:'New',type:'endurance',startDate:_mondayISO(new Date()),weeks:6,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'Easy',runType:'easy'}],dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:7},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  moveProgramSession('Mon','Tue',{silent:true});
  const tue=_progWeekSessions(1).find(x=>x.day==='Tue');
  return { movedThisWeek:tue&&tue.id==='easy', noFreeze:!(savedProgram.overrides&&Object.keys(savedProgram.overrides).length) };
});
check('Week-1 program edits normally (no history to freeze)', fresh.movedThisWeek && fresh.noFreeze, JSON.stringify(fresh));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
