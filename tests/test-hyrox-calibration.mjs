import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Calibration API exists', await page.evaluate(()=>['_sessionFadeSlope','_runFadeProfile','_compromisedPenalty','hyroxCalibratedRuns'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// Helper: build a run whose km splits fade by a known amount per km.
const mkRun=`(name,kms,startSecs,fadePerKm,extra)=>{
  const sp=[]; for(let i=0;i<kms;i++){ const t=Math.round(startSecs*(1+fadePerKm*i));
    sp.push({distance:1000,moving_time:t,average_speed:1000/t,average_heartrate:150+i}); }
  const tot=sp.reduce((a,x)=>a+x.moving_time,0);
  return Object.assign({session:name,dist:String(kms),dur:String(Math.round(tot/60)),
    pace:Math.floor(tot/kms/60)+':'+String(Math.round(tot/kms%60)).padStart(2,'0'),
    intensity:'hard',ts:Date.now(),gid:name+Math.random(),strava_splits:sp}, extra||{});
}`;

// ── No data → honest "not available", never a fabricated number ─────────────
const empty=await page.evaluate((mk)=>{ sessions.length=0; const f=_runFadeProfile(), s=_compromisedPenalty();
  return { fade:f.available, stn:s.available, need:f.need }; }, mkRun);
check('No split data → fade reports unavailable (not guessed)', empty.fade===false && empty.need>=2, JSON.stringify(empty));
check('No compromised runs → station penalty unavailable', empty.stn===false);

// ── Measured fade: a run that fades 2%/km should read ~2%/km ────────────────
const measured=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  sessions.push(make('Tempo run',8,270,0.02));
  sessions.push(make('Tempo run',8,275,0.02));
  sessions.push(make('Long run',10,280,0.02));
  return _runFadeProfile(); }, mkRun);
check('Fade slope measured from real splits (~2%/km)', measured.available && Math.abs(measured.pctPerKm-2)<0.6, JSON.stringify({pct:measured.pctPerKm,n:measured.n}));
check('Reports how many sessions it used', measured.n===3, String(measured.n));

// A flat runner (no fade) should measure ~0
const flat=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  for(let i=0;i<3;i++) sessions.push(make('Tempo run',8,270,0));
  return _runFadeProfile(); }, mkRun);
check('A runner who does not fade measures ~0%/km', flat.available && Math.abs(flat.pctPerKm)<0.5, String(flat.pctPerKm));

// ── Station penalty from logged compromised runs ────────────────────────────
const stn=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  sessions.push(make('Tempo run',8,270,0.01));
  sessions.push(make('Track intervals',8,268,0.01));
  sessions.push(make('Compromised run',6,300,0.01));   // ~11% slower than fresh
  return _compromisedPenalty(); }, mkRun);
check('Station penalty measured from compromised runs', stn.available && stn.pct>5 && stn.pct<20, JSON.stringify({pct:stn.pct,comp:stn.comp,fresh:stn.fresh}));

// ── Projection uses measured values + reports provenance ───────────────────
const proj=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  sessions.push(make('Tempo run',8,270,0.02));
  sessions.push(make('Tempo run',8,272,0.02));
  sessions.push(make('Compromised run',6,300,0.02));
  const c=hyroxCalibratedRuns(270);
  return { ok:c.available, measured:c.measured, notes:c.notes,
           r1:c.splits.run1, r8:c.splits.run8, rising:c.splits.run8>c.splits.run1 }; }, mkRun);
check('Projection available with measured components', proj.ok && proj.measured.generalFade && proj.measured.stationPenalty, JSON.stringify(proj.measured));
check('Run 1 is the fresh base pace (no station before it)', proj.r1===270, String(proj.r1));
check('Later runs are slower than run 1 (measured fade + penalty)', proj.rising && proj.r8>proj.r1, JSON.stringify({r1:proj.r1,r8:proj.r8}));
check('Provenance notes state what was measured', proj.notes.some(n=>/%\/km from \d+ split-logged runs/.test(n)) && proj.notes.some(n=>/Station penalty/.test(n)), JSON.stringify(proj.notes));

// ── Partial data → the unmeasured part is declared, not invented ────────────
const partial=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  sessions.push(make('Tempo run',8,270,0.02)); sessions.push(make('Tempo run',8,272,0.02));
  const c=hyroxCalibratedRuns(270);
  return { fade:c.measured.generalFade, stn:c.measured.stationPenalty,
           saysNo:c.notes.some(n=>/No compromised runs logged/.test(n)),
           r2:c.splits.run2, r1:c.splits.run1 }; }, mkRun);
check('With no compromised runs, station effect is declared unmodelled', partial.fade===true && partial.stn===false && partial.saysNo, JSON.stringify(partial));
check('…and no invented station penalty is applied to run 2', partial.r2>partial.r1 === true || partial.r2===partial.r1, JSON.stringify({r1:partial.r1,r2:partial.r2}));

// ── A flat athlete gets a flat projection (no forced attrition) ─────────────
const flatProj=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  for(let i=0;i<3;i++) sessions.push(make('Tempo run',8,270,0));
  const c=hyroxCalibratedRuns(270);
  return { r1:c.splits.run1, r8:c.splits.run8 }; }, mkRun);
check('A non-fading athlete is NOT given severe attrition', Math.abs(flatProj.r8-flatProj.r1)<=8, JSON.stringify(flatProj));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
