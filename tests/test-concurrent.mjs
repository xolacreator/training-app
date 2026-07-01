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

// PART 2: Fitstop as strength — settings has the fitstop method pill
const hasPill = await page.evaluate(()=>{ renderStrengthProgrammingCard(); const c=document.getElementById('strength-programming-card')?.innerText||''; return /Fitstop/.test(c); });
check('Fitstop is a strength-method option in settings', hasPill);
// strength-type builder offers "Use Fitstop BLOCK C as my strength program"
const strBuilder = await page.evaluate(()=>{ savedProgram=null; localStorage.removeItem('ht-program'); openProgramOverlay(); programBuilderConfig.type='strength'; renderProgramBuilder(); const b=document.getElementById('program-overlay-body')?.innerText||''; return /Use Fitstop/i.test(b)&&/strength program/i.test(b); });
check('Strength builder offers Fitstop as the strength program', strBuilder);

// PART 3: concurrent generic strength + endurance
await page.evaluate(()=>{ savedProgram=null; programBuilderConfig.type='hybrid'; buildConcurrent(['Tue','Fri'],'Sun','sub-45 10K',6); });
await page.waitForTimeout(300);
const wk = await page.evaluate(()=>_progWeekSessions(1).map(s=>({day:s.day,id:s.id,type:s.session?_sessType(s.session):null,rt:s.session?.runType||null})));
console.log('Concurrent week:', JSON.stringify(wk.map(w=>`${w.day}:${w.id||'rest'}`)));
const byDay=Object.fromEntries(wk.map(w=>[w.day,w]));
check('Tue & Fri are strength', byDay.Tue.id==='strength'&&byDay.Tue.type==='strength'&&byDay.Fri.id==='strength', JSON.stringify([byDay.Tue.id,byDay.Fri.id]));
{ const free=['Mon','Wed','Thu','Sat']; const runs=free.filter(d=>byDay[d].type==='endurance').length; const rests=free.filter(d=>!byDay[d].id).length;
  check('Free days are runs with one reserved rest day', runs>=3 && rests===1, JSON.stringify(free.map(d=>byDay[d].id))); }
check('Sunday long run', byDay.Sun.rt==='long', JSON.stringify(byDay.Sun));
check('Concurrent program is hybrid + date-anchored', await page.evaluate(()=>savedProgram.type==='hybrid' && /^\d{4}-\d{2}-\d{2}$/.test(savedProgram.startDate)));

// Interference: hard runs not adjacent to strength when avoidable; flags recorded otherwise
const flags = await page.evaluate(()=>savedProgram.interferenceFlags||[]);
const hardDays = wk.filter(w=>['tempo','intervals'].includes(w.rt)).map(w=>w.day);
check('At least one quality run included (goal set)', hardDays.length>=1, hardDays.join(','));
check('Concurrent program validates without errors', await page.evaluate(()=>validateProgram(savedProgram,{}).ok));

// Strength session has real exercises (compound-anchored), not empty
const strSess = await page.evaluate(()=>savedProgram.sessions.find(s=>s.id==='strength'));
check('Concurrent strength session is compound-anchored', strSess && strSess.exercises.some(e=>/squat/i.test(e.name)), JSON.stringify(strSess?.exercises?.map(e=>e.name)));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
