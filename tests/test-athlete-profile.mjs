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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Profile API exists', await page.evaluate(()=>
  typeof athleteProfile==='function' && typeof openAthleteProfile==='function' && typeof _vdotFromBestRun==='function' && typeof _progressTrends==='function'));

// ── VDOT: a 20:00 5K estimates ~VO2 49-50 (Daniels/Gilbert validation)
const vdot=await page.evaluate(()=>{
  const splits=[]; for(let i=0;i<5;i++) splits.push({distance:1000,moving_time:240,average_speed:1000/240}); // 5×4:00 = 20:00 5K
  sessions.length=0; sessions.push({week:'1',day:'Sat',session:'5K time trial',dist:'5',pace:'4:00',date:todayISO(),ts:Date.now(),gid:'tt',strava_splits:splits});
  return _vdotFromBestRun();
});
check('VO₂ estimated from a 20:00 5K (~49-50)', vdot && vdot.value>=47 && vdot.value<=52 && vdot.source==='5K PR', JSON.stringify(vdot));

// ── The composite now includes the run-based estimate (no assessment needed)
const comp=await page.evaluate(()=>{ baselines={}; return computeVO2maxComposite(); });
check('VO₂max composite is populated from run data alone (no Cooper test)', comp && comp.value>=45 && comp.value<=55 && comp.sources.includes('5K PR'), JSON.stringify(comp));

// ── Profile object ties fitness + PBs + trends together
await page.evaluate(()=>{
  baselines={'run-cooper':{run_threshold_pace:'4:20',run_zone2_lo_pace:'5:30',run_zone2_hi_pace:'5:50',run_vo2max_pace:'3:55'},'strength-base':{squat_1rm_est:140,bench_1rm_est:100}};
  baselines.vo2max_composite=computeVO2maxComposite();
});
const prof=await page.evaluate(()=>athleteProfile());
check('Profile carries VO₂ + fitness baselines + PBs', prof.vo2 && prof.vo2.value>0 && prof.fitness.length>=3 && prof.pbs.length>=1, JSON.stringify({vo2:prof.vo2&&prof.vo2.value,fit:prof.fitness.length,pbs:prof.pbs.length}));
check('VO₂ tagged estimated (no Cooper) — measured:false', prof.vo2.measured===false, JSON.stringify(prof.vo2));

// ── With a Cooper test, VO₂ is measured
const measured=await page.evaluate(()=>{ baselines['run-cooper'].vo2max_predicted=52; baselines.vo2max_composite=computeVO2maxComposite(); return athleteProfile().vo2; });
check('With Cooper test → VO₂ measured:true', measured.measured===true && measured.sources.includes('Cooper Test'), JSON.stringify(measured));

// ── Progress trends: recent 4wk faster than prior 4wk → pace "up/better"
const trends=await page.evaluate(()=>{
  sessions.length=0;
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  // prior 4wk (28-56d ago): slower ~5:10; recent 4wk: faster ~4:50
  for(let i=30;i<50;i+=6) sessions.push({session:'Run',dist:'8',pace:'5:10',date:iso(i),ts:Date.now()-i*86400000,gid:'p'+i});
  for(let i=2;i<26;i+=6) sessions.push({session:'Run',dist:'10',pace:'4:50',date:iso(i),ts:Date.now()-i*86400000,gid:'r'+i});
  return _progressTrends();
});
check('Trends computed for pace/volume/load', trends.length>=2 && trends.every(t=>t.metric&&t.dir&&t.detail), trends.map(t=>`${t.metric}:${t.dir}`).join(','));
const paceT=await page.evaluate(()=>_progressTrends().find(t=>/pace/i.test(t.metric)));
check('Faster recent pace → pace trend up + better', paceT && paceT.dir==='up' && paceT.better===true, JSON.stringify(paceT));

// ── Profile renders in the sheet with all sections
const ui=await page.evaluate(()=>{
  baselines={'run-cooper':{run_threshold_pace:'4:20',vo2max_predicted:52},'strength-base':{squat_1rm_est:140}};
  baselines.vo2max_composite=computeVO2maxComposite();
  openAthleteProfile();
  const h=document.getElementById('ins-content').innerHTML;
  return { open:document.getElementById('ins-sheet').classList.contains('open'), title:/Athlete Profile/.test(h), vo2:/VO₂max/.test(h), fitness:/Fitness baselines/.test(h), progress:/Progress · 4 wk/.test(h) };
});
check('Profile sheet opens with VO₂ + fitness + progress sections', ui.open && ui.title && ui.vo2 && ui.fitness && ui.progress, JSON.stringify(ui));

// ── No VO2 data → clear guidance to add it
const empty=await page.evaluate(()=>{ baselines={}; sessions.length=0; openAthleteProfile(); const h=document.getElementById('ins-content').innerHTML; return /No VO₂max yet/.test(h)&&/Cooper 12-min test|Fetch Strava splits/.test(h); });
check('No VO₂ data → shows how to add it (splits or Cooper test)', empty);

// ── Stats screen has the Profile entry
const entry=await page.evaluate(()=>{ nav('stats',document.querySelectorAll('.nb')[3]); const el=document.getElementById('profile-entry'); return !!el && /openAthleteProfile/.test(el.getAttribute('onclick')||''); });
check('Stats screen exposes the Athlete Profile entry', entry);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
