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

check('Day-action API exists', await page.evaluate(()=>['openDayActions','_askScope','_dayMoveTo','_dayRemovePrompt','_dateForPlanDay'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

const seed=()=>page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:9,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  recomputeAthleteState(); return _progActualWeek();
});
const cur=await seed();
const dayOf=(wk,day)=>page.evaluate(([w,d])=>{ const s=_progWeekSessions(w).find(x=>x.day===d); return s&&s.id||null; },[wk,day]);

// ── One tap per day, plain language, no jargon ──────────────────────────────
const sheet=await page.evaluate((w)=>{ openDayActions('Wed',w); const h=document.getElementById('ins-content').innerHTML;
  return { move:/Move to another day/.test(h), edit:/Change the workout/.test(h), alt:/different every other week/.test(h),
           skip:/Skip it/.test(h), noJargon:!/template|dayMap|scope|cycle/i.test(h) }; }, cur);
check('Tapping a day offers plain-language actions', sheet.move&&sheet.edit&&sheet.alt&&sheet.skip, JSON.stringify(sheet));
check('No developer jargon in the day sheet', sheet.noJargon);
const rest=await page.evaluate((w)=>{ openDayActions('Tue',w); const h=document.getElementById('ins-content').innerHTML;
  return /Add a workout/.test(h) && !/Skip it/.test(h); }, cur);
check('A rest day offers "Add a workout" instead', rest);
check('Days resolve to real calendar dates', await page.evaluate((w)=>/^[A-Z][a-z]{2} \d+$/.test(_dateForPlanDay('Wed',w)), cur), await page.evaluate((w)=>_dateForPlanDay('Wed',w), cur));

// ── Scope is asked AFTER the choice, defaulting to this week ────────────────
const ask=await page.evaluate((w)=>{ _dayMoveTo('Wed','Thu',w); const h=document.getElementById('ins-content').innerHTML;
  return { asks:/Just this week/.test(h)&&/Every week from now on/.test(h), explains:/plan repeats every week/i.test(h),
           noJargon:!/template/i.test(h) }; }, cur);
check('Scope is asked after choosing (calendar pattern)', ask.asks, JSON.stringify(ask));
check('It explains why in plain language', ask.explains && ask.noJargon);
check('The pre-set mode toggle is gone from the editor', await page.evaluate((w)=>{ nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(w); togglePlanEdit();
  const h=document.getElementById('plan-days').innerHTML; togglePlanEdit();
  return !/All future weeks/.test(h) && /Tap any day to change it/.test(h); }, cur));

// ── Picking "just this week" leaves pending weeks alone ────────────────────
await seed();
const once=await page.evaluate((w)=>{ _dayMoveTo('Wed','Thu',w); _scopeAnswer('once'); return true; }, cur);
check('Answering "Just this week" performs the move', await dayOf(cur,'Thu')==='tempo' && await dayOf(cur,'Wed')===null, String(once));
check('…and pending weeks are untouched', await dayOf(cur+1,'Wed')==='tempo' && await dayOf(cur+1,'Thu')===null);
// ── "Every week from now on" propagates ────────────────────────────────────
await seed();
await page.evaluate((w)=>{ _dayMoveTo('Wed','Thu',w); _scopeAnswer('forward'); }, cur);
check('Answering "Every week from now on" propagates', await dayOf(cur,'Thu')==='tempo' && await dayOf(cur+1,'Thu')==='tempo');
check('…and still protects history', await dayOf(1,'Wed')==='tempo');
// ── Skip also asks + scopes ────────────────────────────────────────────────
await seed();
await page.evaluate((w)=>{ _dayRemovePrompt('Sat',w); _scopeAnswer('once'); }, cur);
check('Skipping a day scopes correctly', await dayOf(cur,'Sat')===null && await dayOf(cur+1,'Sat')==='long');

// ── Rows are single-tap (not a wall of buttons) ────────────────────────────
const rows=await page.evaluate((w)=>{ renderPlan(w); togglePlanEdit(); const h=document.getElementById('plan-days').innerHTML; togglePlanEdit();
  return { taps:(h.match(/openDayActions/g)||[]).length, selects:(h.match(/<select/g)||[]).length }; }, cur);
check('Every day row is one tap; no per-row dropdowns', rows.taps>=7 && rows.selects===0, JSON.stringify(rows));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
