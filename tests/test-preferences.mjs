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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── Model exists (L/P/A/A per day/category)
check('Preferences model exists (statuses + API)', await page.evaluate(()=>
  Array.isArray(AVAIL_STATUSES) && ['preferred','available','avoid','locked'].every(s=>AVAIL_STATUSES.includes(s)) &&
  typeof setDayStatus==='function' && typeof availabilityForDay==='function' && typeof _sessionCategoryId==='function'));

// ── Session → category mapping
const cats=await page.evaluate(()=>({
  tempo:_sessionCategoryId({type:'endurance',runType:'tempo'}),
  long:_sessionCategoryId({type:'endurance',runType:'long'}),
  intervals:_sessionCategoryId({type:'endurance',runType:'intervals'}),
  strength:_sessionCategoryId({type:'strength'}),
  fitstop:_sessionCategoryId({type:'fitstop'}),
}));
check('Session→category maps run types + strength + fitstop', cats.tempo==='workout-run'&&cats.long==='long-run'&&cats.intervals==='track'&&cats.strength==='strength'&&cats.fitstop==='fitstop', JSON.stringify(cats));

// ── BUILDER: nothing is placed on an Avoid day; Locked is honored
const build=await page.evaluate(()=>{
  athleteAvailability={version:1,days:{}};
  // Only Mon/Tue/Wed available for running; Wed is AVOID for workout; Sat LOCKED long-run
  ['Mon','Tue','Wed'].forEach(d=>{ setDayStatus(d,'easy-run','available'); setDayStatus(d,'workout-run','available'); });
  setDayStatus('Wed','workout-run','avoid');
  setDayStatus('Sat','long-run','locked');
  saveAvailability();
  const {assigned,explanations,unplaced}=scheduleWeek(['long-endurance','threshold','aerobic-base'],{allowedDays:['Mon','Tue','Wed','Sat']});
  return {assigned,unplaced};
});
check('Locked long-run is fixed on Sat', build.assigned.Sat && build.assigned.Sat.locked===true && build.assigned.Sat.category==='long-run', JSON.stringify(build.assigned.Sat));
check('Nothing scheduled with an Avoid tag on Wed (workout-run)', !(build.assigned.Wed && build.assigned.Wed.category==='workout-run'), JSON.stringify(build.assigned.Wed||null));
check('All placements avoid the Avoid tag', await page.evaluate(()=>{
  const {assigned}=scheduleWeek(['long-endurance','threshold','aerobic-base'],{allowedDays:['Mon','Tue','Wed','Sat']});
  return Object.entries(assigned).every(([day,s])=> getDayStatus(day,s.category)!=='avoid');
}));

// ── BUILDER: an Avoid-only situation leaves the objective UNPLACED, never forced onto Avoid
const strict=await page.evaluate(()=>{
  athleteAvailability={version:1,days:{}};
  // vo2max can use track OR workout-run — mark BOTH avoid on the only allowed day
  setDayStatus('Mon','track','avoid'); setDayStatus('Mon','workout-run','avoid');
  saveAvailability();
  const {assigned,unplaced}=scheduleWeek(['vo2max'],{allowedDays:['Mon']});
  return {placedOnMon:!!assigned.Mon, unplaced};
});
check('Avoid is a hard constraint — objective unplaced, not forced onto Avoid', strict.placedOnMon===false && strict.unplaced.length>=1, JSON.stringify(strict));

// ── RESCHEDULER: never moves onto an Avoid day
await page.evaluate(()=>{
  athleteAvailability={version:1,days:{}}; saveAvailability();
  saveProgramData({ id:'r1', name:'Blk', type:'endurance', startDate:_mondayISO(new Date()), weeks:4, sessionsPerWeek:4,
    sessions:[{id:'q',type:'endurance',name:'Threshold',runType:'tempo'},{id:'e',type:'endurance',name:'Easy',runType:'easy'}],
    dayMap:['q','e','e','e','e','e','e'],   // Mon hard, rest easy
    weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}] });
});
const resAvoid=await page.evaluate(()=>{
  // Mark Wed & Thu as AVOID for workout-run so the move can't land there
  setDayStatus('Wed','workout-run','avoid'); setDayStatus('Thu','workout-run','avoid'); saveAvailability();
  const s=suggestReschedule({week:1,day:'Mon',readiness:40});
  return s;
});
check('Reschedule proposes a move on low readiness', resAvoid && resAvoid.fromDay==='Mon' && !!resAvoid.toDay, JSON.stringify(resAvoid));
check('Reschedule never targets an Avoid day', resAvoid && resAvoid.toDay!=='Wed' && resAvoid.toDay!=='Thu', resAvoid&&resAvoid.toDay);

// ── RESCHEDULER: prefers a Preferred day among legal targets
const resPref=await page.evaluate(()=>{
  athleteAvailability={version:1,days:{}}; setDayStatus('Fri','workout-run','preferred'); saveAvailability();
  return suggestReschedule({week:1,day:'Mon',readiness:40});
});
check('Reschedule prefers a Preferred day when available', resPref && resPref.toDay==='Fri' && /prefer/i.test(resPref.reason), JSON.stringify(resPref&&{to:resPref.toDay}));

// ── RESCHEDULER: Locked session is immovable
const resLock=await page.evaluate(()=>{
  athleteAvailability={version:1,days:{}}; setDayStatus('Mon','workout-run','locked'); saveAvailability();
  return suggestReschedule({week:1,day:'Mon',readiness:40});
});
check('Locked session is immovable — no reschedule proposed', resLock===null, JSON.stringify(resLock));

// ── AthleteState surfaces grouped preferences
const asPref=await page.evaluate(()=>{
  athleteAvailability={version:1,days:{}}; setDayStatus('Sat','long-run','locked'); setDayStatus('Mon','workout-run','preferred'); saveAvailability();
  recomputeAthleteState(); return athleteState().preferences;
});
check('AthleteState.preferences groups per-day L/P/A/A', asPref && asPref.Sat && asPref.Sat.locked.includes('long-run') && asPref.Mon && asPref.Mon.preferred.includes('workout-run'), JSON.stringify(asPref));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
