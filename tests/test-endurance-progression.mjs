import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const num = s => parseFloat(String(s).replace(/[^\d.]/g,''))||0;

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);

// Seed baselines so paces personalise
await page.evaluate(()=>{
  baselines = { 'run-cooper': { run_threshold_pace:'4:15', run_zone2_lo_pace:'5:05', run_zone2_hi_pace:'4:40', run_vo2max_pace:'3:50' } };
});

// Long run progresses across the block + uses Z2
const lr = await page.evaluate(()=>{
  const s={runType:'long',type:'endurance',name:'Long Run'};
  return [1,3,5,6].map(w=>_progressEndurance(s,w,6));
});
console.log('Long run by week:', JSON.stringify(lr.map(x=>x.distance)));
check('Long run distance increases wk1<wk5', num(lr[0].distance)<num(lr[2].distance), JSON.stringify([lr[0].distance,lr[2].distance]));
check('Deload week (6) cuts long run below peak', num(lr[3].distance)<num(lr[2].distance), JSON.stringify([lr[2].distance,lr[3].distance]));

// Tempo progresses time-at-threshold + uses baseline threshold pace
const tp = await page.evaluate(()=>{
  const s={runType:'tempo',type:'endurance',name:'Tempo'};
  return {w1:_progressEndurance(s,1,6), w5:_progressEndurance(s,5,6)};
});
console.log('Tempo:', JSON.stringify([tp.w1.intervals, tp.w5.intervals]));
check('Tempo uses baseline threshold pace (4:15)', /4:15/.test(tp.w1.intervals), tp.w1.intervals);
check('Tempo volume grows wk1→wk5', tp.w5.intervals!==tp.w1.intervals, JSON.stringify([tp.w1.intervals,tp.w5.intervals]));

// Intervals: reps grow + baseline VO2 pace
const iv = await page.evaluate(()=>{
  const s={runType:'intervals',type:'endurance',name:'VO2'};
  return {w1:_progressEndurance(s,1,6), w5:_progressEndurance(s,5,6)};
});
const reps1=num(iv.w1.intervals.split('×')[0]), reps5=num(iv.w5.intervals.split('×')[0]);
check('Intervals reps grow wk1→wk5', reps5>reps1, JSON.stringify([iv.w1.intervals,iv.w5.intervals]));
check('Intervals use baseline VO2 pace (3:50)', /3:50/.test(iv.w1.intervals), iv.w1.intervals);

// Without baselines → graceful generic targets (no NaN/undefined)
const noBase = await page.evaluate(()=>{ baselines={}; const s={runType:'tempo',type:'endurance'}; return _progressEndurance(s,2,6); });
check('Falls back gracefully without baselines', /threshold/.test(noBase.intervals) && !/undefined|NaN/.test(JSON.stringify(noBase)), JSON.stringify(noBase.intervals));

// End-to-end: build an endurance program; the SAME long-run session shows different
// distances in the plan summary for week 1 vs week 5.
await page.evaluate(()=>{
  baselines = { 'run-cooper': { run_threshold_pace:'4:15', run_zone2_lo_pace:'5:05', run_zone2_hi_pace:'4:40', run_vo2max_pace:'3:50' } };
  programBuilderConfig.type='endurance';
  buildFromSchedule(['Mon','Wed','Fri','Sun'],'Sun','endurance',6);
});
await page.waitForTimeout(200);
const longId = await page.evaluate(()=>{ const s=_progWeekSessions(1).find(x=>x.session?.runType==='long'); return s?.id; });
const sums = await page.evaluate((id)=>{
  const sess=savedProgram.sessions.find(s=>s.id===id);
  return { w1:_sessSummary(sess,1), w5:_sessSummary(sess,5) };
}, longId);
console.log('Long-run summary wk1 vs wk5:', JSON.stringify(sums));
check('Plan summary shows progression (wk1 ≠ wk5 long run)', sums.w1!==sums.w5 && num(sums.w1)<num(sums.w5), JSON.stringify(sums));

// Session detail overlay reflects the week's progressed prescription
await page.evaluate((id)=>{ nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(5); openProgramSessionOverlay(id,5,'Sun'); }, longId);
await page.waitForTimeout(250);
const detail5 = await page.locator('#po-breakdown').innerText();
check('Week-5 detail shows progressed distance + Z2 pace', /km/.test(detail5) && /5:05|4:40|Z2/.test(detail5), JSON.stringify(detail5.slice(0,100)));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
