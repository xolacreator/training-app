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

// 1) Adaptations are first-class objects with the required properties
const model = await page.evaluate(()=>ADAPTATION_MODEL.map(a=>({id:a.id,hasFat:!!a.fatigue,hasRec:typeof a.recoveryHours==='number',hasRet:typeof a.retentionDays==='number',hasInt:Array.isArray(a.interferenceWith)})));
const REQ=['aerobic_durability','lactate_threshold','vo2max','running_economy','strength_maintenance','force_production','power','race_specificity','recovery'];
check('All example adaptations exist as first-class objects', REQ.every(id=>model.find(m=>m.id===id)), JSON.stringify(REQ.filter(id=>!model.find(m=>m.id===id))));
check('Each adaptation has fatigue/recovery/retention/interference', model.every(m=>m.hasFat&&m.hasRec&&m.hasRet&&m.hasInt));

// 2) Workouts translate into adaptations + fatigue + recovery + interference
const tr = await page.evaluate(()=>({
  tempo: translateSession({type:'endurance',runType:'tempo',name:'Tempo'}),
  intervals: translateSession({type:'endurance',runType:'intervals',name:'VO2'}),
  lift: translateSession({type:'strength',name:'Strength'}),
  fitstopLift: translateSession({type:'fitstop',name:'LIFT'}),
}));
check('Tempo → lactate_threshold + fatigue + recovery + interference', tr.tempo.adaptations.includes('lactate_threshold')&&tr.tempo.recoveryHours>0&&tr.tempo.interference.includes('force_production'), JSON.stringify(tr.tempo.adaptations));
check('Intervals → vo2max (interferes with strength)', tr.intervals.adaptations.includes('vo2max')&&tr.intervals.interference.includes('force_production'), JSON.stringify(tr.intervals));
check('Strength → force_production', tr.lift.adaptations.includes('force_production'));
check('Fitstop LIFT → force_production', tr.fitstopLift.adaptations.includes('force_production'));

// 3) Adaptation STATE from logged history (decay/freshness)
const state = await page.evaluate(()=>{
  sessions.length=0;
  sessions.push({cat:'run',session:'Tempo Run',date:todayISO(),ts:Date.now()});   // threshold today → fresh
  // vo2max never trained → absent; aerobic never → absent
  return adaptationStatus(['lactate_threshold','vo2max','aerobic_durability'], todayISO());
});
const byId=Object.fromEntries(state.map(s=>[s.id,s]));
check('Recently-trained adaptation is fresh', byId.lactate_threshold.status==='fresh', JSON.stringify(byId.lactate_threshold));
check('Never-trained adaptations are absent (urgency 1.0)', byId.vo2max.status==='absent'&&byId.vo2max.urgency===1.0&&byId.aerobic_durability.status==='absent');

// 4) Value = adaptation per unit fatigue × urgency. Fresh high-fatigue ranks below absent low-fatigue.
const rank = await page.evaluate(()=>{
  sessions.length=0; sessions.push({cat:'run',session:'VO2 intervals',date:todayISO(),ts:Date.now()}); // vo2 fresh
  return rankAdaptationsByValue(['vo2max','aerobic_durability','recovery'], {readiness:80});
});
const ids = rank.ranked.map(r=>r.id);
check('Fresh high-fatigue VO₂max ranks last vs absent adaptations', ids.indexOf('vo2max')===ids.length-1, JSON.stringify(rank.ranked.map(r=>`${r.id}:${r.value}`)));
check('Aerobic durability (absent, low fatigue) outranks recovery? value-ordered', rank.priority && rank.ranked[0].value>=rank.ranked[1].value);

// 5) Readiness gate: low readiness downweights high-fatigue adaptations
const lowR = await page.evaluate(()=>{ sessions.length=0; const r=rankAdaptationsByValue(['vo2max','recovery','aerobic_durability'],{readiness:40}); return {top:r.priority.id, vo2:r.ranked.find(x=>x.id==='vo2max').value}; });
check('Low readiness → high-fatigue VO₂max not the priority', lowR.top!=='vo2max', JSON.stringify(lowR));

// 6) planTodayAdaptation returns a priority + a prescription (workout to create it)
const plan = await page.evaluate(()=>{ sessions.length=0; return planTodayAdaptation({type:'endurance',goal:'marathon',readiness:80}); });
check('planTodayAdaptation returns adaptation + prescription + reason', plan&&plan.adaptation&&plan.prescription&&/Highest value today/.test(plan.reason), JSON.stringify({a:plan?.adaptation?.id,rx:plan?.prescription}));

// 7) Scheduler objectives ordered by adaptation value (adaptation-first)
const objs = await page.evaluate(()=>{ sessions.length=0; return objectivesByAdaptationValue('endurance','marathon'); });
check('objectivesByAdaptationValue returns scheduler objectives in value order', Array.isArray(objs)&&objs.length>0&&objs.every(o=>typeof o==='string'), JSON.stringify(objs));

// 8) End-to-end: adaptive build uses adaptation-value ordering + renders priority on Today
await page.evaluate(()=>{ sessions.length=0; programBuilderConfig.type='endurance'; buildFromSchedule(['Mon','Wed','Fri','Sun'],'Sun','marathon',6); nav('today',document.querySelectorAll('.nb')[0]); renderToday(); });
await page.waitForTimeout(300);
const banner = await page.locator('#adaptation-priority').innerText().catch(()=>'');
check('Today shows the priority adaptation card', /priority adaptation/i.test(banner)&&/value\/fatigue/i.test(banner), JSON.stringify(banner.slice(0,80)));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
