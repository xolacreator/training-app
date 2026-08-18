
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(300);

// Programme started 3 weeks ago; log week 3 either fully, or with the long run skipped.
const run=(skipLong)=>page.evaluate((skipLong)=>{
  const d=new Date(); d.setDate(d.getDate()-35);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:10,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:11},(_,i)=>({week:i+1}))});
  const win=_weekWindow(5);
  const iso=off=>{ const x=new Date(win.start); x.setDate(x.getDate()+off); return x.toISOString().slice(0,10); };
  sessions.length=0;
  const days=[['Mon',0],['Wed',2]].concat(skipLong?[]:[['Sat',5]]);
  days.forEach(([dy,off])=>sessions.push({gid:'g'+dy,week:'5',day:dy,session:'Run',dist:'10',
    date:iso(off), ts:new Date(iso(off)+'T09:00:00').getTime()}));
  recomputeAthleteState();
  const rx=(id,w)=>_progressEndurance(savedProgram.sessions.find(s=>s.id===id), w, 11);
  const km=x=>parseFloat(String(x.distance||'0').replace(/[^\d.]/g,''))||0;
  return { w3long:km(rx('long',5)), w4long:km(rx('long',6)),
           w4held:!!rx('long',6).heldBack, w4reason:rx('long',6).heldReason||'',
           w4note:rx('long',6).note||'',
           w4tempo:rx('tempo',6).intervals, w4tempoHeld:!!rx('tempo',6).heldBack,
           missed:[..._missedRunTypes(5)] };
}, skipLong);

check('API exists', await page.evaluate(()=>
  ['_missedRunTypes','progressionHold'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

const full = await run(false);
const skipped = await run(true);

// ── THE TEST: skipping a key session makes the following week differ ────────
check('Control: a fully completed week progresses the long run', full.w4long>full.w3long,
  `w5=${full.w3long} → w6=${full.w4long}`);
check('Skipping the long run is detected', skipped.missed.includes('long'), JSON.stringify(skipped.missed));
check('THE FOLLOWING WEEK DIFFERS from the unskipped run', skipped.w4long!==full.w4long,
  `skipped w6=${skipped.w4long} vs completed w6=${full.w4long}`);
check('The missed session holds instead of progressing', skipped.w4long===skipped.w3long,
  `w5=${skipped.w3long} → w6=${skipped.w4long}`);

// ── It is SPECIFIC: only the missed session is held ────────────────────────
check('The session that was missed is flagged as held', skipped.w4held);
check('...with a reason naming the missed week', /missed last week/.test(skipped.w4reason), skipped.w4reason);
check('...and the athlete is told in the session note', /Held at last week/.test(skipped.w4note), skipped.w4note.slice(0,70));
check('Sessions that WERE completed still progress', skipped.w4tempoHeld===false && skipped.w4tempo===full.w4tempo,
  `${skipped.w4tempo} vs ${full.w4tempo}`);

// ── Guards ─────────────────────────────────────────────────────────────────
check('A completed week holds nothing', full.w4held===false && full.missed.length===0, JSON.stringify(full.missed));
check('A week with NOTHING logged is treated as not-yet-entered, not skipped', await page.evaluate(()=>{
  sessions.length=0; recomputeAthleteState();
  return _missedRunTypes(5).size===0; }));
check('Week 1 can never hold (no previous week)', await page.evaluate(()=>progressionHold('long',1,11)===null));
// Weeks 5 and 6 are deliberately used above: week 4 is a scheduled cutback
// (week % 4 === 0), so it drops regardless and cannot show a progression.
check('No hold when the program does not own those weeks', await page.evaluate(()=>
  progressionHold('long',4,999)===null));

// ── No recursion: absorption still computes ────────────────────────────────
check('computeWeekAbsorption still works (no recursion via the gate)', await page.evaluate(()=>{
  const a=computeWeekAbsorption(3);
  return a && typeof a.prescribed.km==='number'; }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
