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
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.evaluate(()=>{ baselines={'run-cooper':{run_threshold_pace:'4:15',run_zone2_lo_pace:'5:05',run_zone2_hi_pace:'4:40',run_vo2max_pace:'3:50'}}; });

// ENDURANCE is KB-driven: the long-run prescription comes from long_runs.rx
const lr = await page.evaluate(()=>_progressEndurance({runType:'long'},1,6));
const rx = await page.evaluate(()=>runningDomain('long_runs').rx);
check('Long-run week-1 distance == KB rx.startKm', num(lr.distance)===rx.startKm, `wk1=${lr.distance}, rx.startKm=${rx.startKm}`);

// Change the KB at runtime → the generated session changes (proves it's KB-driven, not hardcoded)
const changed = await page.evaluate(()=>{
  RUNNING_KB.domains.find(d=>d.id==='long_runs').rx.startKm = 25;   // mutate the KB
  return _progressEndurance({runType:'long'},1,6).distance;
});
check('Mutating long_runs.rx.startKm→25 changes wk1 long run to 25 km', num(changed)===25, `got ${changed}`);

// Tempo reps/mins come from lactate_threshold.rx
const tRx = await page.evaluate(()=>runningDomain('lactate_threshold').rx);
const tempo1 = await page.evaluate(()=>_progressEndurance({runType:'tempo'},1,6).intervals);
check('Tempo wk1 reps×min == KB rx start values', tempo1.startsWith(`${tRx.repsStart}×${tRx.minStart}`), `${tempo1} vs ${tRx.repsStart}×${tRx.minStart}`);
const tempoChanged = await page.evaluate(()=>{ RUNNING_KB.domains.find(d=>d.id==='lactate_threshold').rx.repsStart=4; return _progressEndurance({runType:'tempo'},1,6).intervals; });
check('Mutating tempo rx.repsStart→4 changes the session', tempoChanged.startsWith('4×'), tempoChanged);

// VO2 intervals from vo2max.rx
const ivRx = await page.evaluate(()=>runningDomain('vo2max').rx);
const iv1 = await page.evaluate(()=>_progressEndurance({runType:'intervals'},1,6).intervals);
check('Intervals wk1 from KB rx (reps + dist + vo2 pace)', iv1.startsWith(`${ivRx.repsStart}×${ivRx.dist}`)&&/3:50/.test(iv1), iv1);

// STRENGTH is KB-driven: the generic strength session is built from maximal_strength.rx
const s = await page.evaluate(()=>_genericStrengthSession());
const sRx = await page.evaluate(()=>strengthDomain('maximal_strength').rx);
check('Strength session uses KB rx mains + sets', s.exercises.length>=sRx.mains.length && s.exercises[0].sets===sRx.sets, JSON.stringify({n:s.exercises.length, sets:s.exercises[0].sets}));
check('Strength session main lifts == KB rx.mains', s.exercises.slice(0,sRx.mains.length).map(e=>e.name).join(',')===sRx.mains.map(m=>m.name).join(','), s.exercises.slice(0,4).map(e=>e.name).join(','));
const sChanged = await page.evaluate(()=>{ STRENGTH_KB.domains.find(d=>d.id==='maximal_strength').rx.sets=6; return _genericStrengthSession().exercises[0].sets; });
check('Mutating strength rx.sets→6 changes the session', sChanged===6, `got ${sChanged}`);

// End-to-end: a built concurrent program's strength session reflects the KB
await page.evaluate(()=>{ STRENGTH_KB.domains.find(d=>d.id==='maximal_strength').rx.sets=4; localStorage.removeItem('ht-program'); savedProgram=null; programBuilderConfig.type='hybrid'; buildConcurrent(['Tue','Fri'],'Sun','10K',6); });
await page.waitForTimeout(200);
const built = await page.evaluate(()=>{ const s=savedProgram.sessions.find(x=>x.id==='strength'); return s.exercises.map(e=>e.name); });
check('Concurrent build strength session is KB-driven (compound lifts from KB)', built.some(n=>/squat/i.test(n))&&built.length>=4, JSON.stringify(built));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
