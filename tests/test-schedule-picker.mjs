import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-availability');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(500);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// allowedDays restricts placement to chosen days; long-run lands on the chosen long day
await page.evaluate(()=>{
  programBuilderConfig.type='endurance';
  buildFromSchedule(['Mon','Wed','Fri','Sun'], 'Sun', 'endurance', 6);
});
await page.waitForTimeout(300);
const wk = await page.evaluate(()=>_progWeekSessions(1).map(s=>({day:s.day,id:s.id,rt:s.session?.runType||null,type:s.session?_sessType(s.session):null})));
console.log('Week:', JSON.stringify(wk.map(w=>`${w.day}:${w.rt||w.id||'rest'}`)));
const byDay=Object.fromEntries(wk.map(w=>[w.day,w]));
const trainSet=new Set(['Mon','Wed','Fri','Sun']);
check('Sessions only on chosen days (Mon/Wed/Fri/Sun); others rest',
  ['Tue','Thu','Sat'].every(d=>!byDay[d].id) && ['Mon','Wed','Fri','Sun'].some(d=>byDay[d].id), JSON.stringify(wk.map(w=>`${w.day}:${w.id||'-'}`)));
check('Long run lands on chosen long-run day (Sun)', byDay.Sun.rt==='long', JSON.stringify(byDay.Sun));
check('Program is date-anchored + adaptive', await page.evaluate(()=>!!savedProgram && Array.isArray(savedProgram.schedule) && /^\d{4}-\d{2}-\d{2}$/.test(savedProgram.startDate)));

// Toggling a day updates config + UI (clear saved program so the builder renders)
await page.evaluate(()=>{ savedProgram=null; localStorage.removeItem('ht-program'); nav('more',document.querySelectorAll('.nb')[4]); openProgramOverlay(); programBuilderConfig.type='endurance'; renderProgramBuilder(); });
await page.waitForTimeout(250);
const beforeDays = await page.evaluate(()=>[...programBuilderConfig.trainDays]);
// toggle Tuesday on
await page.evaluate(()=>_toggleTrainDay('Tue'));
await page.waitForTimeout(150);
const afterDays = await page.evaluate(()=>[...programBuilderConfig.trainDays]);
check('Toggling a day updates trainDays', afterDays.includes('Tue') && !beforeDays.includes('Tue'), JSON.stringify({before:beforeDays,after:afterDays}));

// The day picker is no longer on the builder screen — which days you train is
// established in the interview and held in Training Preferences. What must survive
// is that those days actually shape the block.
const pk = await page.evaluate(()=>{
  savedProgram=null; localStorage.removeItem('ht-program');
  localStorage.setItem('ht-goal','sub-3:30 marathon');
  const days=['Tue','Thu','Sat'];
  const blk=buildBlockForGoal({goal:'sub-3:30 marathon', weeks:8, sessionsPerWeek:3, trainDays:days});
  if(!blk) return {err:'no block'};
  const prev=savedProgram; saveProgramData(blk);
  const placed=(_progWeekSessions(1)||[]).filter(s=>s.session).map(s=>s.day);
  saveProgramData(prev);
  return { placed, offDays:placed.filter(d=>!days.includes(d)) };
});
check('Chosen training days still shape the block', pk.placed && pk.placed.length>0, JSON.stringify(pk.placed));
check('...and nothing is scheduled on a day not chosen', pk.offDays && pk.offDays.length===0,
  JSON.stringify(pk.offDays));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
