import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL('/home/user/training-app/index.html').href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'});
await page.waitForTimeout(600);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Build "2 Fitstop (Tue/Fri LIFT) + 4 runs"
await page.evaluate(()=>{ openProgramOverlay(); buildFitstopHybrid(['Tue','Fri'],'sub-45 10K'); closeOv('program-overlay'); });
await page.waitForTimeout(300);

const wk=await page.evaluate(()=>_progWeekSessions(1).map(s=>({day:s.day,id:s.id,type:s.session?_sessType(s.session):null,rt:s.session?.runType||null})));
console.log('Week:', JSON.stringify(wk.map(w=>`${w.day}:${w.id||'rest'}`)));
const byDay=Object.fromEntries(wk.map(w=>[w.day,w]));
check('Tue & Fri are Fitstop LIFT (strength)', byDay.Tue.id==='lift'&&byDay.Tue.type==='strength'&&byDay.Fri.id==='lift', JSON.stringify([byDay.Tue,byDay.Fri]));
check('Mon/Wed/Thu/Sat are endurance runs', ['Mon','Wed','Thu','Sat'].every(d=>byDay[d].type==='endurance'), JSON.stringify(['Mon','Wed','Thu','Sat'].map(d=>byDay[d].id)));
check('Sunday is the long run', byDay.Sun.id==='run-long'&&byDay.Sun.rt==='long', JSON.stringify(byDay.Sun));

// With a running goal, ≥1 quality run is included (2 Fitstop kept → up to 2 hard budget)
const hardRunDays = wk.filter(w=>w.type==='endurance'&&['tempo','intervals'].includes(w.rt)).map(w=>w.day);
check('Running goal yields ≥1 quality run', hardRunDays.length>=1, 'hard='+hardRunDays.join(',')||'(none)');
check('Polarised: still ≥1 easy run present', wk.some(w=>w.rt==='easy'), JSON.stringify(wk.filter(w=>w.type==='endurance').map(w=>w.rt)));
// Unavoidable interference is flagged (Tue/Fri spread means every free day touches a LIFT)
const flags = await page.evaluate(()=>savedProgram.interferenceFlags||[]);
check('Unavoidable interference is flagged for the Validation Engine', Array.isArray(flags)&&flags.length>=1, JSON.stringify(flags.slice(0,2)));

// Program metadata
const meta=await page.evaluate(()=>({type:savedProgram.type,start:savedProgram.startDate,weeks:savedProgram.weeks,spw:savedProgram.sessionsPerWeek,hasBlock:!!savedProgram.fitstopBlock}));
check('Hybrid program, date-anchored to BLOCK C (2026-06-22), 12 weeks', meta.type==='hybrid'&&meta.start==='2026-06-22'&&meta.weeks===12&&meta.hasBlock, JSON.stringify(meta));

// Calendar renders mixed disciplines
await page.evaluate(()=>{ nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(5); });
await page.waitForTimeout(300);
const planText=await page.locator('#plan-days').innerText();
check('Plan shows LIFT + runs (Zone 2 / Tempo / Long)', /LIFT/.test(planText)&&/(Zone 2|Tempo|Long)/.test(planText), JSON.stringify(planText.slice(0,100)));

// Fitstop LIFT day still shows the published per-week format (BLOCK C wk5 Fri = LIFT 5RM)
await page.evaluate(()=>openProgramSessionOverlay('lift',5,'Fri'));
await page.waitForTimeout(250);
const liftBody=await page.locator('#po-breakdown').innerText();
check('Kept Fitstop LIFT still shows BLOCK C format (5RM in BUILD)', /LIFT 5RM/.test(liftBody), JSON.stringify(liftBody.slice(0,80)));

// 4 Fitstop + 2 runs preset → only 1 hard-run budget, fewer runs
await page.evaluate(()=>{ buildFitstopHybrid(['Mon','Tue','Thu','Fri'],''); });
await page.waitForTimeout(200);
const wk2=await page.evaluate(()=>_progWeekSessions(1).map(s=>({day:s.day,id:s.id,type:s.session?_sessType(s.session):null,rt:s.session?.runType||null})));
const runCount=wk2.filter(w=>w.type==='endurance').length;
const fitstopCount=wk2.filter(w=>['perform','lift','condition','sweat'].includes(w.id)).length;
check('4 Fitstop + 2 runs: 4 Fitstop days kept', fitstopCount===4, JSON.stringify(wk2.map(w=>`${w.day}:${w.id||'rest'}`)));
check('4+2 preset has ≤1 hard run (high load → conservative)', wk2.filter(w=>['tempo','intervals'].includes(w.rt)).length<=1, JSON.stringify(wk2.filter(w=>w.type==='endurance').map(w=>w.rt)));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
