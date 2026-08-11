import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-autoreg-dismiss');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Autoregulation API exists', await page.evaluate(()=>typeof weeklyAutoregulation==='function' && typeof applyWeeklyAutoregulation==='function' && typeof _autoRegScalar==='function'));

// Helper seeds a program started 2 weeks ago (current week 3, reviews week 2) and
// fills recovery + logs for the week-1 (prev) and week-2 (this) windows.
const seed=`(function(prevRead,thisRead,doneThisWk){
  const d=new Date(); d.setDate(d.getDate()-14); const mon=_mondayISO(d);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:mon,weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  const start=new Date(_progStartDate());
  const dayISO=(wk,off)=>{ const x=new Date(start); x.setDate(x.getDate()+(wk-1)*7+off); return x.toISOString().slice(0,10); };
  recoveryLog.length=0; sessions.length=0;
  for(let i=0;i<3;i++) recoveryLog.push({date:dayISO(1,i), sleepScore:prevRead});
  for(let i=0;i<3;i++) recoveryLog.push({date:dayISO(2,i), sleepScore:thisRead});
  const days=['Mon','Wed','Sat'];
  for(let i=0;i<doneThisWk;i++) sessions.push({week:'2',day:days[i],session:'Run',dist:'8',pace:'5:00',date:dayISO(2,[0,2,5][i]),ts:new Date(dayISO(2,[0,2,5][i])+'T09:00:00').getTime(),gid:'w2-'+i});
  recomputeAthleteState();
  return {cur:_progActualWeek()};
})`;

// ── DELOAD: readiness collapsed (76 → 50), low adherence ────────────────────
const deload=await page.evaluate((seed)=>{ const r=eval(seed)(76,50,1); const p=weeklyAutoregulation(); return {cur:r.cur,p}; }, seed);
check('Current week is 3 (reviews week 2)', deload.cur===3, 'cur='+deload.cur);
check('Readiness collapse → DELOAD with reduced load', deload.p && deload.p.decision==='deload' && deload.p.loadScalar<0.7, JSON.stringify(deload.p&&{d:deload.p.decision,s:deload.p.loadScalar,in:deload.p.inputs}));
check('Deload proposal carries reasons + targets the current week', deload.p && deload.p.reasons.length>=1 && deload.p.targetWeek===3);

// ── CUTBACK: readiness dips moderately (70 → 60) ────────────────────────────
const cut=await page.evaluate((seed)=>{ eval(seed)(70,60,2); const p=weeklyAutoregulation(); return p; }, seed);
check('Moderate readiness dip → CUTBACK (~0.8 load)', cut && cut.decision==='cutback' && cut.loadScalar>0.7 && cut.loadScalar<1, JSON.stringify({d:cut&&cut.decision,s:cut&&cut.loadScalar}));

// ── PROGRESS: full adherence + steady readiness ─────────────────────────────
const prog=await page.evaluate((seed)=>{ eval(seed)(74,76,3); const p=weeklyAutoregulation(); return p; }, seed);
check('Full adherence + steady readiness → PROGRESS (load > 1)', prog && prog.decision==='progress' && prog.loadScalar>1, JSON.stringify({d:prog&&prog.decision,s:prog&&prog.loadScalar}));

// ── APPLY: scales the target week; endurance prescription shrinks on deload ──
const applied=await page.evaluate((seed)=>{
  eval(seed)(76,50,1);
  const long=savedProgram.sessions.find(s=>s.runType==='long');
  const before=_progressEndurance(long,3,8);                 // week 3 distance before
  const p=weeklyAutoregulation(); applyWeeklyAutoregulation(p,{silent:true});
  const after=_progressEndurance(long,3,8);                  // after deload applied
  const km=s=>parseFloat((s.distance||'0').replace(/[^\d.]/g,''))||0;
  return { scalar:_autoRegScalar(3), before:km(before), after:km(after), stored:!!(savedProgram.autoReg&&savedProgram.autoReg[3]),
           pastUntouched:!(savedProgram.autoReg&&(savedProgram.autoReg[1]||savedProgram.autoReg[2])) };
}, seed);
check('Apply writes the per-week scalar', applied.stored && applied.scalar<0.7, JSON.stringify(applied));
check('Prescription load shrinks after a deload is applied', applied.after < applied.before, JSON.stringify({before:applied.before,after:applied.after}));
check('Autoregulation only targets the current week (history untouched)', applied.pastUntouched);

// ── Coach EV Core wiring ─────────────────────────────────────────────────────
const core=await page.evaluate((seed)=>{ eval(seed)(76,50,1); const p=CoachEV.decision.autoregulate(); const ok=CoachEV.programming.applyAutoreg(p,{silent:true}); return { hasP:!!p, applied:ok===true, scalar:_autoRegScalar(3) }; }, seed);
check('CoachEV.decision.autoregulate + programming.applyAutoreg work', core.hasP && core.applied && core.scalar<0.7, JSON.stringify(core));

// ── Today banner surfaces a non-hold proposal ────────────────────────────────
const banner=await page.evaluate((seed)=>{ eval(seed)(76,50,1); localStorage.removeItem('ht-autoreg-dismiss'); if(savedProgram.autoReg)delete savedProgram.autoReg; renderToday(); const h=document.getElementById('autoreg-banner').innerHTML; return { shown:/weekly autoregulation/i.test(h), deload:/Deload/.test(h) }; }, seed);
check('Today shows the autoregulation proposal banner', banner.shown && banner.deload, JSON.stringify(banner));


// ── ACWR needs an established chronic base ─────────────────────────────────
// With a thin history the 28-day denominator is near-empty and the ratio spikes;
// a new/returning athlete must not be told to deload after a good week.
const thin=await page.evaluate((seed)=>{ eval(seed)(74,76,3); const p=weeklyAutoregulation();
  return { d:p.decision, acwr:p.inputs.acwr, conf:p.confidence, reasons:p.reasons }; }, seed);
check('Thin history does not trigger a spurious deload', thin.d!=='deload', JSON.stringify({d:thin.d,acwr:thin.acwr}));
check('ACWR is reported as no-signal until the base is built', thin.acwr===0 && thin.reasons.some(r=>/history still building/.test(r)), JSON.stringify(thin.reasons));
check('Confidence is lower without a reliable load signal', thin.conf<0.95, String(thin.conf));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
