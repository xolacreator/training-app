import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-availability');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(500);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Set a realistic availability profile (mirrors the brief's example)
await page.evaluate(()=>{
  setDayStatus('Tue','fitstop','locked');     // Locked Fitstop
  setDayStatus('Mon','easy-run','preferred');
  setDayStatus('Wed','workout-run','preferred'); // prefers threshold Wed
  setDayStatus('Wed','track','available');
  setDayStatus('Thu','strength','preferred');
  setDayStatus('Sat','long-run','locked');     // Locked long run
  setDayStatus('Sun','recovery','preferred');
  setDayStatus('Sun','workout-run','avoid');   // avoid hard running Sunday
  setDayStatus('Fri','easy-run','available');
});

// 1) Scheduler honours Locked commitments
let sch = await page.evaluate(()=>scheduleWeek(['long-endurance','threshold','max-strength','aerobic-base','recovery']));
check('Locked Tue Fitstop honoured', sch.assigned.Tue && sch.assigned.Tue.locked && sch.assigned.Tue.category==='fitstop', JSON.stringify(sch.assigned.Tue));
check('Locked Sat Long Run honoured', sch.assigned.Sat && sch.assigned.Sat.locked && sch.assigned.Sat.category==='long-run', JSON.stringify(sch.assigned.Sat));

// 2) Threshold lands on the Preferred day (Wed)
check('Threshold → Wed (preferred)', sch.assigned.Wed && sch.assigned.Wed.adaptationId==='threshold' && sch.assigned.Wed.status==='preferred', JSON.stringify(sch.assigned.Wed));
// 3) Max strength → Thu (preferred strength)
check('Max strength → Thu (preferred)', sch.assigned.Thu && sch.assigned.Thu.adaptationId==='max-strength', JSON.stringify(sch.assigned.Thu));

// 4) Avoid respected: no hard running adaptation scheduled on Sunday
const sun = sch.assigned.Sun;
check('Sunday is not a hard run (Avoid respected)', !sun || !(['threshold','vo2max','long-endurance'].includes(sun.adaptationId)), JSON.stringify(sun));

// 5) Explainability present for each placed day
check('Every placed day has a why + alternatives', sch.explanations.length>=4 && sch.explanations.every(e=>e.why && 'alternatives' in e), JSON.stringify(sch.explanations[0]));

// 6) Fatigue spacing: count adjacent hard-hard day pairs — should be minimised
const spacing = await page.evaluate((a)=>{
  const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; let adj=0;
  for(let i=0;i<7;i++){ const x=a[DOW[i]], y=a[DOW[(i+1)%7]]; if(x&&y&&x.hard&&y.hard) adj++; }
  return adj;
}, sch.assigned);
console.log('adjacent hard-hard pairs:', spacing);
check('Fatigue spacing keeps adjacent hard days low (≤2)', spacing<=2, `adj=${spacing}`);

// 7) buildAdaptiveWeek produces a real program that flows through the calendar + validates
await page.evaluate(()=>{ openProgramOverlay(); buildAdaptiveWeek('hybrid',6); });
await page.waitForTimeout(300);
const prog = await page.evaluate(()=>({type:savedProgram.type,start:savedProgram.startDate,spw:savedProgram.sessionsPerWeek,hasSchedule:Array.isArray(savedProgram.schedule),unplaced:savedProgram.unplaced}));
check('Adaptive program built (date-anchored, has schedule/explanations)', prog.type==='hybrid'&&/^\d{4}-\d{2}-\d{2}$/.test(prog.start)&&prog.hasSchedule, JSON.stringify(prog));
const val = await page.evaluate(()=>validateProgram(savedProgram,{}));
check('Adaptive week passes validation (no errors)', val.ok===true, `score=${val.score}, errors=${JSON.stringify(val.errors.map(e=>e.rule))}`);

// 8) Tue still Fitstop (locked) in the built program week
const wk = await page.evaluate(()=>_progWeekSessions(1).map(s=>({day:s.day,id:s.id})));
const tue = wk.find(w=>w.day==='Tue');
check('Built week keeps Tue = Fitstop (locked commitment)', tue && tue.id==='fitstop', JSON.stringify(tue));

// 9) Explainability surfaces in the session detail overlay
await page.evaluate(()=>{ closeOv('program-overlay'); nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1); });
await page.waitForTimeout(200);
// open a placed run day (Mon should be a run)
const monId = (wk.find(w=>w.day==='Mon')||{}).id;
if(monId){ await page.evaluate((id)=>openProgramSessionOverlay(id,1,'Mon'), monId); await page.waitForTimeout(250);
  const body=await page.locator('#po-breakdown').innerText();
  check('Session detail shows "Why this session" explanation', /Why this session/i.test(body), JSON.stringify(body.slice(0,80)));
} else check('Session detail shows "Why this session" explanation', false, 'no Mon session');

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
