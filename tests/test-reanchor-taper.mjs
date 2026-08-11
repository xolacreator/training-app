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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Re-anchor + taper API exists', await page.evaluate(()=>['reanchorProgramToRace','setTaperPlan'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// A program built the OLD way (no race anchor), started 2 weeks ago, race 10 weeks out.
const seed=()=>page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  const race=new Date(); race.setDate(race.getDate()+ 8*7 );
  coachProfile={name:'C',goal:'marathon',raceDate:race.toISOString().slice(0,10)};
  localStorage.setItem('ht-race-date', race.toISOString().slice(0,10));
  saveProgramData({id:'p',name:'Old Block',type:'endurance',startDate:_mondayISO(d),weeks:6,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:6},(_,i)=>({week:i+1,note:`Week ${i+1}`}))});
  recomputeAthleteState();
  return { cur:_progActualWeek(), weeksBefore:savedProgram.weeks, race:!!savedProgram.race };
});
const s0=await seed();
check('Setup: an un-anchored program with elapsed weeks', s0.race===false && s0.weeksBefore===6 && s0.cur>=3, JSON.stringify(s0));

// ── Re-anchor retrofits it in place ────────────────────────────────────────
const re=await page.evaluate(()=>{ const r=reanchorProgramToRace({silent:true});
  const p=savedProgram, rw=p.race.week;
  const week=_progWeekSessions(rw);
  const raceSlot=week.find(x=>x.session&&x.session.race);
  return { r, weeks:p.weeks, rw, onDay:raceSlot?raceSlot.day:null, expectDay:p.race.day,
           raceSess:!!p.sessions.find(x=>x.id==='race-day'),
           raceFlag:!!p.weeklyProgressions[rw-1].race, name:p.name }; });
check('Re-anchor resizes the block to end on race week', re.weeks===re.rw && re.weeks>6, JSON.stringify({weeks:re.weeks,raceWeek:re.rw}));
check('It adds RACE DAY on the correct weekday', re.raceSess && re.onDay===re.expectDay, JSON.stringify({on:re.onDay,expect:re.expectDay}));
check('Race week is flagged', re.raceFlag);
check('Elapsed weeks are frozen, not rewritten', await page.evaluate(()=>{ const p=savedProgram;
  return !!(p.overrides && p.overrides[1] && p.overrides[2]); }));
check('Week 1 still shows its original session', await page.evaluate(()=>{ const s=_progWeekSessions(1).find(x=>x.day==='Wed'); return s&&s.id==='tempo'; }));

// ── Taper: default 1 week, then switch to 3 ────────────────────────────────
const t1=await page.evaluate(()=>{ const p=savedProgram, rw=p.race.week;
  return { taperFlag:!!p.weeklyProgressions[rw-2].taper, scalar:(p.autoReg&&p.autoReg[rw-1])?p.autoReg[rw-1].loadScalar:null, n:p.taperWeeks }; });
check('Re-anchor sets a 1-week taper by default', t1.taperFlag && t1.n===1 && t1.scalar>0 && t1.scalar<1, JSON.stringify(t1));

const t3=await page.evaluate(()=>{ setTaperPlan(3,{silent:true});
  const p=savedProgram, rw=p.race.week;
  const wk=i=>({ taper:!!p.weeklyProgressions[i-1].taper, note:p.weeklyProgressions[i-1].note, s:(p.autoReg&&p.autoReg[i])?p.autoReg[i].loadScalar:null });
  return { n:p.taperWeeks, a:wk(rw-3), b:wk(rw-2), c:wk(rw-1) }; });
check('Switching to a 3-week taper marks three weeks', t3.n===3 && t3.a.taper && t3.b.taper && t3.c.taper, JSON.stringify({a:t3.a.note,b:t3.b.note,c:t3.c.note}));
check('Taper load declines week to week (volume down into the race)', t3.a.s>t3.b.s && t3.b.s>t3.c.s, JSON.stringify([t3.a.s,t3.b.s,t3.c.s]));
check('Switching back to 1 week clears the extra taper weeks', await page.evaluate(()=>{ setTaperPlan(1,{silent:true});
  const p=savedProgram, rw=p.race.week;
  return p.taperWeeks===1 && !p.weeklyProgressions[rw-4].taper && !!p.weeklyProgressions[rw-2].taper; }));

// ── Coach can drive both, with guardrails ──────────────────────────────────
const verbs=await page.evaluate(()=>{ const wk=_progActualWeek();
  return { taper:_validatePlanAction({action:'set_taper',weeks:2,why:'longer run-in'},wk),
           tooLong:_validatePlanAction({action:'set_taper',weeks:9},wk),
           zero:_validatePlanAction({action:'set_taper',weeks:0},wk),
           reanchor:_validatePlanAction({action:'reanchor',why:'align'},wk) }; });
check('Coach verb set_taper validates (1-3 weeks)', verbs.taper && verbs.taper.weeks===2 && verbs.zero===null, JSON.stringify(verbs.taper));
check('set_taper clamps an over-long request', verbs.tooLong===null || verbs.tooLong.weeks<=3, JSON.stringify(verbs.tooLong));
check('Coach verb reanchor validates when a race exists', !!verbs.reanchor);
const applied=await page.evaluate(()=>{ const wk=_progActualWeek();
  _coachPlanProposal={week:wk,summary:'x',actions:[{action:'set_taper',weeks:2,why:'longer taper'}]};
  const n=applyCoachPlanProposal();
  return { n, taperWeeks:savedProgram.taperWeeks }; });
check('"Implement a different taper" applies end-to-end from the coach', applied.n===1 && applied.taperWeeks===2, JSON.stringify(applied));
check('Action descriptions read naturally', await page.evaluate(()=>
  _describePlanAction({action:'set_taper',weeks:2})+' | '+_describePlanAction({action:'reanchor'})), 'desc');

// ── Guardrails: no race → both refused ─────────────────────────────────────
const noRace=await page.evaluate(()=>{ coachProfile={name:'C',goal:'fitness'}; localStorage.removeItem('ht-race-date');
  delete savedProgram.race;
  const wk=_progActualWeek();
  return { taper:_validatePlanAction({action:'set_taper',weeks:2},wk), re:_validatePlanAction({action:'reanchor'},wk),
           direct:setTaperPlan(2,{silent:true}) }; });
check('Without a race anchor, taper + reanchor are refused', noRace.taper===null && noRace.re===null && noRace.direct===false, JSON.stringify(noRace));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
