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

check('Classify API exists', await page.evaluate(()=>typeof _classifyRun==='function' && typeof stravaClassify==='function' && typeof _runBucket==='function'));

// ── Structure-aware classification ──────────────────────────────────────────
const cls=await page.evaluate(()=>{
  const mk=(speeds,hr,avg)=>({sport_type:'Run',average_speed:avg,average_heartrate:hr,strava_splits:speeds.map(v=>({distance:1000,moving_time:Math.round(1000/v),average_speed:v,average_heartrate:hr}))});
  // interval: alternating fast/slow km → big spread (avg pace ~4:40 would fool the old avg-only rule)
  const intervals=mk([5.0,3.1,5.0,3.1,5.0,3.1],168,3.6);
  const steady=mk([3.2,3.21,3.19,3.2,3.2],140,3.2);         // ~5:12/km easy
  const tempo=mk([3.57,3.57,3.56,3.58,3.57],160,3.57);      // ~4:40/km sustained + high HR
  return { iv:stravaClassify(intervals), easy:stravaClassify(steady), tempo:stravaClassify(tempo) };
});
check('Interval workout → "Intervals" (not Zone 2, despite the avg pace)', cls.iv==='Intervals', cls.iv);
check('Steady easy run → "Zone 2 Run"', cls.easy==='Zone 2 Run', cls.easy);
check('Sustained fast + high HR → "Tempo Run"', cls.tempo==='Tempo Run', cls.tempo);
check('No en/em dash in any run label', ![cls.iv,cls.easy,cls.tempo].some(l=>/[—–]/.test(l)), JSON.stringify(cls));

// ── Plan inheritance: label matches EFFORT, not just the calendar day ────────
await page.evaluate(()=>{
  const mon=_mondayISO(new Date());
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:mon,weeks:6,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Threshold',runType:'tempo'}],
    dayMap:['easy',null,'tempo',null,null,null,null],   // Mon easy, Wed tempo
    weeklyProgressions:Array.from({length:7},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  window.__mon=mon;
});
const mismatch=await page.evaluate(()=>{
  const mon=window.__mon;
  const sp=[5.0,3.1,5.0,3.1,5.0,3.1].map(v=>({distance:1000,moving_time:Math.round(1000/v),average_speed:v,average_heartrate:170}));
  const act={id:'m1',sport_type:'Run',start_date_local:mon+'T07:00:00',distance:9000,average_speed:3.6,average_heartrate:170,elapsed_time:2600,strava_splits:sp,source:'Strava',name:'Morning Run'};
  const r=_activityToSession(act,{allowOutOfRange:true});
  return { name:r.session.session, linked:!!r.session.progId };
});
check('Hard intervals on the EASY-run day → labelled "Intervals", not "Easy Run"', mismatch.name==='Intervals', mismatch.name);
check('…and NOT falsely linked to the easy session as complete', mismatch.linked===false, JSON.stringify(mismatch));

const matchTempo=await page.evaluate(()=>{
  const mon=window.__mon; const wed=new Date(mon+'T00:00:00'); wed.setDate(wed.getDate()+2); const wISO=wed.toISOString().slice(0,10);
  const sp=[3.57,3.57,3.56,3.58,3.57].map(v=>({distance:1000,moving_time:Math.round(1000/v),average_speed:v,average_heartrate:162}));
  const act={id:'m2',sport_type:'Run',start_date_local:wISO+'T07:00:00',distance:8000,average_speed:3.57,average_heartrate:162,elapsed_time:2240,strava_splits:sp,source:'Strava',name:'Lunch Run'};
  const r=_activityToSession(act,{allowOutOfRange:true});
  return { name:r.session.session, linked:!!r.session.progId };
});
check('Tempo run on the TEMPO day → inherits planned name + links for completion', matchTempo.name==='Threshold' && matchTempo.linked===true, JSON.stringify(matchTempo));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
