import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

// Mock the worker /activity GET to return two workouts
await page.route('**/activity*', route=>{
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {_id:'w1',name:'Running',sport:'Running',start:'2026-06-20T07:00:00Z',distance_km:8.02,duration_s:2400,avg_hr:154},
    {_id:'w2',name:'Strength',sport:'WeightTraining',start:'2026-06-21T18:00:00Z',distance_km:0,duration_s:3000,avg_hr:120},
  ])});
});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');
  localStorage.setItem('ht-strava-worker','https://mock.workers.dev'); localStorage.setItem('ht-activity-token','tok123');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(500);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Card shows the auto-import section with the token prefilled
await page.evaluate(()=>{ nav('more',document.querySelectorAll('.nb')[4]); renderStravaCard(); });
await page.waitForTimeout(150);
const cardTxt=await page.evaluate(()=>document.getElementById('strava-card').innerText);
  const cardHtml=await page.evaluate(()=>document.getElementById('strava-card').innerHTML);
check('Auto-import section present', /auto-import from apple health/i.test(cardTxt));
check('Setup guide mentions Health Auto Export + /activity', /health auto export/i.test(cardHtml) && /\/activity/i.test(cardHtml));
const tokVal=await page.evaluate(()=>document.getElementById('activity-token-input')?.value);
check('Token field prefilled from storage', tokVal==='tok123', tokVal);

// Run the fetch → imports 2 sessions
await page.evaluate(()=>syncActivitiesFromHealth(false));
await page.waitForTimeout(400);
const imported=await page.evaluate(()=>sessions.filter(s=>s.gid&&s.gid.startsWith('health-')).map(s=>({g:s.gid,sess:s.session,dist:s.dist,dur:s.dur,hr:s.hr})));
check('Both Apple Health workouts imported', imported.length===2, JSON.stringify(imported));
check('Run workout has distance+pace', imported.some(s=>s.dist==='8.02'&&s.dur==='40'), JSON.stringify(imported.find(s=>s.dist==='8.02')));
check('Strength workout imported (no distance)', imported.some(s=>(!s.dist||s.dist==='')&&s.dur==='50'), JSON.stringify(imported.find(s=>s.dur==='50')));

// Re-run → dedup, nothing new
await page.evaluate(()=>syncActivitiesFromHealth(false));
await page.waitForTimeout(300);
const after=await page.evaluate(()=>sessions.filter(s=>s.gid&&s.gid.startsWith('health-')).length);
check('Re-check dedups (still 2)', after===2, 'got '+after);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
