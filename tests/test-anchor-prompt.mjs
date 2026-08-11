import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-anchor-dismissed');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Prompt API exists', await page.evaluate(()=>['renderRaceAnchorPrompt','dismissRaceAnchor','_rawRaceDateText'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

const seed=(raceText)=>page.evaluate((rt)=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  coachProfile={name:'C',goal:'marathon',raceDate:rt};
  try{ rt?localStorage.setItem('ht-race-date',rt):localStorage.removeItem('ht-race-date'); }catch(e){}
  localStorage.removeItem('ht-anchor-dismissed');
  saveProgramData({id:'p'+Math.random(),name:'Old Block',type:'endurance',startDate:_mondayISO(d),weeks:6,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'}],
    dayMap:['easy',null,'tempo',null,null,null,null],
    weeklyProgressions:Array.from({length:6},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(_progActualWeek());
  return document.getElementById('race-anchor-prompt').innerHTML;
}, raceText);

// ── Readable future race → clear call to action, no Edit mode required ──────
const future=new Date(Date.now()+70*86400000).toISOString().slice(0,10);
const good=await seed(future);
check('Prompt appears on the Plan screen (not hidden in Edit mode)', /Race not in your plan/.test(good), good.slice(0,60));
check('It states the race date + countdown', /\d+ days/.test(good) && /Anchor to race day/.test(good));
check('It explains what anchoring does', /race day|taper/i.test(good));

// ── Tapping it anchors the program, and the prompt then disappears ──────────
const anchored=await page.evaluate(()=>{ reanchorProgramToRace({silent:true});
  renderPlan(_progActualWeek());
  return { hasRace:!!savedProgram.race, prompt:document.getElementById('race-anchor-prompt').innerHTML.trim() }; });
check('Anchoring works from the prompt', anchored.hasRace);
check('Prompt disappears once anchored (no nagging)', anchored.prompt==='', JSON.stringify(anchored.prompt.slice(0,40)));

// ── Unreadable date → says so, with formats, instead of vanishing ───────────
const bad=await seed('sometime in the spring');
check('Unreadable date shows an explanation, not silence', /Race date not readable/.test(bad), bad.slice(0,60));
check('It quotes what the athlete entered', /sometime in the spring/.test(bad));
check('It lists accepted formats', /2026-06-20/.test(bad) && /HYROX Sydney Nov 2026/.test(bad));
check('It offers a way to fix it', /Fix my race date/.test(bad) && /openCoachSetup/.test(bad));

// ── Past date → explains it has passed ─────────────────────────────────────
const past=await seed('Jan 1 2020');
check('A past race date is explained as passed', /Race date not readable/.test(past) && /has passed/.test(past), past.slice(0,80));

// ── No race set → stays quiet ──────────────────────────────────────────────
const none=await seed('');
check('No race date → no prompt at all (no nagging)', none.trim()==='', JSON.stringify(none.slice(0,40)));

// ── Dismissible, and the dismissal sticks for that program ─────────────────
const dismissed=await (async()=>{ await seed(future);
  return await page.evaluate(()=>{ dismissRaceAnchor(); renderPlan(_progActualWeek());
    return document.getElementById('race-anchor-prompt').innerHTML.trim(); }); })();
check('"Not now" dismisses the prompt', dismissed==='', JSON.stringify(dismissed.slice(0,40)));
check('A NEW program shows the prompt again', await (async()=>{ const h=await seed(future); return /Race not in your plan/.test(h); })());

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
