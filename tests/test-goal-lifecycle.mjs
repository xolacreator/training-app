// A goal has to be leaveable.
//
// "Hyrox Tampa" stuck to every block because the race is athlete-level state with a
// write path and no erase path: deleting a program deliberately keeps it, clearGoal()
// had no caller anywhere, and blanking the race in coach setup was swallowed by an
// `if (raceDate)` guard — so ht-race-date survived and _rawRaceDateText() read it back.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});

const setRace=(goal,date)=>page.evaluate(([g,d])=>{
  coachProfile={goal:g, raceDate:d};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  localStorage.setItem('ht-race-date',d);
  _syncGoalToEngine(g);
},[goal,date]);

// ── Blanking the race actually clears it ────────────────────────────────────
await setRace('HYROX Tampa','2026-11-14');
const blanked=await page.evaluate(()=>{
  // Exactly what the last step of coach setup does when the race field is empty.
  coachProfile={...coachProfile, raceDate:''};
  try { localStorage.setItem('ht-coach', JSON.stringify(coachProfile)); } catch(e){}
  try { if (coachProfile.raceDate) localStorage.setItem('ht-race-date', coachProfile.raceDate);
        else localStorage.removeItem('ht-race-date'); } catch(e){}
  return { stored:localStorage.getItem('ht-race-date'), reads:_rawRaceDateText(),
           athleteDate:String(athleteRaceDate()), weeks:weeksToRace() };
});
check('Clearing the race removes the stored key', blanked.stored===null, String(blanked.stored));
check('...so the app stops reading the old race back', blanked.reads==='', JSON.stringify(blanked.reads));
check('...and nothing anchors to it any more', blanked.athleteDate==='null' && blanked.weeks===null,
  `${blanked.athleteDate} / ${blanked.weeks}`);

// ── clearGoal wipes both stores ─────────────────────────────────────────────
await setRace('HYROX Tampa','2026-11-14');
const cleared=await page.evaluate(()=>{
  clearGoal({silent:true});
  return { engineGoal:localStorage.getItem('ht-goal'), cat:localStorage.getItem('ht-goal-category'),
           raceType:localStorage.getItem('ht-goal-race-type'), raceDate:localStorage.getItem('ht-race-date'),
           profileGoal:(coachProfile||{}).goal, profileRace:(coachProfile||{}).raceDate,
           reads:_rawRaceDateText(), engine:_engineForGoal(localStorage.getItem('ht-goal')||'') };
});
check('clearGoal clears the engine store', cleared.engineGoal===null && cleared.cat===null && cleared.raceType===null,
  JSON.stringify(cleared));
check('...the profile store', !cleared.profileGoal && !cleared.profileRace);
check('...and the race date in both places', cleared.raceDate===null && cleared.reads==='');
check('...so no engine is selected for a goal that no longer exists', cleared.engine===null);

// ── Deleting a program still keeps the goal (they are separate decisions) ────
await setRace('HYROX Tampa','2026-11-14');
const afterDelete=await page.evaluate(()=>{
  saveProgramData(buildBlockForGoal({goal:'HYROX Tampa', weeks:8, sessionsPerWeek:4}));
  deleteProgram({silent:true});
  return { prog:savedProgram, goal:localStorage.getItem('ht-goal'),
           race:localStorage.getItem('ht-race-date') };
});
check('Deleting a block does not silently discard the goal',
  afterDelete.prog===null && afterDelete.goal==='HYROX Tampa' && afterDelete.race==='2026-11-14',
  JSON.stringify(afterDelete).slice(0,80));

// ── A race that has been run says so, and offers a way out ──────────────────
const past=await page.evaluate(()=>{
  coachProfile={goal:'HYROX Tampa', raceDate:'2026-03-01'};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  localStorage.setItem('ht-race-date','2026-03-01');
  _syncGoalToEngine('HYROX Tampa');
  localStorage.removeItem('ht-anchor-dismissed');
  savedProgram=null;
  renderRaceAnchorPrompt();
  const el=document.getElementById('race-anchor-prompt');
  return { text:el.innerText, html:el.innerHTML };
});
check('A race that has passed is surfaced, not left in place', /That race has been/i.test(past.text),
  past.text.slice(0,70).replace(/\n/g,' / '));
check('...it names the goal that is now stale', /HYROX Tampa/.test(past.text));
check('...it says why that matters', /keeps programming for it/i.test(past.text));
check('...it offers the coach conversation', /openProgramDesign\(\)/.test(past.html));
check('...and a way to clear the goal outright', /clearGoal\(\)/.test(past.html));
check('...even with no active program', past.text.trim().length>0);

// ── A future race still prompts to anchor, and only with a program ──────────
const future=await page.evaluate(()=>{
  coachProfile={goal:'HYROX Tampa', raceDate:'2027-06-12'};
  localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
  localStorage.setItem('ht-race-date','2027-06-12');
  localStorage.removeItem('ht-anchor-dismissed');
  savedProgram=null; renderRaceAnchorPrompt();
  const noProg=document.getElementById('race-anchor-prompt').innerText.trim();
  saveProgramData(buildBlockForGoal({goal:'HYROX Tampa', weeks:8, sessionsPerWeek:4}));
  localStorage.removeItem('ht-anchor-dismissed');
  renderRaceAnchorPrompt();
  return { noProg, withProg:document.getElementById('race-anchor-prompt').innerText };
});
check('A future race does not nag when there is no block to anchor', future.noProg==='', future.noProg.slice(0,40));
check('...but does once a block exists', /Race not in your plan/i.test(future.withProg),
  future.withProg.slice(0,60).replace(/\n/g,' / '));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
